import type {
  CommonPageRequest,
  CommonPageResponse,
  IdType,
  PointInfo,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace PointApi {
  export const base = '/point';
  export const page = `${base}/page`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const deleteById = (id: IdType) => `${base}/${id}`;
  export const batchDelete = `${base}/batch-delete`;
  export const clear = `${base}/clear`;

  export interface PointPageParams extends CommonPageRequest {
    deviceId?: IdType;
    name?: string;
    key?: string;
    type?: PointInfo['type'];
    dataType?: PointInfo['dataType'];
    accessMode?: PointInfo['accessMode'];
  }
}

export async function fetchPointPage(params: PointApi.PointPageParams) {
  return requestClient.get<CommonPageResponse<PointInfo>>(PointApi.page, {
    params,
  });
}

export async function createPoint(data: PointInfo) {
  return requestClient.post(PointApi.base, data);
}

export async function updatePoint(data: PointInfo) {
  return requestClient.put(PointApi.base, data);
}

export async function deletePoint(id: IdType) {
  return requestClient.delete(PointApi.deleteById(id));
}

export async function getPointById(id: IdType) {
  return requestClient.get<PointInfo>(PointApi.getById(id));
}

export async function batchDeletePoint(ids: IdType[]) {
  return requestClient.post(PointApi.batchDelete, { ids });
}

export async function clearPointByDevice(deviceId: IdType) {
  return requestClient.post(PointApi.clear, { deviceId });
}
