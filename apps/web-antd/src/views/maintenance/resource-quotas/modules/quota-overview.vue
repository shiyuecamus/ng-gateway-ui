<script setup lang="ts">
import type {
  ProcessRssObservation,
  QuotaManagementUsage,
  QuotaResource,
  QuotaUsage,
  QuotaUse,
} from '#/api/core/resource-quota';

import { computed } from 'vue';

import {
  ChevronRight,
  CircleAlert,
  Grip,
  Inbox,
  InspectionPanel,
} from '@vben/icons';

import {
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  Progress,
  Skeleton,
  Statistic,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  amount,
  compactBytes,
  quotaText,
  refusalTotal,
  sampleTime,
  utilization,
} from './presentation';

const props = defineProps<{
  loaded: boolean;
  management?: QuotaManagementUsage;
  managementFresh: boolean;
  processRss?: ProcessRssObservation;
  resource: QuotaResource;
  running?: QuotaUsage;
}>();

defineEmits<{ diagnostics: []; managementAlarms: [] }>();

const managementStatus = computed(() => {
  const sample = props.management;
  if (!sample) return undefined;
  if (!props.managementFresh) return { color: 'gold', label: 'staleSample' };
  if (!sample.accepting) return { color: 'volcano', label: 'notAccepting' };
  if (sample.requests.available === '0')
    return { color: 'gold', label: 'quotaManagementFull' };
  return { color: 'success', label: 'acceptingLabel' };
});
const managementAmounts = computed(() => {
  const sample = props.management;
  if (!sample) return [];
  return [
    { label: 'quotaManagementRequests', usage: sample.requests, unit: 'count' },
    { label: 'quotaManagementNative', usage: sample.nativeWork, unit: 'count' },
    { label: 'quotaManagementBacking', usage: sample.backing, unit: 'bytes' },
  ];
});
const managementRefusals = computed(() => {
  const sample = props.management;
  if (!sample) return [];
  return [
    {
      label: 'quotaManagementRefusedRequests',
      value: sample.refusedRequestSlots,
    },
    {
      label: 'quotaManagementRefusedArrival',
      value: sample.refusedArrivalBacking,
    },
    { label: 'quotaManagementRefusedNative', value: sample.refusedNativeSlots },
    {
      label: 'quotaManagementRefusedSource',
      value: sample.refusedSourceBacking,
    },
  ];
});

const isEventResource = computed(() => props.resource === 'northward-events');
const isWebUiPreparation = computed(
  () => props.resource === 'web-ui-preparation',
);
const webUi = computed(() => {
  const sample = props.running;
  return sample && 'preparationWorkBytes' in sample ? sample : undefined;
});
const isWebUiResponse = computed(() => props.resource === 'web-ui-response');
const isWebTemplate = computed(
  () => props.resource === 'web-template-transport',
);
const webTemplate = computed(() => {
  const sample = props.running;
  return sample && 'capacityCeiling' in sample ? sample : undefined;
});
const templateJobBudget = computed(() =>
  webTemplate.value ? compactBytes(webTemplate.value.capacityBytes) : undefined,
);
const isWebWorkbook = computed(
  () => props.resource === 'web-template-workbook',
);
const webWorkbook = computed(() => {
  const sample = props.running;
  return sample && 'parsedWorkbooks' in sample ? sample : undefined;
});
const isWebTlsPem = computed(() => props.resource === 'web-tls-pem');
const usesMeasuredInputs = computed(
  () =>
    isWebUiResponse.value ||
    isWebTlsPem.value ||
    isWebTemplate.value ||
    isWebWorkbook.value,
);
const webTlsPem = computed(() => {
  const sample = props.running;
  return sample && 'footprint' in sample ? sample : undefined;
});
const webTlsWork = computed(() => {
  const sample = props.running;
  return sample && 'workBacking' in sample ? sample : undefined;
});
const webUiResponse = computed(() => {
  const sample = props.running;
  return sample && 'minAssetRequestPathBytes' in sample ? sample : undefined;
});
const observedDimensions = computed<
  {
    history?: string;
    label: string;
    maximum?: string;
    unit: string;
    value?: string;
  }[]
