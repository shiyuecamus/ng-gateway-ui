<script setup lang="ts">
import type { ResourceAlarmScope } from '#/api/core/resource-alarms';
import type { QuotaResource } from '#/api/core/resource-quota';

import { computed, nextTick, ref, useId, watch } from 'vue';

import { Page } from '@vben/common-ui';
import {
  ArrowDown,
  ArrowUpToLine,
  Bell,
  CircleAlert,
  InspectionPanel,
  LockKeyhole,
  RotateCw,
  Settings,
} from '@vben/icons';

import { useElementSize } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Steps,
  TabPane,
  Tabs,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { quotaGroups } from '#/api/core/resource-quota';

import {
  amount,
  quotaGroupAppearance,
  quotaText,
  resourceName,
  sampleTime,
} from './modules/presentation';
import QuotaAlarms from './modules/quota-alarms.vue';
import QuotaAppDelivery from './modules/quota-app-delivery.vue';
import QuotaChannelState from './modules/quota-channel-state.vue';
import QuotaDiagnostics from './modules/quota-diagnostics.vue';
import QuotaEditDrawer from './modules/quota-edit-drawer.vue';
import QuotaOverview from './modules/quota-overview.vue';
import QuotaPolicyTable from './modules/quota-policy-table.vue';
import QuotaResourceDirectory from './modules/quota-resource-directory.vue';
import { useQuotaConsole } from './modules/use-quota-console';

defineOptions({ name: 'MaintenanceResourceQuotas' });

const {
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
} = useQuotaConsole();

const surface = ref<HTMLElement>();
const detail = ref<HTMLElement>();
const policyContent = ref<HTMLElement>();
const diagnosticsContent = ref<HTMLElement>();
const alarmContent = ref<HTMLElement>();
const operationAnnouncement = ref<HTMLElement>();
const alarmPane = ref<InstanceType<typeof QuotaAlarms>>();
const appDeliveryPane = ref<InstanceType<typeof QuotaAppDelivery>>();
const channelPane = ref<InstanceType<typeof QuotaChannelState>>();
const { width } = useElementSize(surface);
const { width: detailWidth } = useElementSize(detail);
const wideLayout = computed(() => width.value >= 1080);
const compact = computed(
  () => detailWidth.value > 0 && detailWidth.value < 790,
);
const contextColumns = computed(() =>
  detailWidth.value > 0 && detailWidth.value < 545 ? 2 : 3,
);
const activeTab = ref('overview');
const policyFilter = ref<'all' | 'differences'>('all');
const alarmResource = computed<ResourceAlarmScope | undefined>(() => {
  if (resource.value === 'extension-store')
    return { resource: 'extension_store' };
  if (resource.value === 'http-ingress')
    return { resource: 'quota_management' };
  return undefined;
});
const resourceHeadingId = useId();
const tabListId = useId();

const resourceGroup = computed(
  () =>
    quotaGroups.find(({ resources }: { resources: readonly QuotaResource[] }) =>
      resources.includes(resource.value),
    ) ?? quotaGroups[0],
);
const resourceAppearance = computed(
  () => quotaGroupAppearance[resourceGroup.value.key],
);
const readOnlyResource = computed(
  () =>
    catalogFresh.value &&
    !!catalog.value &&
    (!configured.value ||
      (fields.value.length > 0 && writable.value.length === 0)),
);
const validatorNeedsRecovery = computed(() => {
  const sample = running.value;
  return (
    runtimeFresh.value &&
    sample?.accepting &&
    'validatorReady' in sample &&
    !sample.validatorReady
  );
});
watch(
  () => catalog.value?.canReadChannels,
  (allowed) => {
    if (allowed === false && activeTab.value === 'channels')
      activeTab.value = 'overview';
  },
);
watch(
  () => catalog.value?.canReadApps,
  (allowed) => {
    if (allowed === false && activeTab.value === 'apps')
      activeTab.value = 'overview';
  },
);
function changeResource(value: QuotaResource) {
  if (value === resource.value || working.value || editOpen.value) return;
  policyFilter.value = 'all';
  selectResource(value);
  if (
    (activeTab.value === 'alarms' && !alarmResource.value) ||
    (activeTab.value === 'channels' && value !== 'southward-retained-state') ||
    (activeTab.value === 'apps' && value !== 'northward-app-configuration')
  ) {
    activeTab.value = 'overview';
  }
}

function navigateTabs(event: KeyboardEvent) {
  const focused = event.target;
  if (
    !(focused instanceof HTMLElement) ||
    focused.getAttribute('role') !== 'tab'
  )
    return;
  const tabList = focused.closest('[role="tablist"]');
  if (!tabList) return;
  const tabs = [
    ...tabList.querySelectorAll<HTMLElement>(
      '[role="tab"]:not([aria-disabled="true"])',
    ),
  ];
  const index = tabs.indexOf(focused);
  if (index === -1) return;

  let next: HTMLElement | undefined;
  switch (event.key) {
    case 'ArrowLeft': {
      next = tabs[(index + tabs.length - 1) % tabs.length];
      break;
    }
    case 'ArrowRight': {
      next = tabs[(index + 1) % tabs.length];
      break;
    }
    case 'End': {
      next = tabs.at(-1);
      break;
    }
    case 'Home': {
      next = tabs[0];
      break;
    }
    default: {
      return;
    }
  }
  event.preventDefault();
  next?.focus({ preventScroll: true });
}

