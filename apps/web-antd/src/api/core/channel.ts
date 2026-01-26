import type {
  ChannelInfo,
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

export namespace ChannelApi {
  export const base = '/channel';
  export const list = `${base}/list`;
  export const page = `${base}/page`;
  export const deleteChannel = (id: IdType) => `${base}/${id}`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const changeStatus = `${base}/change-status`;
  export const subDevices = (id: IdType) => `${base}/${id}/sub-devices`;
  export const importDevicePreview = (id: IdType) =>
    `${base}/${id}/import-device-preview`;
  export const importDeviceCommit = (id: IdType) =>
    `${base}/${id}/import-device-commit`;
  export const importDevicePointsPreview = (id: IdType) =>
    `${base}/${id}/import-device-points-preview`;
  export const importDevicePointsCommit = (id: IdType) =>
    `${base}/${id}/import-device-points-commit`;
  export const logLevel = (id: IdType) => `${base}/${id}/log-level`;

  /** channel page params */
  export interface ChannelPageParams
    extends CommonPageRequest, CommonTimeRangeRequest {
    name?: string;
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }
}

export type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'TRACE' | 'WARN';

export interface TtlRangeView {
  minMs: number;
  maxMs: number;
  defaultMs: number;
}

export interface ChannelLogOverrideView {
  level: LogLevel;
  expiresAtMs: number;
}

export interface ChannelLogLevelView {
  channelId: number;
  effective: LogLevel;
  override?: ChannelLogOverrideView;
  ttl: TtlRangeView;
}

export interface SetChannelLogLevelRequest {
  level: LogLevel;
  ttlMs?: number;
}

export async function getChannelLogLevel(id: IdType) {
  return requestClient.get<ChannelLogLevelView>(ChannelApi.logLevel(id));
}

export async function setChannelLogLevel(
  id: IdType,
  data: SetChannelLogLevelRequest,
) {
  return requestClient.put<ChannelLogLevelView>(ChannelApi.logLevel(id), data);
}

export async function clearChannelLogLevel(id: IdType) {
  return requestClient.delete<ChannelLogLevelView>(ChannelApi.logLevel(id));
}

/**
 * fetch channel page
 * @param params - Channel page params
 * @returns Promise with channel page response
 */
export async function fetchChannelPage(params: ChannelApi.ChannelPageParams) {
  return requestClient.get<CommonPageResponse<ChannelInfo>>(ChannelApi.page, {
    params,
  });
}

/**
 * Fetch all channels (for selectors / monitoring).
 */
export async function fetchChannelList() {
  return requestClient.get<ChannelInfo[]>(ChannelApi.list);
}

/**
 * create channel
 * @param data - Channel data
 * @returns Promise with create channel response
 */
export async function createChannel(data: ChannelInfo) {
  return requestClient.post(ChannelApi.base, data);
}

/**
 * update channel
 * @param data - Channel data
 * @returns Promise with update channel response
 */
export async function updateChannel(data: ChannelInfo) {
  return requestClient.put(ChannelApi.base, data);
}

/**
 * delete channel
 * @param id - Channel ID
 * @returns Promise with delete response
 */
export async function deleteChannel(id: IdType) {
  return requestClient.delete(ChannelApi.deleteChannel(id));
}

/**
 * get channel by id
 * @param id - Channel ID
 * @returns Promise with channel response
 */
export async function getChannelById(id: IdType) {
  return requestClient.get<ChannelInfo>(ChannelApi.getById(id));
}

/**
 * change channel status
 * @param id - Channel ID
 * @param status - Channel status
 * @returns Promise with change status response
 */
export async function changeChannelStatus(
  id: IdType,
  status: (typeof CommonStatus)[keyof typeof CommonStatus],
) {
  return requestClient.put(ChannelApi.changeStatus, {
    id,
    status,
  });
}

/**
 * get sub devices by channel id
 * @param id - Channel ID
 * @returns Promise with sub devices response
 */
export async function getSubDevicesById(id: IdType) {
  return requestClient.get<DeviceInfo[]>(ChannelApi.subDevices(id));
}

/**
 * Upload a file for sub-device import preview on a channel.
 * @param id - Channel ID
 * @param file - Upload file (xlsx)
 */
export async function importChannelDevicesPreview(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<ImportPreview>(
    ChannelApi.importDevicePreview(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

/**
 * Commit sub-device import for a channel.
 * @param id - Channel ID
 * @param file - Upload file (xlsx)
 */
export async function importChannelDevicesCommit(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<CommitResult>(
    ChannelApi.importDeviceCommit(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

/**
 * Upload a file for device with points import preview on a channel.
 * @param id - Channel ID
 * @param file - Upload file (xlsx)
 */
export async function importChannelDevicesPointsPreview(
  id: IdType,
  file: File,
) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<ImportPreview>(
    ChannelApi.importDevicePointsPreview(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

/**
 * Commit device with points import for a channel.
 * @param id - Channel ID
 * @param file - Upload file (xlsx)
 */
export async function importChannelDevicesPointsCommit(id: IdType, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<CommitResult>(
    ChannelApi.importDevicePointsCommit(id),
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}
