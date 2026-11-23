import type {
  AuthorizationPolicyUsage,
  CapabilityAdmissionUsage,
  EngineeringAdmissionUsage,
  EngineeringPublicationQuotaUsage,
  EngineeringValidatorQuotaUsage,
  HttpIngressQuotaUsage,
  LoginAdmissionUsage,
  QuotaDescriptor,
  QuotaEffect,
  QuotaField,
  QuotaResource,
  QuotaUsage,
  QuotaUse,
  SessionAdmissionUsage,
  WebSocketAdmissionUsage,
  WebSocketTrafficUsage,
  WebTemplateTransportUsage,
  WebTemplateWorkbookUsage,
  WebTlsPemUsage,
  WebTlsWorkUsage,
  WebUiResponseUsage,
} from '#/api/core/resource-quota';

import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUpToLine,
  Grip,
  InspectionPanel,
  LockKeyhole,
} from '@vben/icons';
import { $t } from '@vben/locales';

export const quotaGroupAppearance = {
  engineering: { accent: '#7c52cc', color: 'purple', icon: InspectionPanel },
  gateway: { accent: '#535fc2', color: 'geekblue', icon: Grip },
  identity: { accent: '#a64078', color: 'magenta', icon: LockKeyhole },
  northward: { accent: '#356ad3', color: 'blue', icon: ArrowUpToLine },
  southward: { accent: '#138578', color: 'cyan', icon: ArrowDown },
  web: { accent: '#237b9d', color: 'cyan', icon: ArrowRightLeft },
} as const;

export function quotaText(
  key: string,
  values?: Record<string, number | string>,
) {
  const path = `page.maintenance.resourceQuotas.${key}`;
  return values ? $t(path, values) : $t(path);
}

const groupedNumber = new Intl.NumberFormat();
const binaryUnits = [
  ['GiB', 1_073_741_824n],
  ['MiB', 1_048_576n],
  ['KiB', 1024n],
] as const;

/** Preserve the entire wire integer and render absence independently of measured zero. */
export function amount(value?: null | string) {
  return value === null || value === undefined
    ? quotaText('unknown')
    : groupedNumber.format(BigInt(value));
}

/** Display a compact binary unit while keeping the exact byte value in the tooltip. */
export function compactBytes(value: string) {
  const bytes = BigInt(value);
  for (const [unit, divisor] of binaryUnits) {
    if (bytes >= divisor) {
      const tenths = (bytes * 10n + divisor / 2n) / divisor;
      return { value: (Number(tenths) / 10).toLocaleString(), unit };
    }
  }
  return { value: amount(value), unit: quotaText('units.bytes') };
}

/** Calculate the display bar without exposing large integers to Number rounding. */
export function utilization(usage: Pick<QuotaUse, 'limit' | 'used'>) {
  const limit = BigInt(usage.limit);
  if (limit === 0n) return undefined;
  const used = BigInt(usage.used);
  const ratio = (used * 1000n) / limit;
  if (ratio === 0n && used > 0n) return { percent: 0, text: '<0.1%' };
  return {
    percent: Number(ratio > 1000n ? 1000n : ratio) / 10,
    text: `${
      (ratio / 10n).toString() + (ratio % 10n === 0n ? '' : `.${ratio % 10n}`)
    }%`,
  };
}

