import { requestClient } from '#/api/request';

export const quotaGroups = [
  {
    key: 'northward',
    resources: [
      'extension-store',
      'northward-events',
      'northward-event-queue',
      'northward-app-configuration',
    ],
  },
  {
    key: 'southward',
    resources: [
      'southward-retained-state',
      'southward-configuration',
      'southward-materials',
      'ethernet-capture',
    ],
  },
  {
    key: 'gateway',
    resources: [
      'control-admission',
      'capability-admission',
      'native-libraries',
    ],
  },
  {
    key: 'engineering',
    resources: [
      'engineering-admission',
      'engineering-assets',
      'engineering-browse',
      'engineering-comparison',
      'engineering-mapping',
      'engineering-publication',
      'engineering-source',
      'engineering-validator',
    ],
  },
  {
    key: 'identity',
    resources: [
      'auth-admission',
      'login-admission',
      'session-admission',
      'authorization-policy',
    ],
  },
  {
    key: 'web',
    resources: [
      'http-ingress',
      'websocket-admission',
      'websocket-traffic',
      'web-ui-preparation',
      'web-ui-response',
      'web-tls-pem',
      'web-tls-work',
      'web-template-transport',
      'web-template-workbook',
    ],
  },
] as const;

export type QuotaResource = (typeof quotaGroups)[number]['resources'][number];
const quotaResources = quotaGroups.flatMap<QuotaResource>(
  (group) => group.resources,
);

export function isQuotaResource(value: unknown): value is QuotaResource {
  return (quotaResources as readonly unknown[]).includes(value);
}

export type WorkbookQuotaField =
  | 'max_cell_bytes'
  | 'max_cell_data_bytes'
  | 'max_cells'
  | 'max_columns'
  | 'max_compression_ratio'
  | 'max_entries'
  | 'max_entry_bytes'
  | 'max_error_bytes'
  | 'max_errors'
  | 'max_expanded_bytes'
  | 'max_file_bytes'
  | 'max_mapped_bytes'
  | 'max_rows'
  | 'max_shared_string_bytes'
  | 'max_shared_strings'
  | 'max_sheets'
  | 'max_style_bytes'
  | 'max_styles'
  | 'max_validation_work'
  | 'max_xml_depth'
  | 'max_xml_nodes'
  | 'max_xml_token_bytes';

export type QuotaField =
  | 'capacity_bytes'
  | 'configuration_max_pending'
  | 'configuration_max_pending_bytes'
  | 'ethernet_capture_max_bytes'
  | 'ethernet_capture_max_interfaces'
  | 'event_max_bytes'
  | 'event_max_depth'
  | 'events_max_bytes'
  | 'events_max_in_flight'
  | 'events_max_pending'
  | 'identity_bytes'
  | 'ingress_max_channel_bytes'
  | 'ingress_max_state_bytes'
  | 'json_body_timeout_ms'
  | 'login_account_burst'
  | 'login_account_refill_ms'
  | 'login_burst'
  | 'login_refill_ms'
  | 'management_json_bytes'
  | 'material_max_bytes'
  | 'material_max_compiling'
  | 'material_prepare_timeout_ms'
  | 'max_asset_bytes'
  | 'max_assets'
  | 'max_browse_bytes'
  | 'max_bytes'
  | 'max_cached_models'
  | 'max_certificates'
  | 'max_comparison_bytes'
  | 'max_comparison_items'
  | 'max_comparison_work'
  | 'max_concurrent_loads'
  | 'max_conditional_header_bytes'
  | 'max_content_bytes'
  | 'max_crypto_workers'
  | 'max_depth'
  | 'max_der_block_bytes'
  | 'max_der_total_bytes'
  | 'max_diagnostic_bytes'
  | 'max_encoded_bytes'
  | 'max_export_bytes'
  | 'max_files'
  | 'max_image_bytes'
  | 'max_images'
  | 'max_input_bytes'
  | 'max_jobs'
  | 'max_json_depth'
  | 'max_keys'
  | 'max_login_accounts'
  | 'max_manifest_bytes'
  | 'max_mapping_bytes'
  | 'max_mapping_points'
  | 'max_model_bytes'
  | 'max_path_bytes'
  | 'max_pending'
  | 'max_pending_bytes'
  | 'max_pending_requests'
  | 'max_policy_bytes'
  | 'max_policy_entries'
  | 'max_preflight'
  | 'max_preflight_bytes'
  | 'max_preview_page'
  | 'max_publication_bytes'
  | 'max_publications'
  | 'max_range_header_bytes'
  | 'max_ranges'
  | 'max_request_bytes'
  | 'max_request_path_bytes'
  | 'max_response_metadata_bytes'
  | 'max_result_bytes'
  | 'max_retained_bytes'
  | 'max_sessions'
  | 'max_sessions_per_user'
  | 'max_source_bytes'
  | 'max_source_work'
  | 'max_total_bytes'
  | 'max_work_bytes'
  | 'max_ws_batch_bytes'
  | 'max_ws_connections'
  | 'max_ws_connections_per_session'
  | 'max_ws_frame_bytes'
  | 'max_ws_messages_per_second'
  | 'max_ws_snapshot_entries'
  | 'max_ws_subscriptions'
  | 'max_ws_tickets'
  | 'max_ws_tickets_per_session'
  | 'model_pool_bytes'
  | 'native_worker_bytes'
  | 'prepare_timeout_ms'
  | 'queue_capacity'
  | 'request_timeout_ms'
  | 'signer_bytes'
  | 'timeout_ms'
  | 'validator_address_space_bytes'
  | 'validator_heap_bytes'
  | 'validator_timeout_ms'
  | 'ws_ack_timeout_ms'
  | 'ws_ticket_ttl_ms'
  | WorkbookQuotaField;

