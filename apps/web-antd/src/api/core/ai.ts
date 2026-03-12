import type {
  AiAlarmEventInfo,
  AiAlgorithmInfo,
  AiAlgorithmInstallRequest,
  AiAlgorithmProbeInfo,
  AiAlgorithmTestInput,
  AiAlgorithmTestResult,
  AiEngineStatus,
  AiModelInfo,
  AiModelInstallRequest,
  AiModelProbeInfo,
  AiPipelineCreateRequest,
  AiPipelineInfo,
  AiPipelineUpdateRequest,
  AiPipelineValidationReport,
  CommonPageResponse,
  IdType,
} from '@vben/types';

import { requestClient } from '#/api/request';

// ── Route constants ───────────────────────────────────────────────

export namespace AiApi {
  export const base = '/ai';

  // Models
  export const modelProbe = `${base}/models/probe`;
  export const modelInstall = `${base}/models/install`;
  export const modelList = `${base}/models/list`;
  export const modelPage = `${base}/models/page`;
  export const modelDetail = (id: IdType) => `${base}/models/detail/${id}`;
  export const modelUpdate = (id: IdType) => `${base}/models/${id}`;
  export const modelDelete = (id: IdType) => `${base}/models/${id}`;
  export const modelLoad = (id: IdType) => `${base}/models/${id}/load`;
  export const modelUnload = (id: IdType) => `${base}/models/${id}/unload`;

  // Algorithms
  export const algorithmProbe = `${base}/algorithms/probe`;
  export const algorithmInstall = `${base}/algorithms/install`;
  export const algorithmList = `${base}/algorithms/list`;
  export const algorithmPage = `${base}/algorithms/page`;
  export const algorithmDetail = (id: IdType) =>
    `${base}/algorithms/detail/${id}`;
  export const algorithmDelete = (id: IdType) => `${base}/algorithms/${id}`;
  export const algorithmTest = (id: IdType) => `${base}/algorithms/${id}/test`;

  // Pipelines
  export const pipelineList = `${base}/pipelines/list`;
  export const pipelinePage = `${base}/pipelines/page`;
  export const pipelineDetail = (id: IdType) =>
    `${base}/pipelines/detail/${id}`;
  export const pipelineCreate = `${base}/pipelines`;
  export const pipelineUpdate = `${base}/pipelines`;
  export const pipelineDelete = (id: IdType) => `${base}/pipelines/${id}`;
  export const pipelineValidate = (id: IdType) =>
    `${base}/pipelines/${id}/validate`;

  // Engine
  export const engineStatus = `${base}/engine/status`;

  // Alarms
  export const alarmPage = `${base}/alarms/page`;
  export const alarmDetail = (id: IdType) => `${base}/alarms/detail/${id}`;
  export const alarmChangeStatus = `${base}/alarms/status`;
}

// ── Model APIs ────────────────────────────────────────────────────

