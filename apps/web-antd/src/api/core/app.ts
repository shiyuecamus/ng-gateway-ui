import type {
  AppInfo,
  AppLogLevelView,
  CommonPageRequest,
  CommonPageResponse,
  CommonTimeRangeRequest,
  IdType,
  SetAppLogLevelRequest,
} from '@vben/types';

import { CommonStatus } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * REST endpoints for northward app management.
 */
export namespace AppApi {
  /**
   * Base route prefix for northward app APIs.
   */
  export const base = '/northward-app';
  /**
   * Route for paginated app queries.
   */
  export const page = `${base}/page`;
  /**
   * Route for listing all apps without pagination.
   */
  export const list = `${base}/list`;
  /**
   * Route template for retrieving an app by identifier.
   */
  export const detail = (id: IdType) => `${base}/detail/${id}`;
  /**
   * Route template for deleting an app.
   */
  export const remove = (id: IdType) => `${base}/${id}`;
  /**
   * Route for status toggle operations.
   */
  export const changeStatus = `${base}/change-status`;

  /**
   * Route template for app log-level override operations (TTL).
   */
  export const logLevel = (id: IdType) => `${base}/${id}/log-level`;

  /**
   * Query parameters when requesting a paginated northward app list.
   */
  export interface AppPageParams
    extends CommonPageRequest, CommonTimeRangeRequest {
    /**
     * Optional fuzzy search by app name.
     */
    name?: string;
    /**
     * Optional plugin filter.
     */
    pluginId?: IdType;
    /**
     * Optional status filter.
     */
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }
}

/**
 * Fetch a paginated northward app list.
 * @param params - Pagination and filter parameters.
 */
export async function fetchAppPage(params: AppApi.AppPageParams) {
  return requestClient.get<CommonPageResponse<AppInfo>>(AppApi.page, {
    params,
  });
}

/**
 * Retrieve the complete app list.
 */
export async function fetchAllApps() {
  return requestClient.get<AppInfo[]>(AppApi.list);
}

/**
 * Create a new northward app.
 * @param payload - App creation payload.
 */
export async function createApp(payload: AppInfo) {
  return requestClient.post<boolean>(AppApi.base, payload);
}

/**
 * Update an existing northward app.
 * @param payload - App update payload.
 */
export async function updateApp(payload: AppInfo) {
  return requestClient.put<boolean>(AppApi.base, payload);
}

/**
 * Delete a northward app by identifier.
 * @param id - App identifier.
 */
export async function deleteApp(id: IdType) {
  return requestClient.delete<boolean>(AppApi.remove(id));
}

/**
 * Retrieve northward app details by identifier.
 * @param id - App identifier.
 */
export async function getAppById(id: IdType) {
  return requestClient.get<AppInfo>(AppApi.detail(id));
}

/**
 * Change the status of a northward app.
 * @param id - App identifier.
 * @param status - Target status.
 */
export async function changeAppStatus(
  id: IdType,
  status: (typeof CommonStatus)[keyof typeof CommonStatus],
) {
  return requestClient.put(AppApi.changeStatus, {
    id,
    status,
  });
}

/**
 * Get runtime app log level view (effective + active TTL override).
 */
export async function getAppLogLevel(id: IdType) {
  return requestClient.get<AppLogLevelView>(AppApi.logLevel(id));
}

/**
 * Set a temporary app log level override (TTL). Host will auto-revert on expiry.
 */
export async function setAppLogLevel(id: IdType, data: SetAppLogLevelRequest) {
  return requestClient.put<AppLogLevelView>(AppApi.logLevel(id), data);
}

/**
 * Clear the app log level override and restore "follow system".
 */
export async function clearAppLogLevel(id: IdType) {
  return requestClient.delete<AppLogLevelView>(AppApi.logLevel(id));
}