export type QuotaEffect =
  | 'HOT_ADMISSION'
  | 'HOT_AFTER_DRAIN'
  | 'HOT_NEXT_OPERATION'
  | 'RESTART_PROCESS';

export interface QuotaUse {
  available: string;
  limit: string;
  peak: string;
  used: string;
}

export interface QuotaRefusal {
  lastSeenMs: string;
  limit: null | string;
  occurrences: string;
  policyRevision: string;
  reason: string;
  requested: null | string;
  used: null | string;
}

export interface QuotaDescriptor {
  default: string;
  desired: string;
  effectMode: QuotaEffect;
  envKey: null | string;
  fileValuePresent: boolean;
  key: QuotaField;
  max: string;
  min: string;
  persisted: null | string;
  source: 'default' | 'env' | 'file';
  unit: 'bytes' | 'count' | 'depth' | 'milliseconds' | 'ratio' | 'work';
  writable: boolean;
}

export interface QuotaCatalog {
  canConfigure: boolean;
  canReadApps?: boolean;
  canReadChannels?: boolean;
  fields: QuotaDescriptor[];
  sourceHash: null | string;
  writerAvailability?: 'AVAILABLE' | 'CHANGE_PENDING' | 'HISTORY_FULL';
}

interface BaseQuotaUsage {
  accepting: boolean;
  bytes: QuotaUse;
  draining: boolean;
  maxJsonDepth: string;
  ownerId: string;
  pending: QuotaUse;
  policyRevision: string;
  sampledAt: string;
}

export interface ExtensionStoreUsage extends BaseQuotaUsage {
  lastRetirementAgeMs: null | string;
  lastSuccessfulHandoffAgeMs: null | string;
  maxKeys: string;
  maxRequestBytes: string;
  maxResultBytes: string;
  oldestOwnerAgeMs: null | string;
  ownerCreatedAt: string;
  ownerUptimeMs: string;
  recentRefusals: QuotaRefusal[];
  refusalsEvicted: string;
  refusalsTotal: string;
  requestTimeoutMs: string;
  successfulHandoffs: string;
}

export interface NorthwardEventsUsage extends BaseQuotaUsage {
  execution: QuotaUse;
  maxEventBytes: string;
  refusedBytes: string;
  refusedEncoding: string;
  refusedJsonWork: string;
  refusedPending: string;
  refusedQueueDrain?: string;
}

export interface NorthwardEventQueueUsage {
  acceptedEvents: string;
  accepting: boolean;
  available: string;
  executingEvents: string;
  limit: string;
  ownerId: string;
  policyRevision: string;
  refusedDrain: string;
  replacing: boolean;
  sampledAt: string;
  used: string;
}