export async function probeAiModel(params: {
  file: File;
  onError?: (error: Error) => void;
  onProgress?: (progress: { percent: number }) => void;
  onSuccess?: (data: any, file: File) => void;
}) {
  try {
    params.onProgress?.({ percent: 0 });
    const data: AiModelProbeInfo = await requestClient.upload(
      AiApi.modelProbe,
      { file: params.file },
    );
    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function installAiModel(params: {
  file: File;
  metadata?: AiModelInstallRequest;
  onError?: (error: Error) => void;
  onProgress?: (progress: { percent: number }) => void;
  onSuccess?: (data: any, file: File) => void;
}) {
  try {
    params.onProgress?.({ percent: 0 });
    const data = await requestClient.upload(AiApi.modelInstall, {
      file: params.file,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    });
    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchAiModelPage(params: Record<string, any>) {
  return requestClient.get<CommonPageResponse<AiModelInfo>>(AiApi.modelPage, {
    params,
  });
}

export async function fetchAiModels() {
  return requestClient.get<AiModelInfo[]>(AiApi.modelList);
}

export async function fetchAiModel(id: IdType) {
  return requestClient.get<AiModelInfo>(AiApi.modelDetail(id));
}

export async function deleteAiModel(id: IdType) {
  return requestClient.delete<boolean>(AiApi.modelDelete(id));
}

export async function loadAiModel(id: IdType) {
  return requestClient.post<boolean>(AiApi.modelLoad(id));
}

export async function unloadAiModel(id: IdType) {
  return requestClient.post<boolean>(AiApi.modelUnload(id));
}

// ── Algorithm APIs ────────────────────────────────────────────────

export async function probeAiAlgorithm(params: {
  file: File;
  onError?: (error: Error) => void;
  onProgress?: (progress: { percent: number }) => void;
  onSuccess?: (data: any, file: File) => void;
}) {
  try {
    params.onProgress?.({ percent: 0 });
    const data: AiAlgorithmProbeInfo = await requestClient.upload(
      AiApi.algorithmProbe,
      {
        file: params.file,
      },
    );
    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function installAiAlgorithm(params: {
  file: File;
  metadata?: AiAlgorithmInstallRequest;
  onError?: (error: Error) => void;
  onProgress?: (progress: { percent: number }) => void;
  onSuccess?: (data: any, file: File) => void;
}) {
  try {
    params.onProgress?.({ percent: 0 });
    const data = await requestClient.upload(AiApi.algorithmInstall, {
      file: params.file,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    });
    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchAiAlgorithmPage(params: Record<string, any>) {
  return requestClient.get<CommonPageResponse<AiAlgorithmInfo>>(
    AiApi.algorithmPage,
    { params },
  );
}

export async function fetchAiAlgorithms() {
  return requestClient.get<AiAlgorithmInfo[]>(AiApi.algorithmList);
}

export async function fetchAiAlgorithm(id: IdType) {
  return requestClient.get<AiAlgorithmInfo>(AiApi.algorithmDetail(id));
}

export async function deleteAiAlgorithm(id: IdType) {
  return requestClient.delete<boolean>(AiApi.algorithmDelete(id));
}

export async function testAiAlgorithm(
  id: IdType,
  payload: AiAlgorithmTestInput,
) {
  return requestClient.post<AiAlgorithmTestResult>(
    AiApi.algorithmTest(id),
    payload,
  );
}

// ── Pipeline APIs ─────────────────────────────────────────────────

export async function fetchAiPipelinePage(params: Record<string, any>) {
  return requestClient.get<CommonPageResponse<AiPipelineInfo>>(
    AiApi.pipelinePage,
    { params },
  );
}

export async function fetchAiPipelines() {
  return requestClient.get<AiPipelineInfo[]>(AiApi.pipelineList);
}

export async function fetchAiPipeline(id: IdType) {
  return requestClient.get<AiPipelineInfo>(AiApi.pipelineDetail(id));
}

export async function createAiPipeline(payload: AiPipelineCreateRequest) {
  return requestClient.post<AiPipelineInfo>(AiApi.pipelineCreate, payload);
}

export async function updateAiPipeline(payload: AiPipelineUpdateRequest) {
  return requestClient.put<AiPipelineInfo>(AiApi.pipelineUpdate, payload);
}

export async function deleteAiPipeline(id: IdType) {
  return requestClient.delete<boolean>(AiApi.pipelineDelete(id));
}

export async function validateAiPipeline(id: IdType) {
  return requestClient.post<AiPipelineValidationReport>(
    AiApi.pipelineValidate(id),
  );
}

// ── Engine APIs ───────────────────────────────────────────────────

export async function fetchAiEngineStatus() {
  return requestClient.get<AiEngineStatus>(AiApi.engineStatus);
}

// ── Alarm APIs ────────────────────────────────────────────────────

export async function fetchAlarmEventPage(params: Record<string, any>) {
  return requestClient.get<CommonPageResponse<AiAlarmEventInfo>>(
    AiApi.alarmPage,
    { params },
  );
}

export async function fetchAlarmEventDetail(id: IdType) {
  return requestClient.get<AiAlarmEventInfo>(AiApi.alarmDetail(id));
}

export async function changeAlarmEventStatus(data: {
  id: number;
  status: string;
}) {
  return requestClient.put<AiAlarmEventInfo>(AiApi.alarmChangeStatus, data);
}
