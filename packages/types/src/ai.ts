import type { Recordable } from '@vben-core/typings';

// ── Common ────────────────────────────────────────────────────────

export interface AiProcessorConfig {
  [key: string]: unknown;
}

// ── Model ─────────────────────────────────────────────────────────

export interface AiModelInfo {
  id: number;
  key: string;
  name: string;
  version: string;
  task: string;
  format: string;
  path: string;
  inputs?: Recordable<any>;
  outputs?: Recordable<any>;
  labels?: string[];
  defaultPreprocess?: AiProcessorConfig;
  defaultPostprocess?: AiProcessorConfig;
  size: number;
  checksum: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiModelProbeInfo {
  format: string;
  inputs: Recordable<any>[];
  outputs: Recordable<any>[];
  inferredTask?: string;
  inferredVariant?: string;
  recommendedPostprocessor?: string;
  recommendedPreprocess?: AiProcessorConfig;
  producer?: Recordable<any>;
  opsetVersion?: number;
  targetPlatform?: string;
  quantization?: string;
  metadataProps?: Record<string, string>;
  labels?: string[];
  size: number;
  checksum: string;
}

export interface AiModelInstallRequest {
  name?: string;
  task?: string;
  version?: string;
  labels?: string[];
  defaultPreprocess?: AiProcessorConfig;
  defaultPostprocess?: AiProcessorConfig;
}

export interface AiModelUpdateRequest {
  name?: string;
  version?: string;
  task?: string;
  labels?: string[];
  defaultPreprocess?: AiProcessorConfig;
  defaultPostprocess?: AiProcessorConfig;
}

// ── Algorithm ─────────────────────────────────────────────────────

export interface AiAlgorithmInfo {
  id: number;
  key: string;
  name: string;
  description?: string;
  version: string;
  moduleType: string;
  path: string;
  configSchema?: Recordable<any>;
  size: number;
  status: string;
  checksum: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiAlgorithmProbeInfo {
  manifest: {
    algorithmKey: string;
    configSchema?: Recordable<any>;
    description?: string;
    manifestVersion: number;
    moduleType: string;
    name: string;
    sdkApiVersion: number;
    version: string;
  };
  size: number;
  checksum: string;
}

export interface AiAlgorithmInstallRequest {
  algorithmKey?: string;
  configSchema?: Recordable<any>;
  description?: string;
  moduleType?: 'frame_transform' | 'result_processor';
  name?: string;
  version?: string;
}

export interface AiAlgorithmUploadMetadata extends AiAlgorithmInstallRequest {
  name: string;
  version: string;
  moduleType: 'frame_transform' | 'result_processor';
}

export interface AiAlgorithmTestInput {
  frameWidth?: number;
  frameHeight?: number;
  config?: Recordable<any>;
}

export interface AiAlgorithmTestResult {
  success: boolean;
  executionTimeMs: number;
  fuelConsumed: number;
  output?: Recordable<any>;
  error?: string;
}

// ── Pipeline ──────────────────────────────────────────────────────

export interface AiPipelineInfo {
  id: number;
  key: string;
  name: string;
  sampling: Recordable<any>;
  roiRegions: Recordable<any>[];
  annotation: Recordable<any>;
  status: string;
  revision: number;
  stages: Recordable<any>[];
  alarmRules: Recordable<any>[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AiPipelineCreateRequest {
  key: string;
  name: string;
  sampling: Recordable<any>;
  roiRegions: Recordable<any>[];
  annotation: Recordable<any>;
  revision?: number;
  stages: Recordable<any>[];
  alarmRules: Recordable<any>[];
}

export interface AiPipelineUpdateRequest extends AiPipelineCreateRequest {
  id: number;
  revision: number;
}

export interface AiPipelineValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Engine ────────────────────────────────────────────────────────

export interface AiEngineStatus {
  enabled: boolean;
  executionProvider: string;
  models: {
    registered: number;
    loaded: number;
    totalMemoryBytes: number;
  };
  inference: {
    activeCount: number;
    maxConcurrent: number;
    availablePermits: number;
    totalInferences: number;
    avgLatencyMs: number;
  };
  pipelines: {
    registered: number;
    activeChannels: number;
  };
  algorithms: {
    registered: number;
    wasmModules: number;
  };
  decoder?: {
    workers: number;
    queueDepth: number;
  };
  uptimeSecs?: number;
}

// ── Alarm ─────────────────────────────────────────────────────────

export type AiAlarmSeverity = 'critical' | 'info' | 'warning';
export type AiAlarmEventStatus = 'acked' | 'closed' | 'open';

export interface AiAlarmEventInfo {
  id: number;
  channelId: number;
  pipelineId: number | null;
  alarmType: string;
  severity: AiAlarmSeverity;
  description: string;
  payload: Recordable<any> | null;
  status: AiAlarmEventStatus;
  ackedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiAlarmEventPageParams {
  channelId?: number;
  pipelineId?: number;
  alarmType?: string;
  severity?: AiAlarmSeverity;
  status?: AiAlarmEventStatus;
  page: number;
  pageSize: number;
  startTime?: string;
  endTime?: string;
}