export interface NorthwardAppConfigurationUsage {
  accepting: boolean;
  maxRequestBytes: string;
  ownerId: string;
  pending: QuotaUse;
  policyRevision: string;
  refusedPayload: string;
  refusedPending: string;
  sampledAt: string;
}

export interface AppQueueQuotaValues {
  blockDuration: string;
  bufferCapacity: string;
  bufferEnabled: boolean;
  bufferExpireMs: string;
  capacity: string;
  deliveryMaxInFlight: string;
  deliveryMaxPayloadBytes: string;
  deliveryRetryMs: string;
  deliveryTimeoutMs: string;
  dropPolicy: 0 | 1;
  latestCapacity: string;
  latestMaxBytes: string;
  replyCapacity: string;
  replyMaxBytes: string;
  replyMaxInFlight: string;
}

type AppQueueConfigurationState =
  | 'activating'
  | 'active'
  | 'disabled'
  | 'failed'
  | 'pending';

export interface AppQueueQuotaCatalog {
  appId: number;
  appliedRevision: null | string;
  canChange: boolean;
  canPreview: boolean;
  configurationState: AppQueueConfigurationState;
  configured: AppQueueQuotaValues;
  desiredRevision: string;
}

export interface AppQueueQuotaEdit {
  expectedRevision: string;
  patch: Partial<{
    block_duration: string;
    buffer_capacity: string;
    buffer_enabled: boolean;
    buffer_expire_ms: string;
    capacity: string;
    delivery_max_in_flight: string;
    delivery_max_payload_bytes: string;
    delivery_retry_ms: string;
    delivery_timeout_ms: string;
    drop_policy: 0 | 1;
    latest_capacity: string;
    latest_max_bytes: string;
    reply_capacity: string;
    reply_max_bytes: string;
    reply_max_in_flight: string;
  }>;
}

export interface AppQueueQuotaPreview {
  appId: number;
  appliedRevision: null | string;
  configurationState: AppQueueConfigurationState;
  configured: AppQueueQuotaValues;
  desired: AppQueueQuotaValues;
  effect: 'RESTART_SCOPE' | 'RETIRE_SCOPE' | 'SAVED_DISABLED';
  expectedRevision: string;
  runtime: NorthwardAppQueueUsage | null;
}

export interface AppQueueQuotaRequest {
  edit: AppQueueQuotaEdit;
  requestId: string;
}

export interface AppQueueQuotaChangeStatus {
  receipt: {
    appId: number;
    appliedOwnerId: null | string;
    createdAtMs: string;
    desiredRevision: string;
    edit: AppQueueQuotaEdit;
    operationId: string;
    phase:
      | 'APPLIED'
      | 'APPLY_FAILED'
      | 'AUTHORITY_CHANGED'
      | 'DESIRED_COMMITTED'
      | 'SAVED_DISABLED'
      | 'VERIFICATION_PENDING';
    requestId: string;
    updatedAtMs: string;
  };
  running: null | { ownerId: string; policyRevision: string };
}

export interface AppQueueMailboxUsage {
  available: string;
  limit: string;
  occupied: string;
}

export interface NorthwardAppQueueUsage {
  accepting: boolean;
  appId: number;
  configurationRevision: string;
  connected: boolean;
  delivery: {
    latestAttemptLimit: string;
    ordinaryAttemptLimit: string;
    payloadLimitBytes: string;
    replyAttemptLimit: string;
    retryMs: string;
    timeoutMs: string;
  };
  ordinaryMailbox: AppQueueMailboxUsage;
  ownerId: string;
  ownerUptimeMs: string;
  progress: {
    completions: {
      appliedLocally: string;
      brokerAcknowledged: string;
      transportFlushed: string;
    };
    hasPendingWork: boolean;
    lastCompletionAgeMs: null | string;
    noProgressAgeMs: null | string;
  };
  replyMailbox: AppQueueMailboxUsage;
  retention: {
    latestSlots: QuotaUse;
    ordinaryAdmissionRefusals: {
      disconnectedBufferFull: string;
      mailboxFull: string;
      mailboxWaitElapsed: string;
    };
    ordinaryBytes: QuotaUse;
    ordinaryEvents: QuotaUse;
    refusals: {
      latestSlots: string;
      lifecycleDevices: string;
      ordinaryEvents: string;
      ordinaryRetainedBytes: string;
      replyRetainedBytes: string;
      replySlots: string;
    };
    replyBytes: QuotaUse;
    replySlots: QuotaUse;
    reservedOrdinaryEncodingBytes: string;
    reservedReplyEncodingBytes: string;
  };
  sampledAt: string;
}

