import type {
  ProcessRssObservation,
  QuotaCatalog,
  QuotaChange,
  QuotaChangeReceipt,
  QuotaEdit,
  QuotaField,
  QuotaManagementUsage,
  QuotaPreview,
  QuotaResource,
  QuotaUsage,
  WebTlsQuotaUsage,
} from '#/api/core/resource-quota';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  findQuotaChange,
  getGatewayQuotaUsage,
  getQuotaCatalog,
  getQuotaChange,
  isQuotaResource,
  previewQuotaChange,
  submitQuotaChange,
} from '#/api/core/resource-quota';

import { effective, quotaText } from './presentation';

interface RetainedChange {
  change: QuotaChange;
  operationId?: string;
  resource: QuotaResource;
}

export type QuotaFieldComparison =
  | 'different'
  | 'restart-pending'
  | 'unconfirmed';

function storageKey(owner: number | string) {
  return `ng-resource-quota-change:${owner}`;
}

function readRetained(owner: number | string): RetainedChange | undefined {
  const value = localStorage.getItem(storageKey(owner));
  if (!value) return undefined;
  const parsed = JSON.parse(value) as Partial<RetainedChange>;
  const resource = parsed.resource ?? 'extension-store';
  const change = parsed.change;
  if (
    !change?.edit ||
    !/^[0-9a-f]{32}$/.test(change.requestId) ||
    !isQuotaResource(resource)
  ) {
    throw new Error('Invalid retained quota change');
  }
  return { change, operationId: parsed.operationId, resource };
}

function newRequestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Retain the original request and compare against both live versions before saving. */
export function useQuotaConsole() {
  const user = useUserStore();
  const principal = computed(() => user.userInfo?.id);
  const resource = ref<QuotaResource>('extension-store');
  const drafts = new Map<QuotaResource, Partial<Record<QuotaField, string>>>();
  const catalog = ref<QuotaCatalog>();
  const running = ref<QuotaUsage>();
  const processRss = ref<ProcessRssObservation>();
  const quotaManagement = ref<QuotaManagementUsage>();

  const tls = ref<WebTlsQuotaUsage>();
  const catalogFresh = ref(false);
  const runtimeFresh = ref(false);
  const loaded = ref(false);
  const refreshing = ref(false);
  const working = ref(false);
  const editOpen = ref(false);
  const editValues = ref<Partial<Record<QuotaField, string>>>({});
  const preview = ref<{ edit: QuotaEdit; result: QuotaPreview }>();
  const retained = ref<RetainedChange>();
  const receipt = ref<QuotaChangeReceipt>();
  const editFault = ref('');
  const operationFault = ref('');
  let epoch = 0;
  let nextPoll = 0;
  let sampler: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const fields = computed(() => catalog.value?.fields ?? []);
  const writable = computed(() =>
    fields.value.filter((field) => field.writable),
  );
  const configured = computed(() => !!catalog.value?.canConfigure);
  const writerBlock = computed(() => {
    if (!configured.value || !catalogFresh.value) return '';
    switch (catalog.value?.writerAvailability) {
      case 'CHANGE_PENDING': {
        return quotaText('quotaWriterPending');
      }
      case 'HISTORY_FULL': {
        return quotaText('quotaHistoryFull');
      }
      default: {
        return '';
      }
    }
  });
  const finished = computed(() =>
    ['APPLIED', 'PERMISSION_REVOKED', 'SOURCE_CONFLICT'].includes(
      receipt.value?.phase ?? '',
    ),
  );
  const waitingForRestart = computed(
    () =>
      receipt.value?.pendingActivation === 'PROCESS_RESTART' &&
      receipt.value.phase === 'DESIRED_COMMITTED',
  );
  const comparison = computed(() => {
    const configuration = catalog.value;
    const sample = running.value;
    if (!catalogFresh.value || !runtimeFresh.value || !configuration || !sample)
      return undefined;

    const pending = retained.value;
    const restartPatch =
      waitingForRestart.value &&
      pending?.resource === resource.value &&
      receipt.value?.sourceAfter === configuration.sourceHash
        ? pending.change.edit.patch
        : undefined;
    const byField = new Map<QuotaField, QuotaFieldComparison>();
    let differs = false;
    let pendingRestart = false;
    let unconfirmed = false;
    for (const {
      desired,
      effectMode,
      key,
      persisted,
    } of configuration.fields) {
      const current = effective(sample, key);
      if (current === undefined) {
        byField.set(key, 'unconfirmed');
        unconfirmed = true;
      } else if (current !== desired) {
        if (
          effectMode === 'RESTART_PROCESS' &&
          restartPatch?.[key] === desired &&
          persisted === desired
        ) {
          byField.set(key, 'restart-pending');
          pendingRestart = true;
        } else {
          byField.set(key, 'different');
          differs = true;
        }
      }
    }
    return { byField, differs, pendingRestart, unconfirmed };
  });
  const readyForEdit = computed(
    () =>
      configured.value &&
      !!running.value?.accepting &&
      (resource.value !== 'engineering-assets' ||
        ('cachedModels' in running.value &&
          running.value.assetStoreAvailable === true)) &&
      (resource.value !== 'engineering-publication' ||
        ('maxPublications' in running.value &&
          running.value.storage !== null)) &&
      comparison.value?.byField.size === 0 &&
      !writerBlock.value &&
      writable.value.length > 0,
  );
  const mayPreview = computed(() => readyForEdit.value && !retained.value);
  const mayStart = computed(
    () => readyForEdit.value && (!retained.value || finished.value),
  );
  const mayRetry = computed(
    () =>
      configured.value &&
      catalogFresh.value &&
      !!retained.value &&
      !finished.value &&
      !waitingForRestart.value,
  );
  const edited = computed(() =>
    writable.value.filter(
      ({ desired, key }) =>
        editValues.value[key] !== undefined &&
        editValues.value[key] !== desired,
    ),
  );
  const fieldErrors = computed(() => {
    const errors: Partial<Record<QuotaField, string>> = {};
    for (const field of edited.value) {
      const value = editValues.value[field.key] ?? '';
      if (!/^\d{1,20}$/.test(value)) {
        errors[field.key] = quotaText('invalidAmount');
      } else if (
        BigInt(value) < BigInt(field.min) ||
        BigInt(value) > BigInt(field.max)
      ) {
        errors[field.key] = quotaText('outsideRange');
      }
    }
    if (Object.keys(errors).length === 0) {
      const candidate = (field: QuotaField) => {
        const value = fields.value.find(({ key }) => key === field)?.desired;
        if (value === undefined) return undefined;
        return BigInt(editValues.value[field] ?? value);
      };
      const crossLimit = (
        sum: bigint | undefined,
        max: bigint | undefined,
        keys: QuotaField[],
        message: string,
      ) => {
        if (sum === undefined || max === undefined || sum <= max) return;
        const affected = keys.find((key) =>
          edited.value.some((field) => field.key === key),
        );
        if (affected) errors[affected] = quotaText(message);
      };
      switch (resource.value) {
        case 'auth-admission': {
          crossLimit(
            candidate('max_crypto_workers'),
            candidate('max_pending'),
            ['max_crypto_workers', 'max_pending'],
            'authCryptoAtMostPending',
          );
          break;
        }
        case 'authorization-policy': {
          const policy = running.value;
          if (policy && 'refusedGraphWrite' in policy) {
            crossLimit(
              BigInt(policy.entries.used),
              candidate('max_policy_entries'),
              ['max_policy_entries'],
              'authorizationGraphMustFit',
            );
            crossLimit(
              BigInt(policy.inputBytes.used),
              candidate('max_policy_bytes'),
              ['max_policy_bytes'],
              'authorizationGraphMustFit',
            );
          }
          break;
        }
        case 'control-admission': {
          const live = running.value;
          if (live && 'preflight' in live) {
            const request = BigInt(live.maxRequestBytes);
            crossLimit(
              request,
              candidate('max_preflight_bytes'),
              ['max_preflight_bytes'],
              'controlReservationFits',
            );
            crossLimit(
              request,
              candidate('max_pending_bytes'),
              ['max_pending_bytes'],
              'controlReservationFits',
            );
          }

          break;
        }
        case 'engineering-admission': {
          crossLimit(
            candidate('max_model_bytes'),
            candidate('model_pool_bytes'),
            ['max_model_bytes', 'model_pool_bytes'],
            'engineeringSingleAtMostPool',
          );
          break;
        }
        case 'engineering-assets': {
          crossLimit(
            candidate('max_input_bytes'),
            candidate('max_asset_bytes'),
            ['max_input_bytes', 'max_asset_bytes'],
            'engineeringAssetFileMustFit',
          );
          break;
        }
        case 'native-libraries': {
          crossLimit(
            candidate('max_image_bytes'),
            candidate('max_total_bytes'),
            ['max_image_bytes', 'max_total_bytes'],
            'nativeSingleAtMostTotal',
          );
          crossLimit(
            candidate('max_concurrent_loads'),
            candidate('max_images'),
            ['max_concurrent_loads', 'max_images'],
            'nativeLoadsAtMostImages',
          );
          break;
        }
        case 'northward-events': {
          crossLimit(
            candidate('events_max_in_flight'),
            candidate('events_max_pending'),
            ['events_max_in_flight', 'events_max_pending'],
            'eventExecutionConstraint',
          );
          crossLimit(
            candidate('event_max_bytes'),
            candidate('events_max_bytes'),
            ['event_max_bytes', 'events_max_bytes'],
            'eventByteConstraint',
          );

          break;
        }
        case 'session-admission': {
          crossLimit(
            candidate('max_sessions_per_user'),
            candidate('max_sessions'),
            ['max_sessions_per_user', 'max_sessions'],
            'sessionUserAtMostTotal',
          );
          break;
        }
        case 'southward-retained-state': {
          const live = running.value;
          const channel = candidate('ingress_max_channel_bytes');
          const gateway = candidate('ingress_max_state_bytes');
          if (live && 'retained' in live) {
            crossLimit(
              BigInt(live.maxSampleBytes),
              channel,
              ['ingress_max_channel_bytes'],
              'southwardSampleAtMostChannel',
            );
          }
          crossLimit(
            channel,
            gateway,
            ['ingress_max_channel_bytes', 'ingress_max_state_bytes'],
            'southwardChannelAtMostGateway',
          );

          break;
        }
        case 'web-template-transport': {
          const job = candidate('capacity_bytes');
          crossLimit(
            candidate('max_export_bytes'),
            job,
            ['max_export_bytes', 'capacity_bytes'],
            'webTemplateExportMustFit',
          );
          const live = running.value;
          if (live && 'capacityCeiling' in live) {
            crossLimit(
              BigInt(live.capacityFloor),
              job,
              ['capacity_bytes'],
              'webTemplateReservationFloor',
            );
            crossLimit(
              job,
              BigInt(live.capacityCeiling),
              ['capacity_bytes'],
              'webTemplateReservationCeiling',
            );
          }
          break;
        }
        case 'web-template-workbook': {
          crossLimit(
            candidate('max_entry_bytes'),
            candidate('max_expanded_bytes'),
            ['max_entry_bytes', 'max_expanded_bytes'],
            'webWorkbookEntryMustFit',
          );
          crossLimit(
            candidate('max_cell_bytes'),
            candidate('max_cell_data_bytes'),
            ['max_cell_bytes', 'max_cell_data_bytes'],
            'webWorkbookCellMustFit',
          );
          break;
        }
        case 'web-tls-pem': {
          crossLimit(
            candidate('max_der_block_bytes'),
            candidate('max_der_total_bytes'),
            ['max_der_block_bytes', 'max_der_total_bytes'],
            'webTlsDerBlockAtMostTotal',
          );
          crossLimit(
            candidate('max_der_total_bytes'),
            candidate('max_encoded_bytes'),
            ['max_der_total_bytes', 'max_encoded_bytes'],
            'webTlsDerTotalAtMostEncoded',
          );
          const live = running.value;
          const work = tls.value?.work;
          const encoded = candidate('max_encoded_bytes');
          if (work && encoded !== undefined) {
            crossLimit(
              4_194_304n + 16n * encoded,
              BigInt(work.maxWorkBytes),
              ['max_encoded_bytes'],
              'webTlsWorkerMustFitPem',
            );
          }
          if (live && 'footprint' in live) {
            const dimensions: [QuotaField, string][] = [
              ['max_encoded_bytes', live.footprint.encodedBytes],
              ['max_der_block_bytes', live.footprint.derBlockBytes],
              ['max_der_total_bytes', live.footprint.derTotalBytes],
              ['max_certificates', live.footprint.certificates],
            ];
            for (const [key, value] of dimensions) {
              crossLimit(
                BigInt(value),
                candidate(key),
                [key],
                'webTlsMaterialMustFit',
              );
            }
          }
          break;
        }
        case 'web-tls-work': {
          const identity = candidate('identity_bytes');
          const encoded = tls.value?.pem.maxEncodedBytes;
          const retainedControl = tls.value?.work.retainedControlBytes;
          crossLimit(
            identity === undefined || retainedControl === undefined
              ? undefined
              : 2n * identity + BigInt(retainedControl),
            candidate('max_retained_bytes'),
            ['identity_bytes', 'max_retained_bytes'],
            'webTlsRetainedMustFitTwo',
          );
          if (encoded !== undefined) {
            crossLimit(
              4_194_304n + 16n * BigInt(encoded),
              candidate('max_work_bytes'),
              ['max_work_bytes'],
              'webTlsWorkerMustFitPem',
            );
          }
          break;
        }
        case 'web-ui-preparation': {
          crossLimit(
            candidate('max_asset_bytes'),
            candidate('max_content_bytes'),
            ['max_asset_bytes', 'max_content_bytes'],
            'webUiAssetAtMostContent',
          );
          crossLimit(
            candidate('max_depth'),
            candidate('max_path_bytes'),
            ['max_depth', 'max_path_bytes'],
            'webUiDepthAtMostPath',
          );
          const sample = running.value;
          if (sample && 'preparationWorkBytes' in sample) {
            const minimums: [QuotaField, null | string][] = [
              ['max_files', sample.files.used],
              ['max_content_bytes', sample.contentBytes.used],
              ['max_asset_bytes', sample.largestAssetBytes],
              ['max_path_bytes', sample.largestPathBytes],
              ['max_depth', sample.deepestPath],
              ['max_manifest_bytes', sample.manifestBytes],
              [
                'max_retained_bytes',
                sample.sourceMode === 'filesystem'
                  ? sample.contentBytes.used
                  : null,
              ],
            ];
            for (const [key, measured] of minimums) {
              crossLimit(
                measured === null ? undefined : BigInt(measured),
                candidate(key),
                [key],
                'webUiTreeMustFit',
              );
            }
          }
          break;
        }
        case 'web-ui-response': {
          const live = running.value;
          const key = 'max_request_path_bytes';
          const path = candidate(key);
          if (
            live &&
            'minAssetRequestPathBytes' in live &&
            path !== undefined &&
            path < BigInt(live.maxRequestPathBytes)
          ) {
            crossLimit(
              BigInt(live.minAssetRequestPathBytes),
              path,
              [key],
              'webUiResponsePathMustFit',
            );
          }
          break;
        }
        case 'websocket-admission': {
          crossLimit(
            candidate('max_ws_tickets_per_session'),
            candidate('max_ws_tickets'),
            ['max_ws_tickets_per_session', 'max_ws_tickets'],
            'websocketSessionTicketsAtMostTotal',
          );
          crossLimit(
            candidate('max_ws_connections_per_session'),
            candidate('max_ws_connections'),
            ['max_ws_connections_per_session', 'max_ws_connections'],
            'websocketSessionConnectionsAtMostTotal',
          );
          break;
        }
        case 'websocket-traffic': {
          crossLimit(
            candidate('max_ws_frame_bytes'),
            candidate('max_ws_batch_bytes'),
            ['max_ws_frame_bytes', 'max_ws_batch_bytes'],
            'websocketFrameAtMostBatch',
          );
          break;
        }
        default: {
          const request = candidate('max_request_bytes');
          const result = candidate('max_result_bytes');
          const required =
            request === undefined || result === undefined
              ? undefined
              : request + result;
          crossLimit(
            required,
            candidate('max_bytes'),
            ['max_bytes', 'max_request_bytes', 'max_result_bytes'],
            'extensionByteConstraint',
          );
        }
      }
    }
    return errors;
  });
  const canPreview = computed(
    () =>
      mayPreview.value &&
      edited.value.length > 0 &&
      Object.keys(fieldErrors.value).length === 0,
  );

  function stillCurrent(owner: number | string, version: number) {
    return !disposed && principal.value === owner && version === epoch;
  }

  function matchesVersions(edit: QuotaEdit) {
    return (
      mayPreview.value &&
      catalog.value?.sourceHash === edit.expectedSourceHash &&
      running.value?.ownerId === edit.expectedOwnerId &&
      running.value.policyRevision === edit.expectedPolicyRevision
    );
  }

  function rememberReceipt(
    owner: number | string,
    prior: RetainedChange,
    latest: QuotaChangeReceipt,
  ) {
    receipt.value = latest;
    operationFault.value = '';
    const updated = { ...prior, operationId: latest.operationId };
    retained.value = updated;
    if (!prior.operationId) {
      try {
        localStorage.setItem(storageKey(owner), JSON.stringify(updated));
      } catch {
        operationFault.value = quotaText('statusFailed');
      }
    }
  }

  async function refresh() {
    const owner = principal.value;
    if (owner === undefined || refreshing.value || disposed) return;
    const version = epoch;
    const scope = resource.value;
    refreshing.value = true;
    try {
      // Both reads use the same HTTP arrival pool, which can have a single slot.
      const configuration = await getQuotaCatalog(scope).catch(() => undefined);
      if (!stillCurrent(owner, version)) return;
      const usage = await getGatewayQuotaUsage().catch(() => undefined);
      if (!stillCurrent(owner, version)) return;
      catalogFresh.value = !!configuration;
      let sample: QuotaUsage | undefined;
      if (usage) {
        processRss.value = usage.processRss ?? undefined;
        quotaManagement.value = usage.quotaManagement ?? undefined;
        tls.value = usage.webTls ?? undefined;
        sample = {
          'auth-admission': usage.authAdmission,
          'authorization-policy': usage.authorizationPolicy ?? undefined,
          'control-admission': usage.controlAdmission,
          'capability-admission': usage.capabilityAdmission,
          'engineering-admission': usage.engineeringAdmission ?? undefined,
          'engineering-assets':
            usage.engineeringAdmission?.assetStoreAvailable === undefined
              ? undefined
              : usage.engineeringAdmission,
          'engineering-browse': usage.engineeringAdmission?.pageOutputBytes
            ? usage.engineeringAdmission
            : undefined,
          'engineering-comparison':
            usage.engineeringAdmission?.maxComparisonItems === undefined ||
            usage.engineeringAdmission.maxComparisonBytes === undefined ||
            usage.engineeringAdmission.maxComparisonWork === undefined
              ? undefined
              : usage.engineeringAdmission,
          'engineering-mapping':
            usage.engineeringAdmission?.mappingOutputBytes &&
            usage.engineeringAdmission.publicationSnapshotBytes
              ? usage.engineeringAdmission
              : undefined,
          'engineering-source': usage.engineeringAdmission ?? undefined,
          'engineering-publication': usage.engineeringPublication,
          'engineering-validator': usage.engineeringValidator,
          'ethernet-capture': usage.ethernetCapture ?? undefined,
          'extension-store': usage.extensionStore ?? undefined,
          'http-ingress': usage.httpIngress ?? undefined,
          'login-admission': usage.loginAdmission ?? undefined,
          'native-libraries': usage.nativeLibraries ?? undefined,
          'northward-app-configuration': usage.northwardAppConfiguration,
          'northward-events': usage.northwardEvents,
          'northward-event-queue': usage.northwardEventQueue,
          'session-admission': usage.sessionAdmission,
          'websocket-admission': usage.websocketAdmission ?? undefined,
          'websocket-traffic': usage.websocketTraffic ?? undefined,
          'web-ui-preparation': usage.webUiPreparation ?? undefined,
          'web-ui-response': usage.webUiResponse ?? undefined,
          'web-tls-pem': tls.value?.pem,
          'web-tls-work': tls.value?.work,
          'web-template-transport': usage.webTemplateTransport ?? undefined,
          'web-template-workbook': usage.webTemplateWorkbook ?? undefined,
          'southward-retained-state': usage.southwardRetainedState,
          'southward-materials': usage.southwardMaterials,
          'southward-configuration': usage.southwardConfiguration ?? undefined,
        }[scope];
      }
      runtimeFresh.value = !!sample;
      if (configuration) catalog.value = configuration;
      if (sample) running.value = sample;
      loaded.value = true;
      nextPoll =
        performance.now() +
        (catalogFresh.value && runtimeFresh.value ? 0 : 14_000);
      if (preview.value && !matchesVersions(preview.value.edit)) {
        preview.value = undefined;
        editFault.value = writerBlock.value || quotaText('previewExpired');
      }
      const pending = retained.value;
      if (pending && !finished.value) {
        try {
          const existing = pending.operationId
            ? await getQuotaChange(pending.resource, pending.operationId)
            : await findQuotaChange(pending.resource, pending.change.requestId);
          if (
            existing &&
            retained.value === pending &&
            stillCurrent(owner, version)
          ) {
            rememberReceipt(owner, pending, existing);
          }
        } catch {
          if (stillCurrent(owner, version))
            operationFault.value = quotaText('statusFailed');
        }
      }
    } finally {
      refreshing.value = false;
      if (!disposed && version !== epoch) void refresh();
    }
  }

  function openEditor() {
    const owner = principal.value;
    if (owner === undefined || !mayStart.value || working.value) return;
    if (finished.value) {
      try {
        localStorage.removeItem(storageKey(owner));
      } catch {
        operationFault.value = quotaText('cannotRetain');
        return;
      }
      if (retained.value?.resource === resource.value) editValues.value = {};
      receipt.value = undefined;
      retained.value = undefined;
      operationFault.value = '';
    }
    editFault.value = '';
    editOpen.value = true;
  }

  function editField(key: QuotaField, value: string) {
    editValues.value[key] = value;
    preview.value = undefined;
    editFault.value = '';
  }

  function returnToEdit() {
    preview.value = undefined;
    editFault.value = '';
  }

  async function calculatePreview() {
    const owner = principal.value;
    const configuration = catalog.value;
    const current = running.value;
    if (
      owner === undefined ||
      !configuration ||
      !current ||
      !canPreview.value ||
      working.value
    )
      return;
    const version = epoch;
    const patch: QuotaEdit['patch'] = {};
    for (const field of edited.value) {
      patch[field.key] = BigInt(
        editValues.value[field.key] ?? field.desired,
      ).toString();
    }
    const edit = {
      expectedOwnerId: current.ownerId,
      expectedPolicyRevision: current.policyRevision,
      expectedSourceHash: configuration.sourceHash,
      patch,
    };
    working.value = true;
    editFault.value = '';
    preview.value = undefined;
    try {
      const next = await previewQuotaChange(resource.value, edit);
      if (!stillCurrent(owner, version)) return;
      if (!matchesVersions(edit)) {
        editFault.value = quotaText('previewExpired');
        return;
      }
      preview.value = { edit, result: next };
    } catch {
      if (stillCurrent(owner, version))
        editFault.value = quotaText('previewFailed');
    } finally {
      if (stillCurrent(owner, version)) working.value = false;
    }
  }

  async function submit() {
    const owner = principal.value;
    if (owner === undefined || working.value || finished.value) return;
    const version = epoch;
    let pending = retained.value;
    if (pending && !mayRetry.value) return;
    if (!pending) {
      const candidate = preview.value;
      if (!candidate || !matchesVersions(candidate.edit)) {
        returnToEdit();
        editFault.value = quotaText('previewExpired');
        return;
      }
      try {
        const outstanding = readRetained(owner);
        if (outstanding) {
          retained.value = outstanding;
          editOpen.value = false;
          preview.value = undefined;
          await refresh();
          return;
        }
        pending = {
          change: { edit: candidate.edit, requestId: newRequestId() },
          resource: resource.value,
        };
        localStorage.setItem(storageKey(owner), JSON.stringify(pending));
      } catch {
        editFault.value = quotaText('cannotRetain');
        return;
      }
      retained.value = pending;
      preview.value = undefined;
      editOpen.value = false;
    }
    working.value = true;
    operationFault.value = '';
    try {
      const latest = await submitQuotaChange(pending.resource, pending.change);
      if (!stillCurrent(owner, version)) return;
      rememberReceipt(owner, pending, latest);
      if (finished.value) {
        if (pending.resource === resource.value) editValues.value = {};
        drafts.delete(pending.resource);
      }
      await refresh();
    } catch (error) {
      if (!stillCurrent(owner, version)) return;
      operationFault.value = quotaText('operationUnconfirmed');
      const httpStatus = (error as { response?: { status?: number } })?.response
        ?.status;
      if (!pending.operationId && (httpStatus === 409 || httpStatus === 422)) {
        // A complete conflict/validation response plus an authoritative empty lookup
        // proves that the request has no journal row or possible runtime effect.
        try {
          const existing = await findQuotaChange(
            pending.resource,
            pending.change.requestId,
          );
          if (!stillCurrent(owner, version)) return;
          if (existing) {
            rememberReceipt(owner, pending, existing);
          } else {
            localStorage.removeItem(storageKey(owner));
            retained.value = undefined;
            if (pending.resource === resource.value) {
              editOpen.value = true;
              editFault.value = quotaText('rejectedRepreview');
            }
            operationFault.value = '';
          }
        } catch {
          // Preserve the retry identity when durable status cannot be established.
        }
      }
      await refresh();
    } finally {
      if (stillCurrent(owner, version)) working.value = false;
    }
  }

  function resetPanel() {
    epoch++;
    loaded.value = false;
    catalog.value = undefined;
    running.value = undefined;
    catalogFresh.value = false;
    runtimeFresh.value = false;
    editOpen.value = false;
    preview.value = undefined;
    editFault.value = '';
  }

  function selectResource(next: QuotaResource) {
    if (next === resource.value || working.value || editOpen.value) return;
    drafts.set(resource.value, editValues.value);
    resource.value = next;
    resetPanel();
    editValues.value = drafts.get(next) ?? {};
    void refresh();
  }

  watch(
    principal,
    async (owner) => {
      resetPanel();
      tls.value = undefined;
      processRss.value = undefined;
      quotaManagement.value = undefined;
      working.value = false;
      receipt.value = undefined;
      retained.value = undefined;
      drafts.clear();
      editValues.value = {};
      operationFault.value = '';
      if (owner === undefined) return;
      try {
        retained.value = readRetained(owner);
        if (retained.value) resource.value = retained.value.resource;
      } catch {
        operationFault.value = quotaText('statusFailed');
      }
      await refresh();
    },
    { immediate: true },
  );

  onMounted(() => {
    sampler = setInterval(() => {
      if (!document.hidden && !working.value && performance.now() >= nextPoll)
        void refresh();
    }, 5000);
  });
  onBeforeUnmount(() => {
    disposed = true;
    epoch++;
    clearInterval(sampler);
  });

  return {
    calculatePreview,
    canPreview,
    catalog,
    catalogFresh,
    comparison,
    configured,
    editFault,
    editField,
    edited,
    editOpen,
    editValues,
    fieldErrors,
    fields,
    finished,
    loaded,
    mayRetry,
    mayStart,
    openEditor,
    operationFault,
    preview,
    processRss,
    quotaManagement,
    receipt,
    refresh,
    refreshing,
    retained,
    resource,
    returnToEdit,
    running,
    runtimeFresh,
    selectResource,
    submit,
    waitingForRestart,
    working,
    writable,
    writerBlock,
  };
}