export function effective(running: QuotaUsage | undefined, key: QuotaField) {
  if (!running) return undefined;
  if ('validatorReady' in running) {
    switch (key) {
      case 'max_diagnostic_bytes': {
        return running.maxDiagnosticBytes;
      }
      case 'request_timeout_ms': {
        return running.requestTimeoutMs;
      }
      case 'validator_address_space_bytes': {
        return running.validatorAddressSpaceBytes ?? undefined;
      }
      case 'validator_heap_bytes': {
        return running.validatorHeapBytes;
      }
      case 'validator_timeout_ms': {
        return running.validatorTimeoutMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('maxPublications' in running) {
    if (key === 'max_publication_bytes') return running.maxPublicationBytes;
    if (key === 'max_publications') return running.maxPublications;
    return undefined;
  }
  if ('observations' in running) {
    if (key === 'max_pending') return running.observations.limit;
    if (key === 'max_pending_bytes') return running.backing.limit;
    return undefined;
  }
  if ('parsedWorkbooks' in running)
    return running.limits.find((limit) => limit.key === key)?.limit;
  if ('capacityCeiling' in running) {
    switch (key) {
      case 'capacity_bytes': {
        return running.capacityBytes;
      }
      case 'max_export_bytes': {
        return running.maxExportBytes;
      }
      case 'max_jobs': {
        return running.jobs.limit;
      }
      case 'timeout_ms': {
        return running.timeoutMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('footprint' in running) {
    switch (key) {
      case 'max_certificates': {
        return running.maxCertificates;
      }
      case 'max_der_block_bytes': {
        return running.maxDerBlockBytes;
      }
      case 'max_der_total_bytes': {
        return running.maxDerTotalBytes;
      }
      case 'max_encoded_bytes': {
        return running.maxEncodedBytes;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('workBacking' in running) {
    switch (key) {
      case 'identity_bytes': {
        return running.identityBytes;
      }
      case 'max_retained_bytes': {
        return running.retainedBacking.limit;
      }
      case 'max_work_bytes': {
        return running.maxWorkBytes;
      }
      case 'signer_bytes': {
        return running.signerBytes;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('preparationWorkBytes' in running) {
    switch (key) {
      case 'max_asset_bytes': {
        return running.maxAssetBytes;
      }
      case 'max_content_bytes': {
        return running.contentBytes.limit;
      }
      case 'max_depth': {
        return running.maxDepth;
      }
      case 'max_files': {
        return running.files.limit;
      }
      case 'max_manifest_bytes': {
        return running.maxManifestBytes;
      }
      case 'max_path_bytes': {
        return running.maxPathBytes;
      }
      case 'max_retained_bytes': {
        return running.retainedBytes.limit;
      }
      case 'max_work_bytes': {
        return running.maxWorkBytes;
      }
      case 'native_worker_bytes': {
        return running.nativeWorkerBytes;
      }
      case 'prepare_timeout_ms': {
        return running.prepareTimeoutMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('minAssetRequestPathBytes' in running) {
    switch (key) {
      case 'max_conditional_header_bytes': {
        return running.maxConditionalHeaderBytes;
      }
      case 'max_range_header_bytes': {
        return running.maxRangeHeaderBytes;
      }
      case 'max_ranges': {
        return running.maxRanges;
      }
      case 'max_request_path_bytes': {
        return running.maxRequestPathBytes;
      }
      case 'max_response_metadata_bytes': {
        return running.maxResponseMetadataBytes;
      }
      case 'request_timeout_ms': {
        return running.requestTimeoutMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('activeAcknowledgements' in running) {
    switch (key) {
      case 'max_ws_batch_bytes': {
        return running.maxBatchBytes;
      }
      case 'max_ws_frame_bytes': {
        return running.maxFrameBytes;
      }
      case 'max_ws_messages_per_second': {
        return running.messagesPerSecond;
      }
      case 'max_ws_snapshot_entries': {
        return running.maxSnapshotEntries;
      }
      case 'max_ws_subscriptions': {
        return running.maxSubscriptions;
      }
      case 'ws_ack_timeout_ms': {
        return running.ackTimeoutMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('ticketTtlMs' in running) {
    switch (key) {
      case 'max_ws_connections': {
        return running.connections.limit;
      }
      case 'max_ws_connections_per_session': {
        return running.maxConnectionsPerSession;
      }
      case 'max_ws_tickets': {
        return running.maxTickets;
      }
      case 'max_ws_tickets_per_session': {
        return running.maxTicketsPerSession;
      }
      case 'ws_ticket_ttl_ms': {
        return running.ticketTtlMs;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('refusedGraphWrite' in running) {
    if (key === 'max_policy_entries') return running.entries.limit;
    if (key === 'max_policy_bytes') return running.inputBytes.limit;
    return undefined;
  }
  if ('maxSessionsPerUser' in running) {
    if (key === 'max_sessions') return running.maxSessions;
    if (key === 'max_sessions_per_user') return running.maxSessionsPerUser;
    return undefined;
  }
  if ('globalTokensAvailable' in running) {
    switch (key) {
      case 'login_account_burst': {
        return running.accountTokenCapacity;
      }
      case 'login_account_refill_ms': {
        return running.accountRefillMs;
      }
      case 'login_burst': {
        return running.globalTokenCapacity;
      }
      case 'login_refill_ms': {
        return running.globalRefillMs;
      }
      case 'max_login_accounts': {
        return running.accounts.limit;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('nativeWork' in running) {
    if (key === 'max_pending_requests') return running.requests.limit;
    if (key === 'management_json_bytes') return running.managementJsonBytes;
    if (key === 'json_body_timeout_ms') return running.jsonBodyTimeoutMs;
    return undefined;
  }
  if ('crypto' in running) {
    if (key === 'max_pending') return running.requests.limit;
    if (key === 'max_crypto_workers') return running.crypto.limit;
    if (key === 'request_timeout_ms') return running.requestTimeoutMs;
    return undefined;
  }
  if ('cachedModels' in running) {
    switch (key) {
      case 'max_asset_bytes': {
        return running.maxAssetBytes;
      }
      case 'max_assets': {
        return running.maxAssets;
      }
      case 'max_browse_bytes': {
        return running.maxBrowseBytes;
      }
      case 'max_cached_models': {
        return running.cachedModels.limit;
      }
      case 'max_comparison_bytes': {
        return running.maxComparisonBytes;
      }
      case 'max_comparison_items': {
        return running.maxComparisonItems;
      }
      case 'max_comparison_work': {
        return running.maxComparisonWork;
      }
      case 'max_input_bytes': {
        return running.maxInputBytes;
      }
      case 'max_jobs': {
        return running.jobs.limit;
      }
      case 'max_mapping_bytes': {
        return running.maxMappingBytes;
      }
      case 'max_mapping_points': {
        return running.maxMappingPoints;
      }
      case 'max_model_bytes': {
        return running.maxModelBytes;
      }
      case 'max_preview_page': {
        return running.maxPreviewPage;
      }
      case 'max_source_bytes': {
        return running.maxSourceBytes;
      }
      case 'max_source_work': {
        return running.maxSourceWork;
      }
      case 'model_pool_bytes': {
        return running.modelBytes.limit;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('loads' in running) {
    switch (key) {
      case 'max_concurrent_loads': {
        return running.loads.limit;
      }
      case 'max_image_bytes': {
        return running.maxImageBytes;
      }
      case 'max_images': {
        return running.images.limit;
      }
      case 'max_total_bytes': {
        return running.bytes.limit;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('preflight' in running) {
    switch (key) {
      case 'max_pending': {
        return running.pending.limit;
      }
      case 'max_pending_bytes': {
        return running.bytes.limit;
      }
      case 'max_preflight': {
        return running.preflight.limit;
      }
      case 'max_preflight_bytes': {
        return running.preflightBytes.limit;
      }
      default: {
        return undefined;
      }
    }
  }
  if ('interfaces' in running) {
    if (key === 'ethernet_capture_max_interfaces')
      return running.interfaces.limit;
    if (key === 'ethernet_capture_max_bytes') return running.bytes.limit;
    return undefined;
  }
  if ('compilations' in running) {
    if (key === 'material_max_bytes') return running.bytes.limit;
    if (key === 'material_max_compiling') return running.compilations.limit;
    if (key === 'material_prepare_timeout_ms') return running.prepareTimeoutMs;
    return undefined;
  }
  if ('retained' in running) {
    if (key === 'ingress_max_channel_bytes') return running.maxChannelBytes;
    if (key === 'ingress_max_state_bytes') return running.retained.limit;
    return undefined;
  }
  if ('refusedPayload' in running) {
    if ('bytes' in running) {
      if (key === 'configuration_max_pending') return running.pending.limit;
      if (key === 'configuration_max_pending_bytes') return running.bytes.limit;
      return undefined;
    }
    if (key === 'max_pending') return running.pending.limit;
    if (key === 'max_request_bytes') return running.maxRequestBytes;
    return undefined;
  }
  if ('replacing' in running) {
    return key === 'queue_capacity' ? running.limit : undefined;
  }
  if ('execution' in running) {
    switch (key) {
      case 'event_max_bytes': {
        return running.maxEventBytes;
      }
      case 'event_max_depth': {
        return running.maxJsonDepth;
      }
      case 'events_max_bytes': {
        return running.bytes.limit;
      }
      case 'events_max_in_flight': {
        return running.execution.limit;
      }
      case 'events_max_pending': {
        return running.pending.limit;
      }
      default: {
        return undefined;
      }
    }
  }
  switch (key) {
    case 'max_bytes': {
      return running.bytes.limit;
    }
    case 'max_json_depth': {
      return running.maxJsonDepth;
    }
    case 'max_keys': {
      return running.maxKeys;
    }
    case 'max_pending': {
      return running.pending.limit;
    }
    case 'max_request_bytes': {
      return running.maxRequestBytes;
    }
    case 'max_result_bytes': {
      return running.maxResultBytes;
    }
    case 'request_timeout_ms': {
      return running.requestTimeoutMs;
    }
  }
}

export function resourceName(resource: QuotaResource) {
  return quotaText(
    {
      'auth-admission': 'authAdmission',
      'authorization-policy': 'authorizationPolicy',
      'websocket-admission': 'websocketAdmission',
      'websocket-traffic': 'websocketTraffic',
      'web-ui-preparation': 'webUiPreparation',
      'web-ui-response': 'webUiResponse',
      'web-tls-pem': 'webTlsPem',
      'web-tls-work': 'webTlsWork',
      'web-template-transport': 'webTemplateTransport',
      'web-template-workbook': 'webTemplateWorkbook',
      'control-admission': 'controlAdmission',
      'capability-admission': 'capabilityAdmission',
      'engineering-admission': 'engineeringAdmission',
      'engineering-assets': 'engineeringAssets',
      'engineering-browse': 'engineeringBrowse',
      'engineering-comparison': 'engineeringComparison',
      'engineering-mapping': 'engineeringMapping',
      'engineering-publication': 'engineeringPublication',
      'engineering-source': 'engineeringSource',
      'engineering-validator': 'engineeringValidator',
      'ethernet-capture': 'ethernetCapture',
      'extension-store': 'extensionStore',
      'http-ingress': 'httpIngress',
      'login-admission': 'loginAdmission',
      'session-admission': 'sessionAdmission',
      'native-libraries': 'nativeLibraries',
      'northward-app-configuration': 'northwardAppConfiguration',
      'southward-retained-state': 'southwardRetainedState',
      'southward-configuration': 'southwardConfiguration',
      'southward-materials': 'southwardMaterials',
      'northward-events': 'northwardEvents',
      'northward-event-queue': 'northwardEventQueue',
    }[resource],
  );
}

/** Shared keys use the meaning of the active owner. */
export function quotaFieldName(resource: QuotaResource, field: QuotaField) {
  if (resource === 'engineering-validator' && field === 'request_timeout_ms')
    return quotaText('engineeringRequestDeadline');
  if (resource === 'engineering-assets' && field === 'max_asset_bytes')
    return quotaText('engineeringAssetBytesLimit');
  if (resource === 'capability-admission') {
    if (field === 'max_pending') return quotaText('capabilitySlotsLimit');
    if (field === 'max_pending_bytes')
      return quotaText('capabilityBackingLimit');
  }
  if (resource === 'web-ui-response' && field === 'request_timeout_ms')
    return quotaText('webUiResponsePreparationDeadline');
  if (resource === 'web-template-transport' && field === 'max_jobs')
    return quotaText('webTemplateJobsLimit');
  if (resource === 'web-tls-work') {
    if (field === 'max_work_bytes') return quotaText('webTlsWorkerReservation');
    if (field === 'max_retained_bytes') return quotaText('webTlsRetainedLimit');
  }
  return quotaText(`fields.${field}`);
}

export function engineeringAssetRefusals(sample: EngineeringAdmissionUsage) {
  const { refusedAssetBytes, refusedAssetCount, refusedAssetFileSize } = sample;
  if (
    refusedAssetBytes === undefined ||
    refusedAssetCount === undefined ||
    refusedAssetFileSize === undefined
  )
    return undefined;
  return [
    { key: 'engineering_asset_file_size', value: refusedAssetFileSize },
    { key: 'engineering_asset_count', value: refusedAssetCount },
    { key: 'engineering_asset_bytes', value: refusedAssetBytes },
  ];
}

export function engineeringMappingRefusals(sample: EngineeringAdmissionUsage) {
  const {
    refusedMappingItems,
    refusedMappingOutput,
    refusedPublicationSnapshot,
  } = sample;
  if (
    refusedMappingItems === undefined ||
    refusedMappingOutput === undefined ||
    refusedPublicationSnapshot === undefined
  )
    return undefined;
  return [
    { key: 'engineering_mapping_items', value: refusedMappingItems },
    { key: 'engineering_mapping_output', value: refusedMappingOutput },
    {
      key: 'engineering_publication_snapshot',
      value: refusedPublicationSnapshot,
    },
  ];
}

export function engineeringPageRefusals(sample: EngineeringAdmissionUsage) {
  const { refusedPageItems, refusedPageOutputBytes } = sample;
  if (refusedPageItems === undefined || refusedPageOutputBytes === undefined)
    return undefined;
  return [
    { key: 'engineering_page_items', value: refusedPageItems },
    { key: 'engineering_page_output_bytes', value: refusedPageOutputBytes },
  ];
}

export function engineeringComparisonRefusals(
  sample: EngineeringAdmissionUsage,
) {
  const {
    refusedComparisonDescriptors,
    refusedComparisonScratch,
    refusedComparisonWork,
  } = sample;
  if (
    refusedComparisonDescriptors === undefined ||
    refusedComparisonScratch === undefined ||
    refusedComparisonWork === undefined
  )
    return undefined;
  return [
    {
      key: 'engineering_comparison_descriptors',
      value: refusedComparisonDescriptors,
    },
    { key: 'engineering_comparison_scratch', value: refusedComparisonScratch },
    { key: 'engineering_comparison_work', value: refusedComparisonWork },
  ];
}

export function engineeringPublicationRefusals(
  sample: EngineeringPublicationQuotaUsage,
) {
  return [
    {
      key: 'engineering_publication_count',
      value: sample.refusedPublicationCount,
    },
    {
      key: 'engineering_publication_bytes',
      value: sample.refusedPublicationBytes,
    },
  ];
}

export function engineeringValidatorRefusals(
  sample: EngineeringValidatorQuotaUsage,
) {
  return [
    { key: 'validator_heap', value: sample.refusedValidatorHeap },
    {
      key: 'validator_native_memory',
      value: sample.refusedValidatorNativeMemory,
    },
    { key: 'validator_diagnostics', value: sample.refusedValidatorDiagnostics },
    { key: 'validator_deadline', value: sample.refusedValidatorDeadlines },
  ];
}

export function httpIngressRefusals(sample: HttpIngressQuotaUsage) {
  return [
    { key: 'http_request_slots', value: sample.refusedRequestSlots },
    { key: 'http_arrival_backing', value: sample.refusedArrivalBacking },
    { key: 'http_native_slots', value: sample.refusedNativeSlots },
    { key: 'http_json_bytes', value: sample.refusedJsonBytes },
    { key: 'http_json_deadline', value: sample.refusedJsonDeadline },
    { key: 'http_json_capacity', value: sample.refusedJsonCapacity },
  ];
}

export function loginAdmissionRefusals(sample: LoginAdmissionUsage) {
  return [
    { key: 'login_global_tokens', value: sample.refusedGlobalTokens },
    { key: 'login_account_tokens', value: sample.refusedAccountTokens },
    { key: 'login_account_slots', value: sample.refusedAccountSlots },
  ];
}

export function refusalTotal(
  sample: QuotaUsage | undefined,
  resource?: QuotaResource,
) {
  if (!sample) return undefined;
  if ('validatorReady' in sample) {
    return engineeringValidatorRefusals(sample)
      .reduce((sum, item) => sum + BigInt(item.value), 0n)
      .toString();
  }
  if ('maxPublications' in sample) {
    return (
      BigInt(sample.refusedPublicationCount) +
      BigInt(sample.refusedPublicationBytes)
    ).toString();
  }
  if ('preparationWorkBytes' in sample)
    return sample.refusedRetainedReservations;
  if ('observations' in sample) {
    return capabilityRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('parsedWorkbooks' in sample) {
    return webWorkbookRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('capacityCeiling' in sample) {
    return webTemplateRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('footprint' in sample || 'workBacking' in sample) {
    return webTlsRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('minAssetRequestPathBytes' in sample) {
    return webUiResponseRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('activeAcknowledgements' in sample) {
    return websocketTrafficRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('ticketTtlMs' in sample) {
    return websocketAdmissionRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('refusedGraphWrite' in sample) {
    return authorizationPolicyRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('maxSessionsPerUser' in sample) {
    return sessionAdmissionRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('globalTokensAvailable' in sample) {
    return loginAdmissionRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('nativeWork' in sample) {
    return httpIngressRefusals(sample)
      .reduce((sum, { value }) => sum + BigInt(value), 0n)
      .toString();
  }
  if ('crypto' in sample) {
    return (
      BigInt(sample.refusedRequests) + BigInt(sample.refusedCryptoWaits)
    ).toString();
  }
  if ('cachedModels' in sample) {
    if (resource === 'engineering-assets') {
      return engineeringAssetRefusals(sample)
        ?.reduce((sum, { value }) => sum + BigInt(value), 0n)
        .toString();
    }
    if (resource === 'engineering-mapping') {
      return engineeringMappingRefusals(sample)
        ?.reduce((sum, { value }) => sum + BigInt(value), 0n)
        .toString();
    }
    if (resource === 'engineering-browse') {
      return engineeringPageRefusals(sample)
        ?.reduce((sum, { value }) => sum + BigInt(value), 0n)
        .toString();
    }
    if (resource === 'engineering-comparison') {
      return engineeringComparisonRefusals(sample)
        ?.reduce((sum, { value }) => sum + BigInt(value), 0n)
        .toString();
    }
    if (resource === 'engineering-source') return sample.refusedNsdSourceWork;
    return (
      BigInt(sample.refusedJobs) +
      BigInt(sample.refusedModelEnvelope) +
      BigInt(sample.refusedModelPool)
    ).toString();
  }
  if ('loads' in sample) {
    return (
      BigInt(sample.refusedCount) +
      BigInt(sample.refusedImageBytes) +
      BigInt(sample.refusedLoads) +
      BigInt(sample.refusedTotalBytes)
    ).toString();
  }
  if ('preflight' in sample) {
    return (
      BigInt(sample.refusedPreflightCount) +
      BigInt(sample.refusedPreflightBytes) +
      BigInt(sample.refusedExecutionCount) +
      BigInt(sample.refusedExecutionBytes)
    ).toString();
  }
  if ('interfaces' in sample) {
    return (
      BigInt(sample.refusedCaptureBytes) +
      BigInt(sample.refusedInterfaceCount) +
      BigInt(sample.refusedOccupiedInterface) +
      BigInt(sample.refusedRuntimeBytes)
    ).toString();
  }
  if ('compilations' in sample) {
    return (
      BigInt(sample.refusedBytes) +
      BigInt(sample.refusedCompilation) +
      BigInt(sample.refusedVerification)
    ).toString();
  }
  if ('retained' in sample) {
    return (
      BigInt(sample.refusedChannelReservations) +
      BigInt(sample.refusedGatewayReservations)
    ).toString();
  }
  if ('replacing' in sample) return sample.refusedDrain;
  if ('refusedPayload' in sample) {
    const total = BigInt(sample.refusedPending) + BigInt(sample.refusedPayload);
    return (
      'bytes' in sample ? total + BigInt(sample.refusedBytes) : total
    ).toString();
  }
  if ('execution' in sample) {
    return (
      BigInt(sample.refusedPending) +
      BigInt(sample.refusedBytes) +
      BigInt(sample.refusedEncoding) +
      BigInt(sample.refusedJsonWork) +
      BigInt(sample.refusedQueueDrain ?? '0')
    ).toString();
  }
  return sample.refusalsTotal;
}

export function authorizationPolicyRefusals(sample: AuthorizationPolicyUsage) {
  return [
    { key: 'authorization_input', value: sample.refusedInput },
    { key: 'authorization_graph_write', value: sample.refusedGraphWrite },
    { key: 'authorization_graph_load', value: sample.refusedGraphLoad },
  ];
}

export function sessionAdmissionRefusals(sample: SessionAdmissionUsage) {
  return [
    { key: 'session_total_slots', value: sample.refusedTotalSlots },
    { key: 'session_user_slots', value: sample.refusedUserSlots },
    { key: 'session_lease_slots', value: sample.refusedLeaseSlots },
    { key: 'session_lease_backing', value: sample.refusedLeaseBacking },
  ];
}

export function websocketAdmissionRefusals(sample: WebSocketAdmissionUsage) {
  return [
    { key: 'websocket_total_tickets', value: sample.refusedTotalTickets },
    { key: 'websocket_session_tickets', value: sample.refusedSessionTickets },
    {
      key: 'websocket_total_connections',
      value: sample.refusedTotalConnections,
    },
    {
      key: 'websocket_session_connections',
      value: sample.refusedSessionConnections,
    },
  ];
}

export function websocketTrafficRefusals(sample: WebSocketTrafficUsage) {
  return [
    { key: 'websocket_message_rate', value: sample.refusedMessageRate },
    { key: 'websocket_subscriptions', value: sample.refusedSubscriptions },
    { key: 'websocket_snapshot_entries', value: sample.refusedSnapshotEntries },
    { key: 'websocket_incoming_frames', value: sample.refusedIncomingFrames },
    { key: 'websocket_encoded_frames', value: sample.refusedEncodedFrames },
    { key: 'websocket_encoded_batches', value: sample.refusedEncodedBatches },
    { key: 'websocket_ack_deadline', value: sample.refusedAckDeadlines },
    { key: 'websocket_output_deadline', value: sample.refusedOutputDeadlines },
  ];
}

export function capabilityRefusals(sample: CapabilityAdmissionUsage) {
  return [
    { key: 'capability_envelope', value: sample.refusedEnvelope },
    { key: 'capability_slots', value: sample.refusedSlots },
    { key: 'capability_backing', value: sample.refusedBacking },
    { key: 'capability_response', value: sample.refusedResponse },
  ];
}

export function webWorkbookRefusals(sample: WebTemplateWorkbookUsage) {
  return [
    { key: 'web_template_upload_bytes', value: sample.refusedUploadBytes },
    { key: 'web_workbook_decoder', value: sample.refusedWorkbookResources },
  ];
}

export function webTemplateRefusals(sample: WebTemplateTransportUsage) {
  return [
    { key: 'web_template_jobs', value: sample.refusedJobs },
    { key: 'web_template_reservation', value: sample.refusedReservations },
    { key: 'web_template_deadline', value: sample.refusedDeadline },
    { key: 'web_template_upload_bytes', value: sample.refusedUploadBytes },
    { key: 'web_template_export_bytes', value: sample.refusedExportBytes },
  ];
}

export function webTlsRefusals(sample: WebTlsPemUsage | WebTlsWorkUsage) {
  if ('footprint' in sample) {
    return [
      { key: 'web_tls_pem_encoded', value: sample.refusedEncoded },
      { key: 'web_tls_pem_decoded', value: sample.refusedDecoded },
      { key: 'web_tls_pem_block_policy', value: sample.refusedBlockPolicy },
    ];
  }
  return [
    { key: 'web_tls_work', value: sample.refusedWork },
    { key: 'web_tls_identity', value: sample.refusedIdentity },
    { key: 'web_tls_signer', value: sample.refusedSigner },
  ];
}

export function webUiResponseRefusals(sample: WebUiResponseUsage) {
  return [
    { key: 'web_ui_response_path', value: sample.refusedPath },
    {
      key: 'web_ui_response_conditional_headers',
      value: sample.refusedConditionalHeaders,
    },
    { key: 'web_ui_response_range_header', value: sample.refusedRangeHeader },
    { key: 'web_ui_response_ranges', value: sample.refusedRanges },
    {
      key: 'web_ui_response_metadata',
      value: sample.refusedMultipartMetadata,
    },
    { key: 'web_ui_response_deadline', value: sample.refusedDeadline },
  ];
}

export function fileAmount(
  persisted: null | string,
  fileValuePresent: boolean,
) {
  return persisted === null && !fileValuePresent
    ? quotaText('noFileValue')
    : amount(persisted);
}

export function pillForSource(source: QuotaDescriptor['source']) {
  if (source === 'env') return 'gold';
  return source === 'file' ? 'geekblue' : 'default';
}

export function pillForEffect(effect: QuotaEffect) {
  return {
    HOT_ADMISSION: 'cyan',
    HOT_AFTER_DRAIN: 'gold',
    HOT_NEXT_OPERATION: 'purple',
    RESTART_PROCESS: 'blue',
  }[effect];
}

export function sampleTime(value?: string) {
  return value ? new Date(value).toLocaleString() : quotaText('unknown');
}
