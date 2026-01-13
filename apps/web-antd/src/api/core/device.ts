import type {
  CommitResult,
  CommonPageRequest,
  CommonPageResponse,
  CommonStatus,
  CommonTimeRangeRequest,
  DeviceInfo,
  IdType,
  ImportPreview,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace DeviceApi {
  export const base = '/device';
  export const list = `${base}/list`;
  export const page = `${base}/page`;
  export const deleteDevice = (id: IdType) => `${base}/${id}`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const changeStatus = `${base}/change-status`;
  export const batchDelete = `${base}/batch-delete`;
  export const clearByChannel = `${base}/clear`;
  export const importPointPreview = (id: IdType) =>
    `${base}/${id}/import-point-preview`;
  export const importPointCommit = (id: IdType) =>
    `${base}/${id}/import-point-commit`;
  export const importActionPreview = (id: IdType) =>
    `${base}/${id}/import-action-preview`;
  export const importActionCommit = (id: IdType) =>
    `${base}/${id}/import-action-commit`;

  /** device page params */
  export interface DevicePageParams
    extends CommonPageRequest,
      CommonTimeRangeRequest {
    deviceName?: string;
    deviceType?: string;
    channelId?: IdType;
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }
}

/**
 * fetch device page
 * @param params - Device page params
 * @returns Promise with device page response
 */
export async function fetchDevicePage(params: DeviceApi.DevicePageParams) {
  return requestClient.get<CommonPageResponse<DeviceInfo>>(DeviceApi.page, {
    params,
  });
}

/**
 * create device
 * @param data - Device data
 * @returns Promise with create device response
 */
export async function createDevice(data: DeviceInfo) {
  return requestClient.post(DeviceApi.base, data);
}

/**
 * update device
 * @param data - Device data
 * @returns Promise with update device response
 */
export async function updateDevice(data: DeviceInfo) {
  return requestClient.put(DeviceApi.base, data);
}

/**
 * delete device
 * @param id - Device ID
 * @returns Promise with delete response
 */
export async function deleteDevice(id: IdType) {
  return requestClient.delete(DeviceApi.deleteDevice(id));
}

/**
 * get device by id
 * @param id - Device ID
 * @returns Promise with device response
 */
export async function getDeviceById(id: IdType) {
  return requestClient.get<DeviceInfo>(DeviceApi.getById(id));
}

/**
 * change device status
 * @param id - Device ID
 * @param status - Device status
 * @returns Promise with change status response
 */
export async function changeDeviceStatus(
  id: IdType,
  status: (typeof CommonStatus)[keyof typeof CommonStatus],
) {
  return requestClient.put(DeviceApi.changeStatus, {
    id,
    status,
  });
}

/**
 * Batch delete devices by IDs
 * @param ids - Device ID list
 */
export async function batchDeleteDevice(ids: IdType[]) {
  return requestClient.post(DeviceApi.batchDelete, { ids });
}

/**
 * Clear all devices under a channel
 * @param channelId - Channel ID
 */
export async function clearDeviceByChannel(channelId: IdType) {
  return requestClient.post(DeviceApi.clearByChannel, { channelId });
}

/**
 * Upload a file for device point import preview.
 * @param id - Device ID
 * @param file - Upload file (xlsx)
 */
export async function importPointPreview(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<ImportPreview>(
    DeviceApi.importPointPreview(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

/**
 * Commit device point import.
 * @param id - Device ID
 * @param file - Upload file (xlsx)
 */
export async function importPointCommit(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<CommitResult>(DeviceApi.importPointCommit(id), fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * Upload a file for device action import preview.
 * @param id - Device ID
 * @param file - Upload file (xlsx)
 */
export async function importActionPreview(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<ImportPreview>(
    DeviceApi.importActionPreview(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

/**
 * Commit device action import.
 * @param id - Device ID
 * @param file - Upload file (xlsx)
 */
export async function importActionCommit(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<CommitResult>(
    DeviceApi.importActionCommit(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}