const byteProjectionLabel = computed(() => {
  if (resource.value === 'southward-retained-state')
    return quotaText('channels.sharedProjection');
  if (resource.value === 'southward-configuration')
    return quotaText('southwardConfigurationBytes');
  if (resource.value === 'southward-materials')
    return quotaText('southwardMaterialBytes');
  if (resource.value === 'control-admission')
    return quotaText('controlExecutionBytes');
  if (resource.value === 'ethernet-capture')
    return quotaText('captureReservations');
  if (resource.value === 'native-libraries')
    return quotaText('nativeArtifactBytes');
  if (resource.value === 'engineering-admission')
    return quotaText('engineeringModelBytes');
  if (resource.value === 'engineering-assets')
    return quotaText('engineeringAssetStoredBytes');
  if (resource.value === 'engineering-browse')
    return quotaText('engineeringBrowseOutput');
  if (resource.value === 'engineering-mapping')
    return quotaText('engineeringMappingOutput');
  if (resource.value === 'engineering-publication')
    return quotaText('engineeringPublicationStoredBytes');
  return quotaText('units.bytes');
});

const restartDetail = computed(() => {
  if (resource.value === 'authorization-policy')
    return quotaText('authorizationRestartDetail');
  if (resource.value === 'session-admission')
    return quotaText('sessionRestartDetail');
  if (resource.value === 'web-ui-preparation')
    return quotaText('webUiPreparationRestartDetail');
  if (resource.value === 'capability-admission')
    return quotaText('capabilityRestartDetail');
  if (resource.value === 'engineering-source')
    return quotaText('engineeringSourceRestartDetail');
  if (resource.value === 'engineering-assets')
    return quotaText('engineeringAssetRestartDetail');
  if (resource.value === 'engineering-browse')
    return quotaText('engineeringBrowseRestartDetail');
  if (resource.value === 'engineering-comparison')
    return quotaText('engineeringComparisonRestartDetail');
  if (resource.value === 'engineering-mapping')
    return quotaText('engineeringMappingRestartDetail');
  if (resource.value === 'engineering-publication')
    return quotaText('engineeringPublicationRestartDetail');
  if (resource.value === 'engineering-validator')
    return quotaText('engineeringValidatorRestartDetail');
  if (resource.value === 'web-template-workbook')
    return quotaText('webWorkbookRestartDetail');
  if (resource.value === 'web-template-transport')
    return quotaText('webTemplateRestartDetail');
  if (resource.value === 'web-tls-pem' || resource.value === 'web-tls-work')
    return quotaText('webTlsRestartDetail');
  if (resource.value === 'web-ui-response')
    return quotaText('webUiResponseRestartDetail');
  if (
    resource.value === 'websocket-admission' ||
    resource.value === 'websocket-traffic'
  )
    return quotaText('websocketRestartDetail');
  return undefined;
});