export interface SouthwardRetainedStateUsage {
  accepting: boolean;
  draining: boolean;
  maxChannelBytes: string;
  maxSampleBytes: string;
  ownerId: string;
  policyRevision: string;
  refusedChannelReservations: string;
  refusedGatewayReservations: string;
  retained: QuotaUse;
  sampledAt: string;
  stagingLimitBytes: string;
  stagingUsedBytes: string;
}

export interface ChannelRetainedStateUsage {
  accepting: boolean;
  channelId: number;
  configurationEpoch: string;
  configurationRevision: string;
  draining: boolean;
  ownerId: string;
  policyRevision: string;
  refusedChannel: string;
  refusedGateway: string;
  retained: QuotaUse;
  sampledAt: string;
}

export interface SouthwardConfigurationUsage {
  accepting: boolean;
  bytes: QuotaUse;
  ownerId: string;
  pending: QuotaUse;
  policyRevision: string;
  refusedBytes: string;
  refusedPayload: string;
  refusedPending: string;
  sampledAt: string;
}

export interface SouthwardMaterialUsage {
  accepting: boolean;
  bytes: QuotaUse;
  compilations: QuotaUse;
  ownerId: string;
  policyRevision: string;
  prepareTimeoutMs: string;
  refusedBytes: string;
  refusedCompilation: string;
  refusedVerification: string;
  sampledAt: string;
}

export interface EthernetCaptureUsage {
  accepting: boolean;
  bytes: QuotaUse;
  captureBytes: string;
  interfaces: QuotaUse;
  ownerId: string;
  policyRevision: string;
  refusedCaptureBytes: string;
  refusedInterfaceCount: string;
  refusedOccupiedInterface: string;
  refusedRuntimeBytes: string;
  runtimeBytes: string;
  sampledAt: string;
}

export interface ControlAdmissionUsage {
  accepting: boolean;
  bytes: QuotaUse;
  draining: boolean;
  maxRequestBytes: string;
  ownerId: string;
  pending: QuotaUse;
  policyRevision: string;
  preflight: QuotaUse;
  preflightBytes: QuotaUse;
  refusedExecutionBytes: string;
  refusedExecutionCount: string;
  refusedPreflightBytes: string;
  refusedPreflightCount: string;
  sampledAt: string;
}

export interface NativeLibraryUsage {
  accepting: boolean;
  bytes: QuotaUse;
  images: QuotaUse;
  loads: QuotaUse;
  maxImageBytes: string;
  ownerId: string;
  policyRevision: string;
  refusedCount: string;
  refusedImageBytes: string;
  refusedLoads: string;
  refusedTotalBytes: string;
  sampledAt: string;
}

export interface ProcessRssObservation {
  bytes: string;
  sampledAt: string;
}

export interface EngineeringAdmissionUsage {
  accepting: boolean;
  assetStoreAvailable?: boolean;
  cacheEvictions: string;
  cachedModels: QuotaUse;
  jobs: QuotaUse;
  mappingOutputBytes?: QuotaUse;
  maxAssetBytes?: string;
  maxAssets?: string;
  maxBrowseBytes?: string;
  maxComparisonBytes?: string;
  maxComparisonItems?: string;
  maxComparisonWork?: string;
  maxInputBytes?: string;
  maxMappingBytes?: string;
  maxMappingPoints?: string;
  maxModelBytes: string;
  maxPreviewPage?: string;
  maxSourceBytes?: string;
  maxSourceWork?: string;
  modelBytes: QuotaUse;
  ownerId: string;
  pageOutputBytes?: QuotaUse;
  policyRevision: string;
  publicationSnapshotBytes?: QuotaUse;
  refusedAssetBytes?: string;
  refusedAssetCount?: string;
  refusedAssetFileSize?: string;
  refusedComparisonDescriptors?: string;
  refusedComparisonScratch?: string;
  refusedComparisonWork?: string;
  refusedJobs: string;
  refusedMappingItems?: string;
  refusedMappingOutput?: string;
  refusedModelEnvelope: string;
  refusedModelPool: string;
  refusedNsdSourceWork?: string;
  refusedPageItems?: string;
  refusedPageOutputBytes?: string;
  refusedPublicationSnapshot?: string;
  sampledAt: string;
  storedAssetBytes?: null | QuotaUse;
  storedAssets?: null | QuotaUse;
}

