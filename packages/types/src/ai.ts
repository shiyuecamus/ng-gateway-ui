import type { Recordable } from '@vben-core/typings';

export interface AiProcessorConfig {
  [key: string]: unknown;
}

export interface AiModelInfo {
  id: string;
  name: string;
  version: string;
  task: string;
  loaded: boolean;
  fileSize: number;
  labels: string[];
  defaultPreprocess?: AiProcessorConfig;
  defaultPostprocess?: AiProcessorConfig;
}

export interface AiAlgorithmInfo {
  id: string;
  name: string;
  version: string;
  moduleType: string;
  description?: string;
  fileSize: number;
}

export interface AiAlgorithmUploadMetadata {
  name: string;
  description?: string;
  version: string;
  moduleType: 'frame_transform' | 'result_processor';
  configSchema?: Recordable<any>;
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
}

export interface AiPipelineConfig {
  id: string;
  name: string;
  sampling: Recordable<any>;
  roi?: Recordable<any>;
  roiRegions?: Recordable<any>[];
  stages: Recordable<any>[];
  alarmRules: Recordable<any>[];
  annotation: Recordable<any>;
}

export interface AiPipelineSummary {
  channelId: number;
  config: AiPipelineConfig;
}

export interface AiPipelineValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AiModelUploadMetadata {
  id: string;
  name: string;
  version: string;
  task: string;
  labels: string[];
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

export interface AiPipelineUpsertRequest {
  channelId: number;
  config: AiPipelineConfig;
}
