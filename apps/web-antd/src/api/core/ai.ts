import type {
  AiAlgorithmInfo,
  AiAlgorithmTestInput,
  AiAlgorithmTestResult,
  AiAlgorithmUploadMetadata,
  AiEngineStatus,
  AiModelInfo,
  AiModelUpdateRequest,
  AiPipelineConfig,
  AiPipelineSummary,
  AiPipelineUpsertRequest,
  AiPipelineValidationReport,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace AiApi {
  export const base = '/ai';
  export const models = `${base}/models`;
  export const modelById = (modelId: string) => `${base}/models/${modelId}`;
  export const modelLoad = (modelId: string) => `${base}/models/${modelId}/load`;
  export const modelUnload = (modelId: string) => `${base}/models/${modelId}/unload`;

  export const algorithms = `${base}/algorithms`;
  export const algorithmById = (algorithmId: string) =>
    `${base}/algorithms/${algorithmId}`;
  export const algorithmTest = (algorithmId: string) =>
    `${base}/algorithms/${algorithmId}/test`;

  export const pipelines = `${base}/pipelines`;
  export const pipelineByChannel = (channelId: number) => `${base}/pipelines/${channelId}`;
  export const pipelineValidate = (channelId: number) =>
    `${base}/pipelines/${channelId}/validate`;

  export const engineStatus = `${base}/engine/status`;
}

export async function fetchAiModels() {
  return requestClient.get<AiModelInfo[]>(AiApi.models);
}

export async function fetchAiModel(modelId: string) {
  return requestClient.get<AiModelInfo>(AiApi.modelById(modelId));
}

export async function createAiModel(formData: FormData) {
  return requestClient.post<AiModelInfo>(AiApi.models, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function updateAiModel(modelId: string, payload: AiModelUpdateRequest) {
  return requestClient.put<AiModelInfo>(AiApi.modelById(modelId), payload);
}

export async function deleteAiModel(modelId: string) {
  return requestClient.delete<boolean>(AiApi.modelById(modelId));
}

export async function loadAiModel(modelId: string) {
  return requestClient.post<boolean>(AiApi.modelLoad(modelId));
}

export async function unloadAiModel(modelId: string) {
  return requestClient.post<boolean>(AiApi.modelUnload(modelId));
}

export async function fetchAiAlgorithms() {
  return requestClient.get<AiAlgorithmInfo[]>(AiApi.algorithms);
}

export async function uploadAiAlgorithm(
  wasmFile: File,
  metadata: AiAlgorithmUploadMetadata,
) {
  const formData = new FormData();
  formData.append('file', wasmFile);
  formData.append('metadata', JSON.stringify(metadata));
  return requestClient.post<AiAlgorithmInfo>(AiApi.algorithms, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteAiAlgorithm(algorithmId: string) {
  return requestClient.delete<boolean>(AiApi.algorithmById(algorithmId));
}

export async function testAiAlgorithm(
  algorithmId: string,
  payload: AiAlgorithmTestInput,
) {
  return requestClient.post<AiAlgorithmTestResult>(
    AiApi.algorithmTest(algorithmId),
    payload,
  );
}

export async function fetchAiEngineStatus() {
  return requestClient.get<AiEngineStatus>(AiApi.engineStatus);
}

export async function fetchAiPipelines() {
  return requestClient.get<AiPipelineSummary[]>(AiApi.pipelines);
}

export async function fetchAiPipeline(channelId: number) {
  return requestClient.get<AiPipelineSummary>(AiApi.pipelineByChannel(channelId));
}

export async function validateAiPipeline(channelId: number) {
  return requestClient.post<AiPipelineValidationReport>(AiApi.pipelineValidate(channelId));
}

export async function createAiPipeline(payload: AiPipelineUpsertRequest) {
  return requestClient.post<boolean>(AiApi.pipelines, payload);
}

export async function updateAiPipeline(payload: AiPipelineUpsertRequest) {
  return requestClient.put<boolean>(AiApi.pipelines, payload);
}

export async function deleteAiPipeline(channelId: number) {
  return requestClient.delete<boolean>(AiApi.pipelineByChannel(channelId));
}

export async function makeDefaultAiPipelineConfig(id: string, name: string): Promise<AiPipelineConfig> {
  return {
    id,
    name,
    sampling: {
      type: 'every_frame',
    },
    roiRegions: [],
    stages: [
      {
        type: 'inference',
        modelId: '',
        confidenceThreshold: 0.5,
      },
    ],
    alarmRules: [],
    annotation: {
      drawConfidence: true,
      drawLabels: true,
      drawBboxes: true,
      drawTrackIds: true,
      drawSegmentation: true,
      segmentationAlpha: 0.4,
      lineThickness: 2,
      fontScale: 0.6,
      jpegQuality: 75,
    },
  };
}