export interface EngineeringPublicationQuotaUsage {
  accepting: boolean;
  maxPublicationBytes: string;
  maxPublications: string;
  ownerId: string;
  policyRevision: string;
  refusedPublicationBytes: string;
  refusedPublicationCount: string;
  sampledAt: string;
  storage: null | { sampledAt: string; usedBytes: string; usedCount: string };
}

export interface EngineeringValidatorQuotaUsage {
  accepting: boolean;
  maxDiagnosticBytes: string;
  ownerId: string;
  policyRevision: string;
  refusedValidatorDeadlines: string;
  refusedValidatorDiagnostics: string;
  refusedValidatorHeap: string;
  refusedValidatorNativeMemory: string;
  requestTimeoutMs: string;
  sampledAt: string;
  validatorAddressSpaceBytes: null | string;
  validatorHeapBytes: string;
  validatorReady: boolean;
  validatorTimeoutMs: string;
}

export interface AuthAdmissionUsage {
  accepting: boolean;
  crypto: QuotaUse;
  ownerId: string;
  policyRevision: string;
  refusedCryptoWaits: string;
  refusedRequests: string;
  requests: QuotaUse;
  requestTimeoutMs: string;
  sampledAt: string;
}

export interface HttpIngressQuotaUsage {
  accepting: boolean;
  jsonBodyTimeoutMs: string;
  managementJsonBytes: string;
  nativeWork: QuotaUse;
  ownerId: string;
  policyRevision: string;
  refusedArrivalBacking: string;
  refusedJsonBytes: string;
  refusedJsonCapacity: string;
  refusedJsonDeadline: string;
  refusedNativeSlots: string;
  refusedRequestSlots: string;
  requests: QuotaUse;
  sampledAt: string;
}

export interface QuotaManagementUsage extends HttpIngressQuotaUsage {
  backing: QuotaUse;
  refusedSourceBacking: string;
}

export interface LoginAdmissionUsage {
  accepting: boolean;
  accountRefillMs: string;
  accounts: QuotaUse;
  accountTokenCapacity: string;
  globalRefillMs: string;
  globalTokenCapacity: string;
  globalTokensAvailable: string;
  ownerId: string;
  policyRevision: string;
  refusedAccountSlots: string;
  refusedAccountTokens: string;
  refusedGlobalTokens: string;
  sampledAt: string;
}

export interface SessionAdmissionUsage {
  accepting: boolean;
  activeSessions: null | { sampledAt: string; usage: QuotaUse };
  maxSessions: string;
  maxSessionsPerUser: string;
  ownerId: string;
  policyRevision: string;
  refusedLeaseBacking: string;
  refusedLeaseSlots: string;
  refusedTotalSlots: string;
  refusedUserSlots: string;
  sampledAt: string;
  sessionLeases: null | QuotaUse;
}

export interface AuthorizationPolicyUsage {
  accepting: boolean;
  entries: QuotaUse;
  inputBytes: QuotaUse;
  ownerId: string;
  policyRevision: string;
  refusedGraphLoad: string;
  refusedGraphWrite: string;
  refusedInput: string;
  sampledAt: string;
}

export interface WebSocketAdmissionUsage {
  accepting: boolean;
  connections: QuotaUse;
  maxConnectionsPerSession: string;
  maxTickets: string;
  maxTicketsPerSession: string;
  ownerId: string;
  policyRevision: string;
  refusedSessionConnections: string;
  refusedSessionTickets: string;
  refusedTotalConnections: string;
  refusedTotalTickets: string;
  sampledAt: string;
  tickets: null | QuotaUse;
  ticketTtlMs: string;
}