>(() => {
  const workbook = webWorkbook.value;
  if (workbook) {
    return [
      {
        label: 'webTemplateLargestUpload',
        value: workbook.peakUploadedBytes,
        maximum: workbook.limits.find(({ key }) => key === 'max_file_bytes')
          ?.limit,
        unit: 'bytes',
      },
      {
        label: 'webWorkbookParsed',
        value: workbook.parsedWorkbooks,
        unit: 'count',
      },
      {
        label: 'webWorkbookPeakDataRow',
        value: workbook.peakParsedDataRow ?? undefined,
        unit: 'row',
      },
    ];
  }
  const templates = webTemplate.value;
  if (templates) {
    return [
      {
        label: 'webTemplateLargestUpload',
        value: templates.peakUploadBytes,
        maximum: templates.maxUploadBytes,
        unit: 'bytes',
      },
      {
        label: 'webTemplateLargestExport',
        value: templates.peakExportBytes,
        maximum: templates.maxExportBytes,
        unit: 'bytes',
      },
    ];
  }
  const tls = webTlsPem.value;
  if (tls) {
    return [
      {
        label: 'webTlsEncodedObserved',
        value: tls.footprint.encodedBytes,
        history: tls.peak.encodedBytes,
        unit: 'bytes',
      },
      {
        label: 'webTlsDerBlockObserved',
        value: tls.footprint.derBlockBytes,
        history: tls.peak.derBlockBytes,
        unit: 'bytes',
      },
      {
        label: 'webTlsDerTotalObserved',
        value: tls.footprint.derTotalBytes,
        history: tls.peak.derTotalBytes,
        unit: 'bytes',
      },
      {
        label: 'webTlsChainObserved',
        value: tls.footprint.certificates,
        history: tls.peak.certificates,
        unit: 'count',
      },
    ];
  }
  const sample = webUiResponse.value;
  if (!sample) return [];
  return [
    {
      label: 'webUiResponsePeakPath',
      value: sample.peakPathBytes,
      unit: 'bytes',
    },
    {
      label: 'webUiResponsePeakConditional',
      value: sample.peakConditionalBytes,
      unit: 'bytes',
    },
    {
      label: 'webUiResponsePeakRangeHeader',
      value: sample.peakRangeHeaderBytes,
      unit: 'bytes',
    },
    {
      label: 'webUiResponsePeakRanges',
      value: sample.peakRanges,
      unit: 'count',
    },
    {
      label: 'webUiResponsePeakMultipart',
      value: sample.peakMultipartMetadataBytes,
      unit: 'bytes',
    },
    {
      label: 'webUiResponsePeakAssembly',
      value: sample.peakAssemblyMs,
      unit: 'milliseconds',
    },
  ];
});
const isLoginResource = computed(() => props.resource === 'login-admission');
const login = computed(() => {
  const sample = props.running;
  return sample && 'globalTokensAvailable' in sample ? sample : undefined;
});
const loginTokenRatio = computed(() =>
  login.value
    ? utilization({
        limit: login.value.globalTokenCapacity,
        used: login.value.globalTokensAvailable,
      })
    : undefined,
);
const configuration = computed(() => {
  const sample = props.running;
  return sample && 'refusedPayload' in sample && 'bytes' in sample
    ? sample
    : undefined;
});
const southward = computed(() => {
  const sample = props.running;
  return sample && 'retained' in sample ? sample : undefined;
});
const authentication = computed(() => {
  const sample = props.running;
  return sample && 'crypto' in sample ? sample : undefined;
});
const httpIngress = computed(() => {
  const sample = props.running;
  return sample && 'nativeWork' in sample ? sample : undefined;
});
const session = computed(() => {
  const sample = props.running;
  return sample && 'maxSessionsPerUser' in sample ? sample : undefined;
});
const authorization = computed(() => {
  const sample = props.running;
  return sample && 'refusedGraphWrite' in sample ? sample : undefined;
});
const websocket = computed(() => {
  const sample = props.running;
  return sample && 'ticketTtlMs' in sample ? sample : undefined;
});
const websocketTraffic = computed(() => {
  const sample = props.running;
  return sample && 'activeAcknowledgements' in sample ? sample : undefined;
});
const trafficPeaks = computed(() => {
  const sample = websocketTraffic.value;
  if (!sample) return [];
  return [
    {
      label: 'websocketPeakMessages',
      value: sample.peakMessagesPerSecond,
      unit: 'count',
    },
    {
      label: 'websocketPeakSubscriptions',
      value: sample.peakSubscriptions,
      unit: 'count',
    },
    {
      label: 'websocketPeakSnapshotEntries',
      value: sample.peakSnapshotEntries,
      unit: 'count',
    },
    {
      label: 'websocketPeakEncodedFrame',
      value: sample.peakEncodedFrameBytes,
      unit: 'bytes',
    },
    {
      label: 'websocketPeakEncodedBatch',
      value: sample.peakEncodedBatchBytes,
      unit: 'bytes',
    },
  ];
});
const control = computed(() => {
  const sample = props.running;
  return sample && 'preflight' in sample ? sample : undefined;
});
const controlResource = computed(() => props.resource === 'control-admission');
const capability = computed(() => {
  const sample = props.running;
  return sample && 'observations' in sample ? sample : undefined;
});
const nativeResource = computed(() => props.resource === 'native-libraries');
const engineeringResource = computed(
  () => props.resource === 'engineering-admission',
);
const engineering = computed(() => {
  const sample = props.running;
  return sample && 'cachedModels' in sample ? sample : undefined;
});
const engineeringPublication = computed(() => {
  const sample = props.running;
  return sample && 'maxPublications' in sample ? sample : undefined;
});
const engineeringValidator = computed(() => {
  const sample = props.running;
  return sample && 'validatorReady' in sample ? sample : undefined;
});

