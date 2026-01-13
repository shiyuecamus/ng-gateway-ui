import type {
  AppSubInfo,
  ChannelDeviceTree,
  CommonPageRequest,
  CommonPageResponse,
  CommonTimeRangeRequest,
  IdType,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace AppSubApi {
  export const base = '/northward-sub';
  export const page = `${base}/page`;
  export const list = `${base}/list`;
  export const detail = (id: IdType) => `${base}/${id}`;
  export const deviceTree = `${base}/device-tree`;

  export interface AppSubPageParams
    extends CommonPageRequest,
      CommonTimeRangeRequest {
    appId?: IdType;
  }
}

export async function fetchAppSubPage(params: AppSubApi.AppSubPageParams) {
  return requestClient.get<CommonPageResponse<AppSubInfo>>(AppSubApi.page, {
    params,
  });
}

export async function fetchAppSubs(appId: IdType) {
  return fetchAppSubPage({
    appId,
    page: 1,
    pageSize: 50,
  } as AppSubApi.AppSubPageParams);
}

export async function createAppSub(payload: AppSubInfo) {
  return requestClient.post<boolean>(AppSubApi.base, payload);
}

export async function updateAppSub(payload: AppSubInfo) {
  return requestClient.put<boolean>(AppSubApi.base, payload);
}

export async function deleteAppSub(id: IdType) {
  return requestClient.delete<boolean>(AppSubApi.detail(id));
}

export async function fetchDeviceTree() {
  return requestClient.get<ChannelDeviceTree[]>(AppSubApi.deviceTree);
}