export interface WebSocketTrafficUsage {
  accepting: boolean;
  ackTimeoutMs: string;
  activeAcknowledgements: QuotaUse;
  maxBatchBytes: string;
  maxFrameBytes: string;
  maxSnapshotEntries: string;
  maxSubscriptions: string;
  messagesPerSecond: string;
  ownerId: string;
  peakEncodedBatchBytes: string;
  peakEncodedFrameBytes: string;
  peakMessagesPerSecond: string;
  peakSnapshotEntries: string;
  peakSubscriptions: string;
  policyRevision: string;
  refusedAckDeadlines: string;
  refusedEncodedBatches: string;
  refusedEncodedFrames: string;
  refusedIncomingFrames: string;
  refusedMessageRate: string;
  refusedOutputDeadlines: string;
  refusedSnapshotEntries: string;
  refusedSubscriptions: string;
  sampledAt: string;
}

export interface WebUiPreparationUsage {
  accepting: boolean;
  contentBytes: QuotaUse;
  deepestPath: string;
  files: QuotaUse;
  largestAssetBytes: string;
  largestPathBytes: string;
  manifestBytes: null | string;
  maxAssetBytes: string;
  maxDepth: string;
  maxManifestBytes: string;
  maxPathBytes: string;
  maxWorkBytes: string;
  nativeWorkerBytes: string;
  ownerId: string;
  policyRevision: string;
  preparationElapsedMs: string;
  preparationRetainedPeak: string;
  preparationWorkBytes: string;
  prepareTimeoutMs: string;
  refusedRetainedReservations: string;
  retainedBytes: QuotaUse;
  sampledAt: string;
  sourceMode: 'embedded' | 'filesystem';
  treeId: string;
}

export interface WebUiResponseUsage {
  accepting: boolean;
  maxConditionalHeaderBytes: string;
  maxRangeHeaderBytes: string;
  maxRanges: string;
  maxRequestPathBytes: string;
  maxResponseMetadataBytes: string;
  minAssetRequestPathBytes: string;
  ownerId: string;
  peakAssemblyMs: string;
  peakConditionalBytes: string;
  peakMultipartMetadataBytes: string;
  peakPathBytes: string;
  peakRangeHeaderBytes: string;
  peakRanges: string;
  policyRevision: string;
  refusedConditionalHeaders: string;
  refusedDeadline: string;
  refusedMultipartMetadata: string;
  refusedPath: string;
  refusedRangeHeader: string;
  refusedRanges: string;
  requestTimeoutMs: string;
  sampledAt: string;
}

interface WebTlsPemFootprint {
  certificates: string;
  derBlockBytes: string;
  derTotalBytes: string;
  encodedBytes: string;
}

export interface WebTlsPemUsage {
  accepting: boolean;
  footprint: WebTlsPemFootprint;
  maxCertificates: string;
  maxDerBlockBytes: string;
  maxDerTotalBytes: string;
  maxEncodedBytes: string;
  mode: 'managed' | 'provided';
  ownerId: string;
  peak: WebTlsPemFootprint;
  policyRevision: string;
  refusedBlockPolicy: string;
  refusedDecoded: string;
  refusedEncoded: string;
  sampledAt: string;
}

export interface WebTlsWorkUsage {
  accepting: boolean;
  effectiveSignerBytes: string;
  identityBytes: string;
  maxWorkBytes: string;
  ownerId: string;
  policyRevision: string;
  refusedIdentity: string;
  refusedSigner: string;
  refusedWork: string;
  retainedBacking: QuotaUse;
  retainedControlBytes: string;
  sampledAt: string;
  signerBytes: string;
  workBacking: QuotaUse;
}

export interface WebTlsQuotaUsage {
  pem: WebTlsPemUsage;
  work: WebTlsWorkUsage;
}

