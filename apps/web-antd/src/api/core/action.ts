import type {
  ActionDebugRequest,
  ActionDebugResponse,
  ActionInfo,
  CommonPageRequest,
  CommonPageResponse,
  IdType,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace ActionApi {
  export const base = '/action';
  export const page = `${base}/page`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const deleteById = (id: IdType) => `${base}/${id}`;
  export const debug = (id: IdType) => `${base}/${id}/debug`;
  export const byDevice = (deviceId: IdType) => `${base}/by-device/${deviceId}`;
  export const batchDelete = `${base}/batch-delete`;
  export const clear = `${base}/clear`;

  export interface ActionPageParams extends CommonPageRequest {
    deviceId?: IdType;
    name?: string;
    command?: string;
  }
}

export async function fetchActionPage(params: ActionApi.ActionPageParams) {
  return requestClient.get<CommonPageResponse<ActionInfo>>(ActionApi.page, {
    params,
  });
}

export async function createAction(data: ActionInfo) {
  return requestClient.post(ActionApi.base, data);
}

export async function updateAction(data: ActionInfo) {
  return requestClient.put(ActionApi.base, data);
}

export async function deleteAction(id: IdType) {
  return requestClient.delete(ActionApi.deleteById(id));
}

export async function getActionById(id: IdType) {
  return requestClient.get<ActionInfo>(ActionApi.getById(id));
}

export async function debugAction(id: IdType, data: ActionDebugRequest) {
  return requestClient.post<ActionDebugResponse>(ActionApi.debug(id), data);
}

export async function fetchActionsByDevice(deviceId: IdType) {
  return requestClient.get<ActionInfo[]>(ActionApi.byDevice(deviceId));
}

export async function batchDeleteAction(ids: IdType[]) {
  return requestClient.post(ActionApi.batchDelete, { ids });
}

export async function clearActionByDevice(deviceId: IdType) {
  return requestClient.post(ActionApi.clear, { deviceId });
}