const runtimeState = computed(() => {
  if (!loaded.value) return { tone: 'default', text: quotaText('loading') };
  const sample = running.value;
  if (!sample) return { tone: 'default', text: quotaText('unknown') };
  if (!runtimeFresh.value)
    return { tone: 'gold', text: quotaText('staleSample') };
  if ('replacing' in sample) {
    if (sample.replacing)
      return { tone: 'warning', text: quotaText('queueDraining') };
    if (!sample.accepting)
      return { tone: 'error', text: quotaText('notAccepting') };
    if (sample.available === '0')
      return { tone: 'volcano', text: quotaText('exhaustedLabel') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if (!sample.accepting)
    return { tone: 'error', text: quotaText('notAccepting') };
  if ('validatorReady' in sample)
    return sample.validatorReady
      ? { tone: 'success', text: quotaText('engineeringValidatorReady') }
      : { tone: 'gold', text: quotaText('engineeringValidatorUnavailable') };
  if ('maxPublications' in sample) {
    if (!sample.storage)
      return {
        tone: 'gold',
        text: quotaText('engineeringPublicationStorageUnknown'),
      };
    if (
      BigInt(sample.storage.usedCount) >= BigInt(sample.maxPublications) ||
      BigInt(sample.storage.usedBytes) >= BigInt(sample.maxPublicationBytes)
    )
      return {
        tone: 'volcano',
        text: quotaText('engineeringPublicationAdmissionFull'),
      };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('refusedPayload' in sample) {
    return sample.pending.available === '0' ||
      ('bytes' in sample && sample.bytes.available === '0')
      ? { tone: 'volcano', text: quotaText('exhaustedLabel') }
      : { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('retained' in sample) {
    if (sample.draining)
      return { tone: 'warning', text: quotaText('drainingLabel') };
    if (sample.retained.available === '0')
      return { tone: 'volcano', text: quotaText('exhaustedLabel') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('crypto' in sample) {
    if (sample.requests.available === '0')
      return { tone: 'volcano', text: quotaText('authRequestsLimited') };
    if (sample.crypto.available === '0')
      return { tone: 'gold', text: quotaText('authCryptoBusy') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('nativeWork' in sample) {
    if (sample.requests.available === '0')
      return { tone: 'volcano', text: quotaText('httpRequestSlotsFull') };
    if (sample.nativeWork.available === '0')
      return { tone: 'gold', text: quotaText('httpNativeSlotsBusy') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('globalTokensAvailable' in sample) {
    if (sample.globalTokensAvailable === '0')
      return { tone: 'volcano', text: quotaText('loginGlobalTokensEmpty') };
    if (sample.accounts.available === '0')
      return { tone: 'gold', text: quotaText('loginAccountSlotsFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('maxSessionsPerUser' in sample) {
    if (sample.activeSessions?.usage.available === '0')
      return { tone: 'volcano', text: quotaText('sessionIssuanceFull') };
    if (sample.sessionLeases?.available === '0')
      return { tone: 'gold', text: quotaText('sessionLeaseSlotsFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('refusedGraphWrite' in sample) {
    if (sample.entries.available === '0' || sample.inputBytes.available === '0')
      return { tone: 'gold', text: quotaText('authorizationCapacityFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('ticketTtlMs' in sample) {
    if (sample.connections.available === '0')
      return { tone: 'volcano', text: quotaText('websocketConnectionsFull') };
    if (sample.tickets?.available === '0')
      return { tone: 'gold', text: quotaText('websocketTicketsFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('activeAcknowledgements' in sample) {
    if (sample.activeAcknowledgements.available === '0')
      return { tone: 'gold', text: quotaText('websocketAllAwaitingAck') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('observations' in sample) {
    if (sample.observations.available === '0')
      return { tone: 'volcano', text: quotaText('capabilitySlotsFull') };
    if (sample.backing.available === '0')
      return { tone: 'gold', text: quotaText('capabilityBackingFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('capacityCeiling' in sample) {
    if (sample.jobs.available === '0')
      return { tone: 'volcano', text: quotaText('webTemplateAllSlotsUsed') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('workBacking' in sample) {
    if (
      BigInt(sample.retainedBacking.available) <
      BigInt(sample.effectiveSignerBytes)
    )
      return {
        tone: 'volcano',
        text: quotaText('webTlsSignerAtCapacity', {
          bytes: amount(sample.effectiveSignerBytes),
        }),
      };
    if (BigInt(sample.workBacking.available) < BigInt(sample.maxWorkBytes))
      return { tone: 'gold', text: quotaText('webTlsWorkAtCapacity') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('preparationWorkBytes' in sample) {
    if (sample.retainedBytes.available === '0')
      return { tone: 'volcano', text: quotaText('webUiRetainedFull') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('cachedModels' in sample) {
    if (resource.value === 'engineering-assets') {
      if (sample.assetStoreAvailable === false)
        return {
          tone: 'error',
          text: quotaText('engineeringAssetStoreUnavailable'),
        };
      if (
        sample.storedAssets?.available === '0' ||
        sample.storedAssetBytes?.available === '0'
      )
        return {
          tone: 'volcano',
          text: quotaText('engineeringAssetAdmissionFull'),
        };
    }
    if (sample.jobs.available === '0')
      return { tone: 'volcano', text: quotaText('engineeringJobsLimited') };
    if (
      resource.value === 'engineering-browse' &&
      sample.pageOutputBytes &&
      sample.maxBrowseBytes !== undefined &&
      BigInt(sample.pageOutputBytes.available) < BigInt(sample.maxBrowseBytes)
    )
      return {
        tone: 'volcano',
        text: quotaText('engineeringBrowseOutputFull'),
      };
    if (
      resource.value === 'engineering-mapping' &&
      sample.maxMappingBytes !== undefined &&
      sample.mappingOutputBytes &&
      sample.publicationSnapshotBytes
    ) {
      const perMapping = BigInt(sample.maxMappingBytes);
      if (BigInt(sample.mappingOutputBytes.available) < perMapping)
        return {
          tone: 'volcano',
          text: quotaText('engineeringMappingOutputFull'),
        };
      if (BigInt(sample.publicationSnapshotBytes.available) < perMapping)
        return {
          tone: 'gold',
          text: quotaText('engineeringPublicationSnapshotFull'),
        };
    }
    if (sample.modelBytes.available === '0')
      return { tone: 'gold', text: quotaText('engineeringPoolOccupied') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('loads' in sample) {
    if (sample.loads.available === '0')
      return { tone: 'gold', text: quotaText('nativeLoadsBusy') };
    if (sample.images.available === '0' || sample.bytes.available === '0')
      return { tone: 'volcano', text: quotaText('nativeNewImagesLimited') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('preflight' in sample) {
    if (sample.draining)
      return { tone: 'warning', text: quotaText('drainingLabel') };
    const requestBytes = BigInt(sample.maxRequestBytes);
    const preflightLimited =
      sample.preflight.available === '0' ||
      BigInt(sample.preflightBytes.available) < requestBytes;
    const executionLimited =
      sample.pending.available === '0' ||
      BigInt(sample.bytes.available) < requestBytes;
    if (preflightLimited && executionLimited)
      return { tone: 'volcano', text: quotaText('exhaustedLabel') };
    if (preflightLimited)
      return { tone: 'gold', text: quotaText('controlPreflightLimited') };
    if (executionLimited)
      return { tone: 'gold', text: quotaText('controlExecutionLimited') };
    return { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('interfaces' in sample) {
    return sample.interfaces.available === '0' || sample.bytes.available === '0'
      ? { tone: 'volcano', text: quotaText('exhaustedLabel') }
      : { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if ('compilations' in sample) {
    return sample.compilations.available === '0' ||
      sample.bytes.available === '0'
      ? { tone: 'volcano', text: quotaText('exhaustedLabel') }
      : { tone: 'success', text: quotaText('acceptingLabel') };
  }
  if (!('pending' in sample && 'bytes' in sample))
    return { tone: 'success', text: quotaText('acceptingLabel') };
  if (sample.draining)
    return { tone: 'warning', text: quotaText('drainingLabel') };
  const needed =
    'execution' in sample
      ? 1n
      : BigInt(sample.maxRequestBytes) + BigInt(sample.maxResultBytes);
  if (
    sample.pending.available === '0' ||
    BigInt(sample.bytes.available) < needed
  ) {
    return { tone: 'volcano', text: quotaText('exhaustedLabel') };
  }
  if ('execution' in sample && sample.execution.available === '0') {
    return { tone: 'gold', text: quotaText('executionBusy') };
  }
  return { tone: 'success', text: quotaText('acceptingLabel') };
});

const operationState = computed(() => {
  const phase = receipt.value?.phase;
  if (waitingForRestart.value)
    return { tone: 'blue', label: 'pendingRestartLabel', step: 2 };
  if (phase === 'APPLIED')
    return { tone: 'success', label: 'appliedLabel', step: 3 };
  if (phase === 'DESIRED_COMMITTED')
    return { tone: 'blue', label: 'savedLabel', step: 2 };
  if (phase === 'PREPARED')
    return { tone: 'processing', label: 'preparedLabel', step: 1 };
  if (phase === 'SOURCE_CONFLICT' || phase === 'PERMISSION_REVOKED') {
    return { tone: 'error', label: 'blockedLabel', step: undefined };
  }
  if (working.value && !phase)
    return { tone: 'processing', label: 'submittingLabel', step: undefined };
  return { tone: 'warning', label: 'needsCheckLabel', step: undefined };
});

const operationSteps = computed(() => [
  { title: quotaText('journalStep') },
  { title: quotaText('fileStep') },
  { title: quotaText('runtimeStep') },
]);

async function showPolicyDifferences() {
  policyFilter.value = 'differences';
  activeTab.value = 'policies';
  await nextTick();
  policyContent.value?.focus({ preventScroll: true });
  policyContent.value?.scrollIntoView({ block: 'start' });
}

async function showDiagnostics() {
  activeTab.value = 'diagnostics';
  await nextTick();
  diagnosticsContent.value?.focus({ preventScroll: true });
  diagnosticsContent.value?.scrollIntoView({ block: 'nearest' });
}

async function showManagementAlarms() {
  activeTab.value = 'alarms';
  await nextTick();
  alarmContent.value?.focus({ preventScroll: true });
  alarmContent.value?.scrollIntoView({ block: 'nearest' });
}

function focusOperation() {
  operationAnnouncement.value?.focus({ preventScroll: true });
}

async function confirmChange() {
  const previous = retained.value;
  const submitting = submit();
  await nextTick();
  if (!previous && retained.value) focusOperation();
  await submitting;
}

async function refreshPage() {
  await refresh();
  await Promise.all([
    alarmPane.value?.refresh(),
    appDeliveryPane.value?.refresh(),
    channelPane.value?.refresh(),
  ]);
}
</script>

<template>
  <Page content-class="!p-3 sm:!p-5 lg:!p-6">
    <div
      ref="surface"
      class="quota-workspace mx-auto w-full min-w-0 max-w-[1600px]"
    >
      <header class="quota-page-header">
        <h1 class="quota-page-title m-0 font-semibold tracking-tight">
          {{ quotaText('title') }}
        </h1>
      </header>

      <div class="quota-layout" :class="{ 'quota-layout--wide': wideLayout }">
        <div class="quota-layout__directory min-w-0">
          <QuotaResourceDirectory
            :disabled="working || editOpen"
            :resource="resource"
            :wide="wideLayout"
            @change="changeResource"
          />
        </div>
        <div
          ref="detail"
          :style="{ '--quota-family': resourceAppearance.accent }"
          class="quota-layout__content min-w-0"
        >
          <Card
            :aria-labelledby="resourceHeadingId"
            class="quota-context min-w-0"
            role="region"
          >
            <div class="quota-context-lead">
              <div class="quota-identity min-w-0">
                <span class="quota-resource-icon" aria-hidden="true">
                  <component :is="resourceAppearance.icon" :size="24" />
                </span>
                <div class="min-w-0">
                  <Tag :color="resourceAppearance.color" class="quota-tag !m-0">
                    {{ quotaText(`resourceGroups.${resourceGroup.key}`) }}
                  </Tag>
                  <h2
                    :id="resourceHeadingId"
                    class="quota-resource-title mb-0 mt-1 font-semibold tracking-tight"
                  >
                    {{ resourceName(resource) }}
                  </h2>
                </div>
              </div>

              <div
                class="quota-context-actions flex flex-wrap items-center gap-2"
              >
                <Button
                  :loading="refreshing"
                  :disabled="working"
                  @click="refreshPage"
                >
                  <template #icon>
                    <RotateCw :size="15" aria-hidden="true" />
                  </template>
                  {{ quotaText('refresh') }}
                </Button>
                <Button
                  v-if="configured && !readOnlyResource"
                  type="primary"
                  :disabled="!mayStart || working"
                  @click="openEditor"
                >
                  <template #icon>
                    <Settings :size="15" aria-hidden="true" />
                  </template>
                  {{ quotaText(finished ? 'newChange' : 'adjust') }}
                </Button>
              </div>
            </div>
            <Descriptions
              :column="contextColumns"
              :colon="false"
              class="quota-context-meta"
              layout="vertical"
              size="small"
            >
              <DescriptionsItem :label="quotaText('runtimeStatus')">
                <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Tag
                    :color="runtimeState.tone"
                    class="quota-tag !m-0"
                    role="status"
                  >
                    <span class="quota-tag-dot" aria-hidden="true"></span>
                    {{ runtimeState.text }}
                  </Tag>
                  <Tag v-if="readOnlyResource" class="quota-tag !m-0">
                    <span class="inline-flex items-center gap-1">
                      <LockKeyhole :size="12" aria-hidden="true" />
                      {{ quotaText('readOnly') }}
                    </span>
                  </Tag>
                </div>
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('revision')">
                <span class="quota-context-reading">{{
                  amount(running?.policyRevision)
                }}</span>
              </DescriptionsItem>
              <DescriptionsItem
                :label="quotaText('sampledAt')"
                :span="contextColumns === 2 ? 2 : 1"
              >
                <time
                  v-if="running"
                  :datetime="running.sampledAt"
                  class="quota-context-reading"
                >
                  {{ sampleTime(running.sampledAt) }}
                </time>
                <span v-else class="text-muted-foreground">{{
                  quotaText('unknown')
                }}</span>
              </DescriptionsItem>
            </Descriptions>
          </Card>

          <Alert
            v-if="loaded && (!runtimeFresh || !catalogFresh)"
            show-icon
            type="warning"
            :message="
              quotaText(
                running || fields.length > 0
                  ? 'staleReadings'
                  : 'usageUnavailable',
              )
            "
          />
          <Alert
            v-else-if="running && 'replacing' in running && running.replacing"
            show-icon
            type="warning"
            :message="quotaText('queueDrainActive')"
          />
          <Alert
            v-else-if="running && !running.accepting"
            show-icon
            type="warning"
            :message="quotaText('unavailable')"
          />
          <Alert
            v-else-if="running && 'draining' in running && running.draining"
            show-icon
            type="warning"
            :message="quotaText('draining')"
          />
          <Alert
            v-else-if="validatorNeedsRecovery"
            show-icon
            type="warning"
            :message="quotaText('engineeringValidatorRecoveryHint')"
          >
            <template #action>
              <Button size="small" @click="showDiagnostics">
                {{ quotaText('viewDiagnostics') }}
              </Button>
            </template>
          </Alert>
          <Alert
            v-if="comparison?.differs"
            show-icon
            type="warning"
            :message="quotaText('sourceDrift')"
          >
            <template #action>
              <Button size="small" @click="showPolicyDifferences">
                {{ quotaText('viewPolicyDifferences') }}
              </Button>
            </template>
          </Alert>
          <Alert
            v-else-if="comparison?.unconfirmed"
            show-icon
            type="info"
            :message="quotaText('policyComparisonIncomplete')"
          />
          <Alert
            v-if="writerBlock && (!retained || finished)"
            show-icon
            type="warning"
            :message="writerBlock"
          />
          <Alert
            v-if="operationFault && !retained"
            show-icon
            type="warning"
            :message="operationFault"
          />

          <Card
            v-if="retained"
            class="quota-operation min-w-0"
            :class="`quota-operation--${operationState.tone}`"
            size="small"
          >
            <template #title>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="m-0 text-sm font-semibold">
                  {{ quotaText('operation') }}
                </h2>
                <Tag class="quota-tag !m-0" color="geekblue">
                  {{ resourceName(retained.resource) }}
                </Tag>
                <Tag :color="operationState.tone" class="quota-tag !m-0">
                  {{ quotaText(operationState.label) }}
                </Tag>
              </div>
            </template>
            <div class="space-y-3">
              <p
                ref="operationAnnouncement"
                role="status"
                tabindex="-1"
                class="m-0 text-sm"
              >
                {{
                  receipt
                    ? quotaText(
                        waitingForRestart
                          ? 'awaitingVerifiedBoot'
                          : `phases.${receipt.phase}`,
                      )
                    : working
                      ? quotaText('submittingLabel')
                      : quotaText('operationUnconfirmed')
                }}
              </p>
              <Steps
                v-if="operationState.step !== undefined && !compact"
                :current="operationState.step"
                :items="operationSteps"
                :status="waitingForRestart ? 'wait' : undefined"
                size="small"
              />
              <TypographyText
                v-if="
                  waitingForRestart &&
                  retained.resource === 'authorization-policy'
                "
                type="secondary"
              >
                {{ quotaText('authorizationPendingConstraint') }}
              </TypographyText>
              <Descriptions
                :colon="false"
                v-if="receipt"
                :column="{ xs: 1, sm: 2 }"
                size="small"
              >
                <DescriptionsItem :label="quotaText('operationId')">
                  <TypographyText
                    code
                    :copyable="{ text: receipt.operationId }"
                    :title="receipt.operationId"
                  >
                    {{ receipt.operationId.slice(0, 8) }}
                  </TypographyText>
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="receipt.applied"
                  :label="quotaText('appliedRevision')"
                >
                  <span class="tabular-nums">{{
                    amount(receipt.applied.policyRevision)
                  }}</span>
                </DescriptionsItem>
              </Descriptions>
              <Alert
                v-if="operationFault"
                show-icon
                type="warning"
                :message="operationFault"
              />
              <div v-if="!finished" class="flex flex-wrap gap-2">
                <Button
                  v-if="comparison?.pendingRestart && !comparison.differs"
                  size="small"
                  @click="showPolicyDifferences"
                >
                  {{ quotaText('viewPolicyDifferences') }}
                </Button>
                <Button
                  type="text"
                  size="small"
                  :loading="refreshing"
                  :disabled="working"
                  @click="refreshPage"
                >
                  {{ quotaText('refreshStatus') }}
                </Button>
                <Button
                  v-if="!waitingForRestart"
                  size="small"
                  :disabled="!mayRetry"
                  :loading="working"
                  @click="submit"
                >
                  {{ quotaText('retry') }}
                </Button>
              </div>
            </div>
          </Card>

          <section
            class="quota-tabs min-w-0"
            :aria-label="quotaText('workspaceTabs')"
            @keydown="navigateTabs"
          >
            <Tabs
              :id="tabListId"
              v-model:active-key="activeTab"
              :tab-bar-gutter="compact ? 8 : 12"
            >
              <TabPane key="overview">
                <template #tab>
                  <span class="quota-tab-label">
                    <InspectionPanel :size="15" aria-hidden="true" />
                    {{ quotaText('overviewTab') }}
                  </span>
                </template>
                <QuotaOverview
                  :management="quotaManagement"
                  :management-fresh="runtimeFresh"
                  :process-rss="processRss"
                  :resource="resource"
                  :running="running"
                  :loaded="loaded"
                  @diagnostics="showDiagnostics"
                  @management-alarms="showManagementAlarms"
                />
              </TabPane>
              <TabPane key="policies">
                <template #tab>
                  <span class="quota-tab-label">
                    <Settings :size="15" aria-hidden="true" />
                    {{ quotaText('policyTab') }}
                  </span>
                </template>
                <div
                  ref="policyContent"
                  role="region"
                  :aria-label="quotaText('configuration')"
                  tabindex="-1"
                  class="scroll-mt-24 rounded-md focus-visible:outline-primary"
                >
                  <QuotaPolicyTable
                    v-model:filter="policyFilter"
                    :resource="resource"
                    :fields="fields"
                    :comparisons="comparison?.byField"
                    :running="running"
                    :loaded="loaded"
                    :compact="compact"
                  />
                </div>
              </TabPane>
              <TabPane key="diagnostics">
                <template #tab>
                  <span class="quota-tab-label">
                    <CircleAlert :size="15" aria-hidden="true" />
                    {{ quotaText('refusals') }}
                  </span>
                </template>
                <div
                  ref="diagnosticsContent"
                  role="region"
                  :aria-label="quotaText('refusals')"
                  tabindex="-1"
                  class="rounded-md focus-visible:outline-primary"
                >
                  <QuotaDiagnostics
                    :resource="resource"
                    :running="running"
                    :compact="compact"
                  />
                </div>
              </TabPane>
              <TabPane
                v-if="
                  resource === 'southward-retained-state' &&
                  catalog?.canReadChannels
                "
                key="channels"
              >
                <template #tab>
                  <span class="quota-tab-label">
                    <ArrowDown :size="15" aria-hidden="true" />
                    {{ quotaText('channels.tab') }}
                  </span>
                </template>
                <QuotaChannelState
                  ref="channelPane"
                  :active="activeTab === 'channels'"
                />
              </TabPane>
              <TabPane
                v-if="
                  resource === 'northward-app-configuration' &&
                  catalog?.canReadApps
                "
                key="apps"
              >
                <template #tab>
                  <span class="quota-tab-label">
                    <ArrowUpToLine :size="15" aria-hidden="true" />
                    {{ quotaText('apps.tab') }}
                  </span>
                </template>
                <QuotaAppDelivery
                  ref="appDeliveryPane"
                  :active="activeTab === 'apps'"
                />
              </TabPane>
              <TabPane v-if="alarmResource" key="alarms">
                <template #tab>
                  <span class="quota-tab-label">
                    <Bell :size="15" aria-hidden="true" />
                    {{ quotaText('alarms.title') }}
                  </span>
                </template>
                <div
                  v-if="activeTab === 'alarms'"
                  ref="alarmContent"
                  role="region"
                  :aria-label="quotaText('alarms.title')"
                  tabindex="-1"
                  class="rounded-md focus-visible:outline-primary"
                >
                  <QuotaAlarms
                    :key="alarmResource.resource"
                    ref="alarmPane"
                    :scope="alarmResource"
                  />
                </div>
              </TabPane>
            </Tabs>
          </section>
        </div>
      </div>
    </div>

    <QuotaEditDrawer
      v-model:open="editOpen"
      :can-confirm="mayStart"
      :can-preview="canPreview"
      :edited-count="edited.length"
      :fields="writable"
      :field-errors="fieldErrors"
      :fault="writerBlock || editFault"
      :focus-receipt-on-close="!!retained"
      :pending-label="
        quotaText(
          {
            'auth-admission': 'authRequests',
            'authorization-policy': 'authorizationEntryCount',
            'control-admission': 'controlExecutionCount',
            'capability-admission': 'capabilitySlots',
            'engineering-admission': 'engineeringJobs',
            'engineering-assets': 'engineeringAssetCount',
            'engineering-browse': 'engineeringBrowseLimits',
            'engineering-comparison': 'engineeringComparisonLimits',
            'engineering-mapping': 'engineeringMappingLimits',
            'engineering-publication': 'engineeringPublicationStoredCount',
            'engineering-source': 'engineeringSourceLimits',
            'engineering-validator': 'engineeringValidatorLimits',
            'ethernet-capture': 'captureInterfaces',
            'extension-store': 'pending',
            'http-ingress': 'httpRequestSlots',
            'login-admission': 'loginAccountSlots',
            'native-libraries': 'nativeArtifactCount',
            'northward-app-configuration': 'appPublications',
            'northward-events': 'eventsPending',
            'northward-event-queue': 'queueSlots',
            'session-admission': 'sessionPersistedCount',
            'websocket-admission': 'websocketTicketCount',
            'websocket-traffic': 'websocketAwaitingAck',
            'web-ui-preparation': 'webUiAssetCount',
            'web-ui-response': 'webUiResponse',
            'web-tls-pem': 'webTlsPem',
            'web-tls-work': 'webTlsWorkerBacking',
            'web-template-transport': 'webTemplateJobs',
            'web-template-workbook': 'webTemplateWorkbook',
            'southward-retained-state': 'southwardRetainedBytes',
            'southward-configuration': 'southwardConfigurationOperations',
            'southward-materials': 'southwardMaterialTasks',
          }[resource],
        )
      "
      :preview="preview?.result"
      :values="editValues"
      :working="working"
      :resource="resource"
      :resource-accent="resourceAppearance.accent"
      :resource-color="resourceAppearance.color"
      :resource-name="resourceName(resource)"
      :restart-detail="restartDetail"
      :bytes-label="byteProjectionLabel"
      :after-drain="resource === 'northward-event-queue'"
      @change="editField"
      @closed="focusOperation"
      @preview="calculatePreview"
      @back="returnToEdit"
      @confirm="confirmChange"
    />
  </Page>
</template>

<style scoped>
.quota-workspace {
  container: quota-workspace / inline-size;
}

.quota-page-header {
  margin-block-end: clamp(0.8rem, 1.5cqi, 1.3rem);
}

.quota-page-title {
  font-size: clamp(1.4rem, 2.4cqi, 2rem);
  line-height: 1.18;
}

.quota-layout,
.quota-layout__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.85rem;
}

.quota-layout--wide {
  grid-template-columns: clamp(228px, 19cqi, 264px) minmax(0, 1fr);
  gap: 1.15rem;
  align-items: start;
}

.quota-layout--wide .quota-layout__directory {
  position: sticky;
  inset-block-start: 1rem;
}

.quota-layout__content {
  container: quota-detail / inline-size;
}

.quota-context {
  --quota-context-padding: clamp(0.8rem, 2.2cqi, 1.5rem);

  overflow: hidden;
  border-radius: 16px;
}

.quota-context :deep(.ant-card-body) {
  padding: 0;
}

.quota-context-lead {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  align-items: center;
  justify-content: space-between;
  padding: var(--quota-context-padding);
  background: radial-gradient(
    ellipse at top left,
    color-mix(in srgb, var(--quota-family) 22%, hsl(var(--card))),
    color-mix(in srgb, var(--quota-family) 6%, hsl(var(--card))) 65%,
    hsl(var(--card))
  );
}

.quota-identity {
  display: flex;
  gap: clamp(0.65rem, 1.45cqi, 1rem);
  align-items: center;
}

.quota-resource-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: clamp(2.6rem, 6cqi, 3.3rem);
  height: clamp(2.6rem, 6cqi, 3.3rem);
  color: color-mix(in srgb, var(--quota-family) 63%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--quota-family) 19%, hsl(var(--card)));
  border: 1px solid
    color-mix(in srgb, var(--quota-family) 24%, hsl(var(--border)));
  border-radius: 13px;
}

.quota-resource-title {
  font-size: clamp(1.18rem, 2.55cqi, 1.75rem);
  line-height: 1.22;
  overflow-wrap: anywhere;
}

.quota-context-meta {
  padding: 0.7rem var(--quota-context-padding);
  border-block-start: 1px solid hsl(var(--border));
}

.quota-context-meta :deep(.ant-descriptions-item-label) {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.quota-context-meta :deep(.ant-descriptions-row > th) {
  padding-block-end: 0.25rem;
}

.quota-context-meta :deep(.ant-descriptions-row > td) {
  padding-block-end: 0.55rem;
}

.quota-context-meta :deep(.ant-descriptions-row:last-child > td) {
  padding-block-end: 0;
}

.quota-context-reading {
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.quota-tag-dot {
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  margin-inline-end: 0.2rem;
  vertical-align: 0.08em;
  background: currentcolor;
  border-radius: 50%;
}

.quota-context-actions :deep(.ant-btn) {
  min-height: 2.5rem;
}

.quota-context .quota-tag {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quota-operation {
  border-inline-start: 3px solid #3782ee;
  border-radius: 12px;
}

.quota-operation--success {
  border-inline-start-color: #3b9b68;
}

.quota-operation--warning {
  border-inline-start-color: #d59031;
}

.quota-operation--error {
  border-inline-start-color: #d25860;
}

.quota-tabs :deep(.ant-tabs-nav) {
  padding: 0.3rem;
  margin-bottom: 0.75rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.quota-tabs :deep(.ant-tabs-nav::before) {
  border-bottom: 0;
}

.quota-tab-label {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
}

.quota-tabs :deep(.ant-tabs-tab) {
  padding: 0;
}

.quota-tabs :deep(.ant-tabs-tab-btn) {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding-inline: clamp(0.45rem, 1.3cqi, 0.85rem);
  border-radius: 8px;
}

@container quota-detail (max-width: 465px) {
  .quota-tab-label > svg {
    display: none;
  }
}

.quota-tabs :deep(.ant-tabs-tab-btn:focus-visible) {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.quota-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  font-weight: 600;
  color: color-mix(in srgb, var(--quota-family) 52%, hsl(var(--foreground)));
  text-shadow: none;
  background: color-mix(in srgb, var(--quota-family) 15%, hsl(var(--card)));
}

.quota-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}
</style>

<style>
/* These labels keep Ant Design's semantic backgrounds and use readable foreground colors. */
.quota-tag {
  --quota-tag-success: #166534;
  --quota-tag-warning: #854508;
  --quota-tag-error: #9a321b;
  --quota-tag-information: #1e40af;
  --quota-tag-active: #115e59;
  --quota-tag-policy: #60269e;
  --quota-tag-identity: #852454;
}

.dark .quota-tag {
  --quota-tag-success: #c1f4ce;
  --quota-tag-warning: #ffdfac;
  --quota-tag-error: #ffd0c2;
  --quota-tag-information: #c4dcff;
  --quota-tag-active: #a8f2e8;
  --quota-tag-policy: #e3c5ff;
  --quota-tag-identity: #f8bad9;
}

.quota-tag.ant-tag-success,
.quota-tag.ant-tag-green {
  color: var(--quota-tag-success);
}

.quota-tag.ant-tag-warning,
.quota-tag.ant-tag-gold,
.quota-tag.ant-tag-orange {
  color: var(--quota-tag-warning);
}

.quota-tag.ant-tag-error,
.quota-tag.ant-tag-red,
.quota-tag.ant-tag-volcano {
  color: var(--quota-tag-error);
}

.quota-tag.ant-tag-blue,
.quota-tag.ant-tag-geekblue,
.quota-tag.ant-tag-processing {
  color: var(--quota-tag-information);
}

.quota-tag.ant-tag-cyan {
  color: var(--quota-tag-active);
}

.quota-tag.ant-tag-purple {
  color: var(--quota-tag-policy);
}

.quota-tag.ant-tag-magenta {
  color: var(--quota-tag-identity);
}
</style>