export interface WebTemplateTransportUsage {
  accepting: boolean;
  capacityBytes: string;
  capacityCeiling: string;
  capacityFloor: string;
  jobs: QuotaUse;
  maxExportBytes: string;
  maxUploadBytes: string;
  ownerId: string;
  peakExportBytes: string;
  peakUploadBytes: string;
  policyRevision: string;
  refusedDeadline: string;
  refusedExportBytes: string;
  refusedJobs: string;
  refusedReservations: string;
  refusedUploadBytes: string;
  sampledAt: string;
  timeoutMs: string;
}

export interface WebTemplateWorkbookUsage {
  accepting: boolean;
  limits: { key: WorkbookQuotaField; limit: string }[];
  ownerId: string;
  parsedWorkbooks: string;
  peakParsedDataRow: null | string;
  peakUploadedBytes: string;
  policyRevision: string;
  refusedUploadBytes: string;
  refusedWorkbookResources: string;
  sampledAt: string;
}

export interface CapabilityAdmissionUsage {
  accepting: boolean;
  backing: QuotaUse;
  observations: QuotaUse;
  ownerId: string;
  policyRevision: string;
  refusedBacking: string;
  refusedEnvelope: string;
  refusedResponse: string;
  refusedSlots: string;
  sampledAt: string;
}

export type QuotaUsage =
  | AuthAdmissionUsage
  | AuthorizationPolicyUsage
  | CapabilityAdmissionUsage
  | ControlAdmissionUsage
  | EngineeringAdmissionUsage
  | EngineeringPublicationQuotaUsage
  | EngineeringValidatorQuotaUsage
  | EthernetCaptureUsage
  | ExtensionStoreUsage
  | HttpIngressQuotaUsage
  | LoginAdmissionUsage
  | NativeLibraryUsage
  | NorthwardAppConfigurationUsage
  | NorthwardEventQueueUsage
  | NorthwardEventsUsage
  | SessionAdmissionUsage
  | SouthwardConfigurationUsage
  | SouthwardMaterialUsage
  | SouthwardRetainedStateUsage
  | WebSocketAdmissionUsage
  | WebSocketTrafficUsage
  | WebTemplateTransportUsage
  | WebTemplateWorkbookUsage
  | WebTlsPemUsage
  | WebTlsWorkUsage
  | WebUiPreparationUsage
  | WebUiResponseUsage;

export interface QuotaEdit {
  expectedOwnerId: string;
  expectedPolicyRevision: string;
  expectedSourceHash: null | string;
  patch: Partial<Record<QuotaField, string>>;
}

export interface QuotaPreview {
  delta: {
    configured: string;
    desired: string;
    effective: string;
    effectMode: QuotaEffect;
    key: QuotaField;
  }[];
  projectedBytesAvailable?: string;
  projectedExecutionAvailable?: string;
  projectedPendingAvailable?: string;
  projectedPreflightAvailable?: string;
  projectedPreflightBytesAvailable?: string;
  requiresProcessRestart?: boolean;
  requiresQueueDrain?: boolean;
  running: QuotaUsage;
  wouldDrain: boolean;
}

export interface QuotaChange {
  edit: QuotaEdit;
  requestId: string;
}

export interface QuotaChangeReceipt {
  applied: null | { ownerId: string; policyRevision: string };
  createdAtMs: string;
  operationId: string;
  pendingActivation?: 'PROCESS_RESTART';
  phase:
    | 'APPLIED'
    | 'DESIRED_COMMITTED'
    | 'PERMISSION_REVOKED'
    | 'PREPARED'
    | 'RECOVERY_REQUIRED'
    | 'SOURCE_CONFLICT';
  sourceAfter: string;
  sourceBefore: null | string;
  updatedAtMs: string;
}

const path = '/system/resource-quotas';

function resourcePath(resource: QuotaResource) {
  return resource === 'extension-store' ? path : `${path}/${resource}`;
}

export function getChannelRetainedStateUsage(id: string, signal?: AbortSignal) {
  return requestClient.get<ChannelRetainedStateUsage | null>(
    `/system/resource-quotas/channels/${encodeURIComponent(id)}/retained-state`,
    { signal },
  );
}

const appQueuePath = (id: string) =>
  `/system/resource-quotas/apps/${encodeURIComponent(id)}/delivery-queue`;