function publicationCharge(limit: string, used: string) {
  const remaining = BigInt(limit) - BigInt(used);
  return {
    limit,
    used,
    available: (remaining > 0n ? remaining : 0n).toString(),
  };
}
const engineeringLimits = computed(() => {
  const sample = engineering.value;
  if (props.resource === 'engineering-validator') {
    const validator = engineeringValidator.value;
    return {
      title: 'engineeringValidatorLimits',
      fields: [
        {
          key: 'request_timeout_ms',
          value: validator?.requestTimeoutMs,
          unit: 'milliseconds',
        },
        {
          key: 'validator_timeout_ms',
          value: validator?.validatorTimeoutMs,
          unit: 'milliseconds',
        },
        {
          key: 'max_diagnostic_bytes',
          value: validator?.maxDiagnosticBytes,
          unit: 'bytes',
        },
        {
          key: 'validator_heap_bytes',
          value: validator?.validatorHeapBytes,
          unit: 'bytes',
        },
        ...(validator?.validatorAddressSpaceBytes
          ? [
              {
                key: 'validator_address_space_bytes',
                value: validator.validatorAddressSpaceBytes,
                unit: 'bytes',
              },
            ]
          : []),
      ],
    };
  }
  if (props.resource === 'engineering-assets') {
    return {
      title: 'engineeringAssetInputLimit',
      fields: [
        { key: 'max_input_bytes', value: sample?.maxInputBytes, unit: 'bytes' },
      ],
    };
  }
  if (props.resource === 'engineering-browse') {
    return {
      title: 'engineeringBrowseLimits',
      fields: [
        {
          key: 'max_preview_page',
          value: sample?.maxPreviewPage,
          unit: 'count',
        },
        {
          key: 'max_browse_bytes',
          value: sample?.maxBrowseBytes,
          unit: 'bytes',
        },
      ],
    };
  }
  if (props.resource === 'engineering-mapping') {
    return {
      title: 'engineeringMappingLimits',
      fields: [
        {
          key: 'max_mapping_points',
          value: sample?.maxMappingPoints,
          unit: 'count',
        },
        {
          key: 'max_mapping_bytes',
          value: sample?.maxMappingBytes,
          unit: 'bytes',
        },
      ],
    };
  }
  if (props.resource === 'engineering-comparison') {
    return {
      title: 'engineeringComparisonLimits',
      fields: [
        {
          key: 'max_comparison_items',
          value: sample?.maxComparisonItems,
          unit: 'count',
        },
        {
          key: 'max_comparison_bytes',
          value: sample?.maxComparisonBytes,
          unit: 'bytes',
        },
        {
          key: 'max_comparison_work',
          value: sample?.maxComparisonWork,
          unit: 'work',
        },
      ],
    };
  }
  if (props.resource === 'engineering-source') {
    return {
      title: 'engineeringSourceLimits',
      fields: [
        { key: 'max_source_work', value: sample?.maxSourceWork, unit: 'work' },
        {
          key: 'max_source_bytes',
          value: sample?.maxSourceBytes,
          unit: 'bytes',
        },
      ],
    };
  }
  return undefined;
});
const native = computed(() => {
  const sample = props.running;
  return sample && 'loads' in sample ? sample : undefined;
});
const capture = computed(() => {
  const sample = props.running;
  return sample && 'interfaces' in sample ? sample : undefined;
});
const materials = computed(() => {
  const sample = props.running;
  return sample && 'compilations' in sample ? sample : undefined;
});
const queue = computed(() => {
  const sample = props.running;
  return sample && 'replacing' in sample ? sample : undefined;
});
const app = computed(() => {
  const sample = props.running;
  return sample && 'refusedPayload' in sample ? sample : undefined;
});
const extension = computed(() => {
  const sample = props.running;
  return sample && 'recentRefusals' in sample ? sample : undefined;
});
const measuredInputTitle = computed(() => {
  if (isWebTemplate.value) return quotaText('webTemplateFileBoundaries');
  if (isWebWorkbook.value) return quotaText('webWorkbookDecoderObservations');
  if (isWebTlsPem.value) return quotaText('webTlsActiveMaterial');
  return quotaText('webUiResponsePeaks');
});
const measuredInputColumns = computed(() => {
  if (isWebTemplate.value) return 2;
  return isWebTlsPem.value ? 4 : 3;
});
const refusals = computed(() => refusalTotal(props.running, props.resource));
const engineeringRefusalScope = computed(() => {
  if (props.resource === 'engineering-assets')
    return 'engineeringAssetRefusalScope';
  if (props.resource === 'engineering-browse')
    return 'engineeringBrowseRefusalScope';
  if (props.resource === 'engineering-comparison')
    return 'engineeringComparisonRefusalScope';
  if (props.resource === 'engineering-mapping')
    return 'engineeringMappingRefusalScope';
  if (props.resource === 'engineering-publication')
    return 'engineeringPublicationRefusalScope';
  if (props.resource === 'engineering-validator')
    return 'engineeringValidatorRefusalScope';
  return undefined;
});
type QuotaMetric = {
  bytes?: boolean;
  icon: typeof Inbox;
  key: string;
  label: string;
  use?: Omit<QuotaUse, 'peak'> & { peak?: string };
};
const metrics = computed<QuotaMetric[]>(() => {
  const list: QuotaMetric[] = [];
  if (props.resource === 'capability-admission') {
    return [
      {
        key: 'execution',
        label: 'capabilitySlots',
        icon: Grip,
        use: capability.value?.observations,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'capabilityBacking',
        icon: InspectionPanel,
        use: capability.value?.backing,
      },
    ];
  }
  if (isWebTemplate.value) {
    return [
      {
        key: 'execution',
        label: 'webTemplateJobs',
        icon: Grip,
        use: webTemplate.value?.jobs,
      },
    ];
  }
  if (
    usesMeasuredInputs.value ||
    props.resource === 'engineering-comparison' ||
    props.resource === 'engineering-source' ||
    props.resource === 'engineering-validator'
  )
    return list;
  if (props.resource === 'engineering-assets') {
    return [
      {
        key: 'pending',
        label: 'engineeringAssetCount',
        icon: Inbox,
        use: engineering.value?.storedAssets ?? undefined,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'engineeringAssetStoredBytes',
        icon: InspectionPanel,
        use: engineering.value?.storedAssetBytes ?? undefined,
      },
    ];
  }
  if (props.resource === 'engineering-publication') {
    const owner = engineeringPublication.value;
    const storage = owner?.storage;
    return [
      {
        key: 'pending',
        label: 'engineeringPublicationStoredCount',
        icon: Inbox,
        use:
          owner && storage
            ? publicationCharge(owner.maxPublications, storage.usedCount)
            : undefined,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'engineeringPublicationStoredBytes',
        icon: InspectionPanel,
        use:
          owner && storage
            ? publicationCharge(owner.maxPublicationBytes, storage.usedBytes)
            : undefined,
      },
    ];
  }
  if (props.resource === 'engineering-browse') {
    return [
      {
        bytes: true,
        key: 'bytes',
        label: 'engineeringBrowseOutput',
        icon: InspectionPanel,
        use: engineering.value?.pageOutputBytes,
      },
    ];
  }
  if (props.resource === 'engineering-mapping') {
    return [
      {
        bytes: true,
        key: 'bytes',
        label: 'engineeringMappingOutput',
        icon: InspectionPanel,
        use: engineering.value?.mappingOutputBytes,
      },
      {
        bytes: true,
        key: 'execution',
        label: 'engineeringPublicationSnapshot',
        icon: Grip,
        use: engineering.value?.publicationSnapshotBytes,
      },
    ];
  }
  if (props.resource === 'web-tls-work') {
    return [
      {
        bytes: true,
        key: 'tls-work',
        label: 'webTlsWorkerBacking',
        icon: InspectionPanel,
        use: webTlsWork.value?.workBacking,
      },
      {
        bytes: true,
        key: 'tls-retained',
        label: 'webTlsRetainedBacking',
        icon: Grip,
        use: webTlsWork.value?.retainedBacking,
      },
    ];
  }
  if (isWebUiPreparation.value) {
    return [
      {
        key: 'pending',
        label: 'webUiAssetCount',
        icon: Inbox,
        use: webUi.value?.files,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'webUiContentBytes',
        icon: InspectionPanel,
        use: webUi.value?.contentBytes,
      },
      {
        bytes: true,
        key: 'ui-retained',
        label: 'webUiRetainedBytes',
        icon: Grip,
        use: webUi.value?.retainedBytes,
      },
    ];
  }
  if (props.resource === 'websocket-traffic') {
    return [
      {
        key: 'execution',
        label: 'websocketAwaitingAck',
        icon: Grip,
        use: websocketTraffic.value?.activeAcknowledgements,
      },
    ];
  }
  if (props.resource === 'websocket-admission') {
    return [
      {
        key: 'pending',
        label: 'websocketTicketCount',
        icon: Inbox,
        use: websocket.value?.tickets ?? undefined,
      },
      {
        key: 'execution',
        label: 'websocketConnectionCount',
        icon: Grip,
        use: websocket.value?.connections,
      },
    ];
  }
  if (props.resource === 'authorization-policy') {
    return [
      {
        key: 'pending',
        label: 'authorizationEntryCount',
        icon: Inbox,
        use: authorization.value?.entries,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'authorizationInputBytes',
        icon: InspectionPanel,
        use: authorization.value?.inputBytes,
      },
    ];
  }
  if (props.resource === 'session-admission') {
    return [
      {
        key: 'pending',
        label: 'sessionPersistedCount',
        icon: Inbox,
        use: session.value?.activeSessions?.usage,
      },
      {
        key: 'execution',
        label: 'sessionLeaseCount',
        icon: Grip,
        use: session.value?.sessionLeases ?? undefined,
      },
    ];
  }
  if (isLoginResource.value) {
    return [
      {
        key: 'pending',
        label: 'loginAccountSlots',
        icon: Inbox,
        use: login.value?.accounts,
      },
    ];
  }
  if (props.resource === 'http-ingress') {
    const sample = httpIngress.value;
    return [
      {
        key: 'pending',
        label: 'httpRequestSlots',
        icon: Inbox,
        use: sample?.requests,
      },
      {
        key: 'execution',
        label: 'httpNativeSlots',
        icon: Grip,
        use: sample?.nativeWork,
      },
    ];
  }
  if (props.resource === 'auth-admission') {
    const sample = authentication.value;
    list.push(
      {
        key: 'pending',
        label: 'authRequests',
        icon: Inbox,
        use: sample?.requests,
      },
      {
        key: 'execution',
        label: 'authCrypto',
        icon: Grip,
        use: sample?.crypto,
      },
    );
    return list;
  }
  if (engineeringResource.value) {
    const sample = engineering.value;
    list.push(
      {
        key: 'pending',
        label: 'engineeringJobs',
        icon: Inbox,
        use: sample?.jobs,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'engineeringModelBytes',
        icon: InspectionPanel,
        use: sample?.modelBytes,
      },
      {
        key: 'execution',
        label: 'engineeringCachedModels',
        icon: Grip,
        use: sample?.cachedModels,
      },
    );
    return list;
  }
  if (nativeResource.value) {
    const sample = native.value;
    list.push(
      {
        key: 'pending',
        label: 'nativeArtifactCount',
        icon: Inbox,
        use: sample?.images,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'nativeArtifactBytes',
        icon: InspectionPanel,
        use: sample?.bytes,
      },
      {
        key: 'execution',
        label: 'nativeLoaderJobs',
        icon: Grip,
        use: sample?.loads,
      },
    );
    return list;
  }
  if (controlResource.value) {
    const sample = control.value;
    list.push(
      {
        key: 'preflight',
        label: 'controlPreflightCount',
        icon: Inbox,
        use: sample?.preflight,
      },
      {
        bytes: true,
        key: 'preflight-bytes',
        label: 'controlPreflightBytes',
        icon: InspectionPanel,
        use: sample?.preflightBytes,
      },
      {
        key: 'execution',
        label: 'controlExecutionCount',
        icon: Grip,
        use: sample?.pending,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'controlExecutionBytes',
        icon: InspectionPanel,
        use: sample?.bytes,
      },
    );
    return list;
  }
  if (props.resource === 'ethernet-capture') {
    list.push(
      {
        key: 'pending',
        label: 'captureInterfaces',
        icon: Grip,
        use: capture.value?.interfaces,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'captureReservations',
        icon: InspectionPanel,
        use: capture.value?.bytes,
      },
    );
    return list;
  }
  if (props.resource === 'southward-materials') {
    list.push(
      {
        key: 'execution',
        label: 'southwardMaterialTasks',
        icon: Grip,
        use: materials.value?.compilations,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'southwardMaterialBytes',
        icon: InspectionPanel,
        use: materials.value?.bytes,
      },
    );
    return list;
  }
  if (props.resource === 'southward-configuration') {
    const sample = configuration.value;
    list.push(
      {
        key: 'pending',
        label: 'southwardConfigurationOperations',
        icon: Inbox,
        use: sample?.pending,
      },
      {
        bytes: true,
        key: 'bytes',
        label: 'southwardConfigurationBytes',
        icon: InspectionPanel,
        use: sample?.bytes,
      },
    );
    return list;
  }
  if (props.resource === 'southward-retained-state') {
    const observed = southward.value;
    const remaining = observed
      ? BigInt(observed.stagingLimitBytes) - BigInt(observed.stagingUsedBytes)
      : undefined;
    list.push(
      {
        bytes: true,
        key: 'retained',
        label: 'southwardRetainedBytes',
        icon: InspectionPanel,
        use: observed?.retained,
      },
      {
        bytes: true,
        key: 'staging',
        label: 'southwardStagingBytes',
        icon: Inbox,
        use:
          observed && remaining !== undefined
            ? {
                limit: observed.stagingLimitBytes,
                used: observed.stagingUsedBytes,
                available: (remaining > 0n ? remaining : 0n).toString(),
              }
            : undefined,
      },
    );
    return list;
  }
  if (props.resource === 'northward-app-configuration') {
    list.push({
      key: 'pending',
      label: 'appPublications',
      icon: Inbox,
      use: app.value?.pending,
    });
    return list;
  }
  if (props.resource === 'northward-event-queue') {
    list.push({
      key: 'pending',
      label: 'queueSlots',
      icon: Inbox,
      use: queue.value,
    });
    return list;
  }
  const aggregate =
    props.running && 'pending' in props.running && 'bytes' in props.running
      ? props.running
      : undefined;
  list.push(
    {
      key: 'pending',
      label: isEventResource.value ? 'eventsPending' : 'pending',
      icon: Inbox,
      use: aggregate?.pending,
    },
    {
      bytes: true,
      key: 'bytes',
      label: isEventResource.value ? 'eventBytes' : 'bytes',
      icon: InspectionPanel,
      use: aggregate?.bytes,
    },
  );
  if (isEventResource.value) {
    list.push({
      key: 'execution',
      label: 'executionSlots',
      icon: Grip,
      use:
        props.running && 'execution' in props.running
          ? props.running.execution
          : undefined,
    });
  }
  return list;
});

function present(value: string | undefined, bytes: boolean) {
  if (value === undefined) return { unit: '', value: amount() };
  return bytes ? compactBytes(value) : { unit: '', value: amount(value) };
}

const metricReadings = computed(() =>
  metrics.value.map((metric) => {
    const { use } = metric;
    const bytes = metric.bytes === true;
    return {
      ...metric,
      available: present(use?.available, bytes),
      current: present(use?.used, bytes),
      limit: present(use?.limit, bytes),
      peak: present(use?.peak, bytes),
      utilization: use && utilization(use),
    };
  }),
);
const meterCount = computed(
  () => metrics.value.length + (isLoginResource.value ? 2 : 1),
);
const wideColumns = computed(() =>
  meterCount.value === 4 || meterCount.value > 6
    ? 4
    : Math.min(meterCount.value, 3),
);
const measurementPair = computed(
  () =>
    meterCount.value === 1 &&
    Boolean(engineeringLimits.value || usesMeasuredInputs.value),
);
</script>

<template>
  <section class="quota-overview space-y-4" :aria-label="quotaText('usage')">
    <div
      class="quota-meters grid min-w-0 gap-3"
      :class="{
        'quota-meters--odd': meterCount % 2 !== 0,
        'quota-meters--pair': measurementPair,
      }"
      :style="{
        '--quota-columns-medium': Math.min(meterCount, 3),
        '--quota-columns-wide': wideColumns,
      }"
    >
      <Card
        v-if="engineeringLimits"
        class="quota-metric quota-metric--response-observations quota-metric--measurement min-w-0"
        size="small"
      >
        <div class="quota-metric__header">
          <span class="quota-metric__icon" aria-hidden="true">
            <InspectionPanel :size="17" />
          </span>
          <h2 class="m-0 text-sm font-medium">
            {{ quotaText(engineeringLimits.title) }}
          </h2>
        </div>
        <Skeleton
          v-if="!loaded"
          active
          :paragraph="{ rows: 2 }"
          :title="false"
        />
        <Descriptions
          v-else
          :colon="false"
          :column="2"
          class="quota-installed-limits"
          bordered
          layout="vertical"
          size="small"
        >
          <DescriptionsItem
            v-for="field in engineeringLimits.fields"
            :key="field.key"
            :label="quotaText(`fields.${field.key}`)"
          >
            <span class="quota-installed-value tabular-nums">
              <strong>{{ amount(field.value) }}</strong>
              <span
                v-if="field.value !== undefined"
                class="text-xs text-muted-foreground"
              >
                {{ quotaText(`units.${field.unit}`) }}
              </span>
            </span>
          </DescriptionsItem>
        </Descriptions>
        <TypographyText
          v-if="engineeringValidator?.validatorAddressSpaceBytes === null"
          class="mt-2 block"
          type="secondary"
        >
          {{ quotaText('engineeringValidatorAddressSpacePlatform') }}
        </TypographyText>
      </Card>
      <Card
        v-if="usesMeasuredInputs"
        class="quota-metric quota-metric--response-observations quota-metric--measurement min-w-0"
        size="small"
      >
        <div class="quota-metric__header">
          <span class="quota-metric__icon" aria-hidden="true">
            <InspectionPanel :size="17" />
          </span>
          <h2 class="m-0 text-sm font-medium">
            {{ measuredInputTitle }}
          </h2>
        </div>
        <Skeleton
          v-if="!loaded"
          active
          :paragraph="{ rows: 2 }"
          :title="false"
        />
        <template
          v-else-if="webUiResponse || webTlsPem || webTemplate || webWorkbook"
        >
          <Descriptions
            :colon="false"
            :column="{ xs: 2, sm: 2, xl: measuredInputColumns }"
            bordered
            layout="vertical"
            size="small"
          >
            <DescriptionsItem
              v-for="peak in observedDimensions"
              :key="peak.label"
              :label="quotaText(peak.label)"
            >
              <template
                v-if="
                  peak.value === undefined ||
                  (peak.maximum !== undefined && peak.value === '0')
                "
              >
                <span class="text-muted-foreground">
                  {{ quotaText('webTemplateNoCompletedFile') }}
                </span>
              </template>
              <template v-else>
                <span class="break-all font-semibold tabular-nums">{{
                  amount(peak.value)
                }}</span>
                {{ quotaText(`units.${peak.unit}`) }}
              </template>
              <span
                v-if="peak.maximum !== undefined"
                class="mt-0.5 block text-xs text-muted-foreground"
              >
                {{ quotaText('limit') }} {{ amount(peak.maximum) }}
                {{ quotaText(`units.${peak.unit}`) }}
              </span>
              <span
                v-if="peak.history !== undefined && peak.history !== peak.value"
                class="mt-0.5 block text-xs text-muted-foreground"
              >
                {{ quotaText('peak') }} {{ amount(peak.history) }}
                {{ quotaText(`units.${peak.unit}`) }}
              </span>
            </DescriptionsItem>
          </Descriptions>
          <div
            v-if="webUiResponse"
            class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
          >
            <Tag class="quota-tag !m-0" color="geekblue">
              {{ amount(webUiResponse.minAssetRequestPathBytes) }}
              {{ quotaText('units.bytes') }}
            </Tag>
            <span class="text-muted-foreground">{{
              quotaText('webUiResponseAssetPath')
            }}</span>
          </div>
          <div
            v-else-if="webTlsPem"
            class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
          >
            <Tag
              class="quota-tag !m-0"
              :color="webTlsPem.mode === 'managed' ? 'purple' : 'cyan'"
            >
              {{ quotaText(`webTlsModes.${webTlsPem.mode}`) }}
            </Tag>
            <span class="text-muted-foreground">{{
              quotaText('webTlsMaterialScope')
            }}</span>
          </div>
          <div
            v-else-if="templateJobBudget"
            class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
          >
            <Tag class="quota-tag !m-0" color="geekblue">
              {{ templateJobBudget.value }} {{ templateJobBudget.unit }}
            </Tag>
            <span class="text-muted-foreground">{{
              quotaText('webTemplatePerJobScope')
            }}</span>
          </div>
        </template>
        <TypographyText v-else type="secondary">
          {{ quotaText('unknown') }}
        </TypographyText>
      </Card>

      <Card
        v-if="isLoginResource"
        class="quota-metric quota-metric--execution min-w-0"
        size="small"
      >
        <div class="quota-metric__header">
          <span class="quota-metric__icon" aria-hidden="true">
            <Grip :size="17" />
          </span>
          <h2 class="m-0 text-sm font-medium">
            {{ quotaText('loginGlobalTokens') }}
          </h2>
        </div>
        <Skeleton
          v-if="!loaded"
          active
          :paragraph="{ rows: 2 }"
          :title="false"
        />
        <template v-else>
          <div class="quota-metric__reading">
            <Statistic
              :value="login?.globalTokensAvailable ?? ''"
              class="quota-metric__value"
            >
              <template #formatter>
                <span :title="login?.globalTokensAvailable">{{
                  amount(login?.globalTokensAvailable)
                }}</span>
              </template>
            </Statistic>
            <TypographyText v-if="login" class="text-xs" type="secondary">
              {{ quotaText('limit') }} {{ amount(login.globalTokenCapacity) }}
            </TypographyText>
          </div>
          <Progress
            v-if="loginTokenRatio"
            :aria-label="quotaText('loginGlobalTokens')"
            :percent="loginTokenRatio.percent"
            :show-info="false"
            size="small"
            stroke-color="var(--quota-tone)"
          />
          <TypographyText
            v-if="login"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText('loginRefillCadence', {
                period: amount(login.globalRefillMs),
              })
            }}
          </TypographyText>
        </template>
      </Card>
      <Card
        v-for="metric in metricReadings"
        :key="metric.key"
        class="quota-metric min-w-0"
        :class="`quota-metric--${metric.key}`"
        size="small"
      >
        <div class="quota-metric__header">
          <span class="quota-metric__icon" aria-hidden="true">
            <component :is="metric.icon" :size="17" />
          </span>
          <h2 class="m-0 text-sm font-medium">{{ quotaText(metric.label) }}</h2>
        </div>
        <Skeleton
          v-if="!loaded"
          active
          :paragraph="{ rows: 2 }"
          :title="false"
        />
        <template v-else>
          <div class="quota-metric__reading">
            <Statistic
              :value="metric.use?.used ?? ''"
              class="quota-metric__value"
            >
              <template #formatter>
                <span :title="amount(metric.use?.used)">
                  {{ metric.current.value }}
                </span>
                <span class="quota-metric__unit">{{
                  metric.current.unit
                }}</span>
              </template>
            </Statistic>
            <div v-if="metric.use" class="quota-metric__budget">
              <Tag
                v-if="metric.utilization"
                :color="metric.use.available === '0' ? 'volcano' : undefined"
                class="quota-tag quota-metric__percent !m-0"
              >
                {{ metric.utilization.text }}
              </Tag>
              <span
                :title="amount(metric.use.limit)"
                class="text-xs text-muted-foreground"
              >
                {{ quotaText('limit') }}
                {{ metric.limit.value }} {{ metric.limit.unit }}
              </span>
            </div>
          </div>
          <Progress
            v-if="metric.use && metric.utilization"
            class="my-1.5"
            :aria-label="quotaText(metric.label)"
            :percent="metric.utilization.percent"
            :show-info="false"
            :status="metric.use.available === '0' ? 'exception' : 'normal'"
            :stroke-color="
              metric.use.available === '0' ? undefined : 'var(--quota-tone)'
            "
            size="small"
          />
          <Descriptions
            v-if="metric.use"
            :column="metric.use.peak === undefined ? 1 : 2"
            :colon="false"
            class="quota-metric__details"
            layout="vertical"
            size="small"
          >
            <DescriptionsItem :label="quotaText('available')">
              <span :title="amount(metric.use.available)">
                {{ metric.available.value }} {{ metric.available.unit }}
              </span>
            </DescriptionsItem>
            <DescriptionsItem
              v-if="metric.use.peak !== undefined"
              :label="quotaText('peak')"
            >
              <span :title="amount(metric.use.peak)">
                {{ metric.peak.value }} {{ metric.peak.unit }}
              </span>
            </DescriptionsItem>
          </Descriptions>
          <TypographyText
            v-if="httpIngress && metric.key === 'pending'"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{ quotaText('httpRequestSample') }}
          </TypographyText>
          <TypographyText
            v-if="capability"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText(
                metric.key === 'execution'
                  ? 'capabilitySlotsScope'
                  : 'capabilityBackingScope',
              )
            }}
          </TypographyText>
          <TypographyText
            v-if="webTemplate"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{ quotaText('webTemplateJobScope') }}
          </TypographyText>
          <TypographyText
            v-if="webTlsWork"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText(
                metric.key === 'tls-work'
                  ? 'webTlsWorkerScope'
                  : 'webTlsRetainedScope',
              )
            }}
          </TypographyText>
          <TypographyText
            v-if="login"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{ quotaText('loginAccountRetirement') }}
          </TypographyText>
          <TypographyText
            v-if="session"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText(
                metric.key === 'execution'
                  ? 'sessionLeaseScope'
                  : session.activeSessions
                    ? 'sessionStoredScope'
                    : 'sessionCountUnavailable',
              )
            }}
          </TypographyText>
          <TypographyText
            v-if="authorization"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText(
                metric.key === 'pending'
                  ? 'authorizationEntryScope'
                  : 'authorizationByteScope',
              )
            }}
          </TypographyText>
          <TypographyText
            v-if="websocket"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{
              quotaText(
                metric.key === 'pending'
                  ? 'websocketTicketScope'
                  : 'websocketConnectionScope',
              )
            }}
          </TypographyText>
          <TypographyText
            v-if="websocketTraffic"
            class="mt-2 block text-xs"
            type="secondary"
          >
            {{ quotaText('websocketAckScope') }}
          </TypographyText>
        </template>
      </Card>

      <Card class="quota-metric quota-metric--refusals min-w-0" size="small">
        <div class="quota-metric__header">
          <span class="quota-metric__icon" aria-hidden="true">
            <CircleAlert :size="17" />
          </span>
          <h2 class="m-0 text-sm font-medium">
            {{
              quotaText(
                engineeringRefusalScope
                  ? 'engineeringObservedRefusals'
                  : southward
                    ? 'southwardReservationRefusals'
                    : 'refusalsTotal',
              )
            }}
          </h2>
        </div>
        <Skeleton
          v-if="!loaded"
          active
          :paragraph="{ rows: 2 }"
          :title="false"
        />
        <template v-else>
          <Statistic :value="refusals ?? ''" class="quota-metric__value">
            <template #formatter>
              <span :title="refusals">{{ amount(refusals) }}</span>
            </template>
          </Statistic>
          <div class="quota-metric__diagnostics text-xs">
            <span v-if="extension" class="text-muted-foreground">
              {{ quotaText('detailsEvicted') }}
              {{ amount(extension.refusalsEvicted) }}
            </span>
            <span
              v-else-if="engineeringRefusalScope"
              class="text-muted-foreground"
            >
              {{ quotaText(engineeringRefusalScope) }}
            </span>
            <span
              v-else-if="
                isEventResource ||
                queue ||
                app ||
                southward ||
                configuration ||
                materials ||
                control ||
                native ||
                engineering ||
                authentication ||
                httpIngress ||
                login ||
                session ||
                authorization ||
                websocket ||
                websocketTraffic ||
                webUi ||
                webUiResponse ||
                webTlsPem ||
                webTlsWork ||
                webTemplate ||
                webWorkbook ||
                capability ||
                capture
              "
              class="text-muted-foreground"
            >
              {{ quotaText('sinceOwnerStarted') }}
            </span>
            <Button
              type="link"
              size="small"
              class="quota-metric__action !p-0"
              @click="$emit('diagnostics')"
            >
              {{ quotaText('viewDiagnostics') }}
              <ChevronRight :size="14" aria-hidden="true" />
            </Button>
          </div>
        </template>
      </Card>
    </div>

    <Collapse
      v-if="loaded"
      ghost
      class="quota-runtime border border-border bg-card"
    >
      <CollapsePanel
        v-if="running"
        key="runtime"
        :header="quotaText('runtimeDetails')"
      >
        <Descriptions
          :colon="false"
          size="small"
          :column="{ xs: 1, sm: 2, xl: 3 }"
          bordered
        >
          <DescriptionsItem :label="quotaText('sampledAt')">
            {{ sampleTime(running.sampledAt) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('revision')">
            {{ amount(running.policyRevision) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('owner')">
            <TypographyText
              code
              :copyable="{ text: running.ownerId }"
              :title="running.ownerId"
            >
              {{ running.ownerId.slice(0, 8) }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem v-if="webUi" :label="quotaText('webUiSourceMode')">
            <Tag class="quota-tag !m-0" color="geekblue">
              {{ quotaText(`webUiModes.${webUi.sourceMode}`) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="webUi" :label="quotaText('webUiTree')">
            <TypographyText
              code
              :copyable="{ text: webUi.treeId }"
              :title="webUi.treeId"
            >
              {{ webUi.treeId.slice(0, 8) }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem
            v-if="webUi && webUi.manifestBytes !== null"
            :label="quotaText('webUiManifestBytes')"
          >
            {{ amount(webUi.manifestBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="webUi"
            :label="quotaText('webUiLargestAsset')"
          >
            {{ amount(webUi.largestAssetBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="webUi"
            :label="quotaText('webUiPreparationWork')"
          >
            {{ amount(webUi.preparationWorkBytes) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="webUi"
            :label="quotaText('webUiPreparationPeak')"
          >
            {{ amount(webUi.preparationRetainedPeak) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="webUi"
            :label="quotaText('webUiPreparationElapsed')"
          >
            {{ amount(webUi.preparationElapsedMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="southward"
            :label="quotaText('southwardSampleLimit')"
          >
            {{ amount(southward.maxSampleBytes) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="southward"
            :label="quotaText('fields.ingress_max_channel_bytes')"
          >
            {{ amount(southward.maxChannelBytes) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="authentication"
            :label="quotaText('fields.request_timeout_ms')"
          >
            {{ amount(authentication.requestTimeoutMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="httpIngress"
            :label="quotaText('fields.management_json_bytes')"
          >
            {{ amount(httpIngress.managementJsonBytes) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="httpIngress"
            :label="quotaText('fields.json_body_timeout_ms')"
          >
            {{ amount(httpIngress.jsonBodyTimeoutMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="session"
            :label="quotaText('sessionStoredSampleAt')"
          >
            {{
              session.activeSessions
                ? sampleTime(session.activeSessions.sampledAt)
                : quotaText('unknown')
            }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="websocket"
            :label="quotaText('fields.ws_ticket_ttl_ms')"
          >
            {{ amount(websocket.ticketTtlMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="login"
            :label="quotaText('fields.login_account_burst')"
          >
            {{ amount(login.accountTokenCapacity) }}
            {{ quotaText('units.count') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="login"
            :label="quotaText('fields.login_account_refill_ms')"
          >
            {{ amount(login.accountRefillMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="engineering"
            :label="quotaText('fields.max_model_bytes')"
          >
            {{ amount(engineering.maxModelBytes) }}
            {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="engineering"
            :label="quotaText('engineeringCacheEvictions')"
          >
            {{ amount(engineering.cacheEvictions) }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="native"
            :label="quotaText('fields.max_image_bytes')"
          >
            {{ amount(native.maxImageBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="native"
            :label="quotaText('nativeImageLifetime')"
          >
            {{ quotaText('nativeProcessLifetime') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="control"
            :label="quotaText('controlRequestReservation')"
          >
            {{ amount(control.maxRequestBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="capture"
            :label="quotaText('captureNativeBytes')"
          >
            {{ amount(capture.captureBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="capture"
            :label="quotaText('captureRuntimeBytes')"
          >
            {{ amount(capture.runtimeBytes) }} {{ quotaText('units.bytes') }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="materials"
            :label="quotaText('fields.material_prepare_timeout_ms')"
          >
            {{ amount(materials.prepareTimeoutMs) }}
            {{ quotaText('units.milliseconds') }}
          </DescriptionsItem>
          <DescriptionsItem v-if="queue" :label="quotaText('eventsPending')">
            {{ amount(queue.acceptedEvents) }}
          </DescriptionsItem>
          <DescriptionsItem v-if="queue" :label="quotaText('executionSlots')">
            {{ amount(queue.executingEvents) }}
          </DescriptionsItem>
          <DescriptionsItem v-if="extension" :label="quotaText('oldestOwner')">
            {{
              extension.oldestOwnerAgeMs == null
                ? quotaText('noActiveOwner')
                : amount(extension.oldestOwnerAgeMs)
            }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="extension"
            :label="quotaText('lastRetirement')"
          >
            {{
              extension.lastRetirementAgeMs == null
                ? quotaText('noRetirement')
                : amount(extension.lastRetirementAgeMs)
            }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="extension"
            :label="quotaText('successfulHandoffs')"
          >
            {{ amount(extension.successfulHandoffs) }}
          </DescriptionsItem>
        </Descriptions>
      </CollapsePanel>
      <CollapsePanel key="process-rss" :header="quotaText('processRss')">
        <Descriptions
          :colon="false"
          :column="{ xs: 1, sm: 2 }"
          bordered
          layout="vertical"
          size="small"
        >
          <DescriptionsItem :label="quotaText('residentBytes')">
            <strong class="tabular-nums">{{
              amount(processRss?.bytes)
            }}</strong>
            <span v-if="processRss">{{ quotaText('units.bytes') }}</span>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('sampledAt')">
            {{ sampleTime(processRss?.sampledAt) }}
          </DescriptionsItem>
        </Descriptions>
      </CollapsePanel>
      <CollapsePanel
        v-if="resource === 'http-ingress'"
        key="quota-management"
        :header="quotaText('quotaManagementDetails')"
      >
        <template v-if="management && managementStatus">
          <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Tag class="quota-tag !m-0" :color="managementStatus.color">
              {{ quotaText(managementStatus.label) }}
            </Tag>
            <span class="text-muted-foreground">{{
              quotaText('quotaManagementScope')
            }}</span>
          </div>
          <Descriptions
            :colon="false"
            :column="{ xs: 1, sm: 2, xl: 3 }"
            bordered
            layout="vertical"
            size="small"
          >
            <DescriptionsItem
              v-for="item in managementAmounts"
              :key="item.label"
              :label="quotaText(item.label)"
            >
              <div class="tabular-nums">
                <strong>{{ amount(item.usage.used) }}</strong>
                <span class="text-muted-foreground">
                  / {{ amount(item.usage.limit)
                  }}{{ ` ${quotaText(`units.${item.unit}`)}` }}
                </span>
              </div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                {{ quotaText('peak') }} {{ amount(item.usage.peak) }}
                {{ quotaText(`units.${item.unit}`) }}
              </div>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('sampledAt')">
              {{ sampleTime(management.sampledAt) }}
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('owner')">
              <TypographyText
                code
                :title="management.ownerId"
                :copyable="{ text: management.ownerId }"
              >
                {{ management.ownerId.slice(0, 8) }}
              </TypographyText>
            </DescriptionsItem>
          </Descriptions>
          <Descriptions
            :colon="false"
            :column="{ xs: 1, sm: 2 }"
            class="mt-3"
            size="small"
          >
            <DescriptionsItem
              v-for="item in managementRefusals"
              :key="item.label"
              :label="quotaText(item.label)"
            >
              <Tag
                class="quota-tag !m-0"
                :color="item.value === '0' ? undefined : 'volcano'"
              >
                {{ amount(item.value) }}
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </template>
        <TypographyText v-else type="secondary">
          {{ quotaText('unknown') }}
        </TypographyText>
        <div class="mt-2">
          <Button type="link" class="!px-0" @click="$emit('managementAlarms')">
            {{ quotaText('alarms.managementEntry') }}
          </Button>
        </div>
      </CollapsePanel>
      <CollapsePanel
        v-if="websocketTraffic"
        key="traffic-peaks"
        :header="quotaText('websocketTrafficPeaks')"
      >
        <Descriptions
          :colon="false"
          bordered
          size="small"
          :column="{ xs: 1, sm: 2, xl: 3 }"
        >
          <DescriptionsItem
            v-for="peak in trafficPeaks"
            :key="peak.label"
            :label="quotaText(peak.label)"
          >
            <span class="font-semibold tabular-nums">{{
              amount(peak.value)
            }}</span>
            {{ quotaText(`units.${peak.unit}`) }}
          </DescriptionsItem>
        </Descriptions>
      </CollapsePanel>
    </Collapse>
  </section>
</template>

<style scoped>
.quota-overview {
  container: quota-overview / inline-size;
}

.quota-meters {
  grid-template-columns: minmax(0, 1fr);
}

.quota-metric--measurement {
  grid-column: 1 / -1;
}

@container quota-overview (min-width: 520px) {
  .quota-meters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quota-meters--odd .quota-metric--refusals {
    grid-column: 1 / -1;
  }
}

@container quota-overview (min-width: 800px) {
  .quota-meters {
    grid-template-columns: repeat(var(--quota-columns-medium), minmax(0, 1fr));
  }

  .quota-meters--odd .quota-metric--refusals {
    grid-column: auto;
  }
}

@container quota-overview (min-width: 1120px) {
  .quota-meters {
    grid-template-columns: repeat(var(--quota-columns-wide), minmax(0, 1fr));
  }
}

@container quota-overview (min-width: 660px) {
  .quota-meters--pair {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  .quota-meters--pair .quota-metric--measurement,
  .quota-meters--pair .quota-metric--refusals {
    grid-column: auto;
  }
}

.quota-metric {
  --quota-tone: #3574d9;

  background: radial-gradient(
    ellipse at top left,
    color-mix(in srgb, var(--quota-tone) 12%, hsl(var(--card))),
    hsl(var(--card)) 73%
  );
  border-top: 2px solid
    color-mix(in srgb, var(--quota-tone) 83%, hsl(var(--border)));
  border-radius: 14px;
}

.quota-metric :deep(.ant-card-body) {
  padding: clamp(0.85rem, 1.4cqi, 1.1rem);
}

.quota-metric--bytes,
.quota-metric--retained {
  --quota-tone: #7954d3;
}

.quota-metric--staging {
  --quota-tone: #228d90;
}

.quota-metric--preflight {
  --quota-tone: #4a78d7;
}

.quota-metric--preflight-bytes {
  --quota-tone: #697ab4;
}

.quota-metric--execution,
.quota-metric--ui-retained {
  --quota-tone: #1a9a82;
}

.quota-metric--tls-work {
  --quota-tone: #697ab4;
}

.quota-metric--tls-retained {
  --quota-tone: #228d90;
}

.quota-metric--response-observations {
  --quota-tone: #6c6adf;
}

.quota-metric--refusals {
  --quota-tone: #b76731;
}

.quota-metric__header {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  min-width: 0;
  margin-block-end: 0.8rem;
}

.quota-metric__header h2 {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.quota-metric__reading {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.75rem;
  align-items: end;
  justify-content: space-between;
}

.quota-metric__budget {
  display: grid;
  gap: 0.25rem;
  align-self: center;
  justify-items: end;
  font-variant-numeric: tabular-nums;
  text-align: end;
  overflow-wrap: anywhere;
}

.quota-metric__percent:not(.ant-tag-volcano) {
  font-weight: 600;
  color: color-mix(in srgb, var(--quota-tone) 52%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--quota-tone) 10%, hsl(var(--card)));
  border-color: color-mix(in srgb, var(--quota-tone) 28%, hsl(var(--border)));
}

.quota-metric__details,
.quota-metric__diagnostics {
  padding-block-start: 0.65rem;
  margin-block-start: 0.55rem;
  border-block-start: 1px solid hsl(var(--border));
}

.quota-metric__details :deep(.ant-descriptions-row > th) {
  padding-block-end: 0.14rem;
}

.quota-metric__details :deep(.ant-descriptions-item-label),
.quota-metric__details :deep(.ant-descriptions-item-content) {
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.quota-metric__details :deep(.ant-descriptions-item-content) {
  font-variant-numeric: tabular-nums;
}

.quota-metric__diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.65rem;
  align-items: center;
  justify-content: space-between;
}

.quota-metric__action {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
  min-height: 2rem;
  margin-inline-start: auto;
  font-weight: 550;
  color: hsl(var(--primary));
}

.quota-metric__action:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
}

.quota-metric__icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  color: color-mix(in srgb, var(--quota-tone) 72%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--quota-tone) 16%, hsl(var(--card)));
  border-radius: 9px;
}

.quota-metric__value :deep(.ant-statistic-content) {
  font-size: clamp(1.4rem, 2.55cqi, 1.9rem);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.quota-metric__unit {
  margin-inline-start: 0.35rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.quota-runtime {
  border-radius: 12px;
}

.quota-installed-limits :deep(.ant-descriptions-item-label),
.quota-installed-limits :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}

.quota-installed-value {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.12rem 0.35rem;
  align-items: baseline;
}

.quota-installed-value strong {
  font-size: 1rem;
}
</style>