export function getNorthwardAppQueueUsage(id: string, signal?: AbortSignal) {
  return requestClient.get<NorthwardAppQueueUsage | null>(appQueuePath(id), {
    signal,
  });
}

export function getAppQueueQuotaCatalog(id: string, signal?: AbortSignal) {
  return requestClient.get<AppQueueQuotaCatalog>(
    `${appQueuePath(id)}/catalog`,
    {
      signal,
    },
  );
}

export function previewAppQueueQuota(id: string, edit: AppQueueQuotaEdit) {
  return requestClient.post<AppQueueQuotaPreview>(
    `${appQueuePath(id)}/previews`,
    edit,
  );
}

export function changeAppQueueQuota(id: string, request: AppQueueQuotaRequest) {
  return requestClient.post<AppQueueQuotaChangeStatus>(
    `${appQueuePath(id)}/changes`,
    request,
  );
}

export function findAppQueueQuotaChange(
  id: string,
  requestId: string,
  signal?: AbortSignal,
) {
  return requestClient.get<AppQueueQuotaChangeStatus | null>(
    `${appQueuePath(id)}/changes/by-request/${encodeURIComponent(requestId)}`,
    { signal },
  );
}

export function getGatewayQuotaUsage(signal?: AbortSignal) {
  return requestClient.get<{
    authAdmission?: AuthAdmissionUsage;
    authorizationPolicy?: AuthorizationPolicyUsage | null;
    capabilityAdmission?: CapabilityAdmissionUsage;
    controlAdmission?: ControlAdmissionUsage;
    engineeringAdmission?: EngineeringAdmissionUsage | null;
    engineeringPublication?: EngineeringPublicationQuotaUsage;
    engineeringValidator?: EngineeringValidatorQuotaUsage;
    ethernetCapture?: EthernetCaptureUsage | null;
    extensionStore: ExtensionStoreUsage | null;
    httpIngress?: HttpIngressQuotaUsage | null;
    loginAdmission?: LoginAdmissionUsage | null;
    nativeLibraries?: NativeLibraryUsage | null;
    northwardAppConfiguration?: NorthwardAppConfigurationUsage;
    northwardEventQueue?: NorthwardEventQueueUsage;
    northwardEvents?: NorthwardEventsUsage;
    processRss?: null | ProcessRssObservation;
    quotaManagement?: null | QuotaManagementUsage;
    sessionAdmission?: SessionAdmissionUsage;
    southwardConfiguration?: null | SouthwardConfigurationUsage;
    southwardMaterials?: SouthwardMaterialUsage;
    southwardRetainedState?: SouthwardRetainedStateUsage;
    websocketAdmission?: null | WebSocketAdmissionUsage;
    websocketTraffic?: null | WebSocketTrafficUsage;
    webTemplateTransport?: null | WebTemplateTransportUsage;
    webTemplateWorkbook?: null | WebTemplateWorkbookUsage;
    webTls?: null | WebTlsQuotaUsage;
    webUiPreparation?: null | WebUiPreparationUsage;
    webUiResponse?: null | WebUiResponseUsage;
  }>(path, { signal });
}

export function getQuotaCatalog(resource: QuotaResource) {
  return requestClient.get<QuotaCatalog>(`${resourcePath(resource)}/catalog`);
}

export function previewQuotaChange(resource: QuotaResource, edit: QuotaEdit) {
  return requestClient.post<QuotaPreview>(
    `${resourcePath(resource)}/previews`,
    edit,
  );
}

export function submitQuotaChange(
  resource: QuotaResource,
  change: QuotaChange,
) {
  return requestClient.post<QuotaChangeReceipt>(
    `${resourcePath(resource)}/changes`,
    change,
  );
}

export function getQuotaChange(resource: QuotaResource, id: string) {
  return requestClient.get<QuotaChangeReceipt>(
    `${resourcePath(resource)}/changes/${encodeURIComponent(id)}`,
  );
}

export function findQuotaChange(resource: QuotaResource, requestId: string) {
  return requestClient.get<null | QuotaChangeReceipt>(
    `${resourcePath(resource)}/changes/by-request/${encodeURIComponent(
      requestId,
    )}`,
  );
}
