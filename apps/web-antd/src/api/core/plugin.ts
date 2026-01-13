import type {
  CommonPageRequest,
  CommonPageResponse,
  CommonStatus,
  CommonTimeRangeRequest,
  PluginInfo,
  PluginProbeInfo,
  PluginSource,
  IdType,
  OsArch,
  OsType,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace PluginApi {
  export const base = '/plugin';
  export const list = `${base}/list`;
  export const page = `${base}/page`;
  export const install = `${base}/install`;
  export const preview = `${base}/probe`;
  export const uninstall = (id: IdType) => `${base}/${id}`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const getSchemasById = (id: IdType) => `${base}/metadata/${id}`;

  /** northward plugin page params */
  export interface PluginPageParams
    extends CommonPageRequest,
      CommonTimeRangeRequest {
    name?: string;
    plugin_type?: string;
    source?: (typeof PluginSource)[keyof typeof PluginSource];
    version?: string;
    sdk_version?: string;
    os_type?: (typeof OsType)[keyof typeof OsType];
    os_arch?: (typeof OsArch)[keyof typeof OsArch];
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }

  export interface InstallPluginParams {
    file: File;
    onError?: (error: Error) => void;
    onProgress?: (progress: { percent: number }) => void;
    onSuccess?: (data: any, file: File) => void;
  }
}

/**
 * fetch plugin page
 * @param params - Plugin page params
 * @returns Promise with plugin page response
 */
export async function fetchPluginPage(params: PluginApi.PluginPageParams) {
  return requestClient.get<CommonPageResponse<PluginInfo>>(PluginApi.page, {
    params,
  });
}

/**
 * fetch all plugins
 * @returns Promise with all plugins response
 */
export async function fetchAllPlugins() {
  return requestClient.get<Array<PluginInfo>>(PluginApi.list);
}

/**
 * install plugin
 * @param params - Install plugin params
 * @returns Promise with install plugin response
 */
export async function installPlugin(params: PluginApi.InstallPluginParams) {
  try {
    params.onProgress?.({ percent: 0 });

    const data = await requestClient.upload(PluginApi.install, {
      file: params.file,
    });

    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * preview plugin
 * @param params - Preview plugin params
 * @returns Promise with preview response
 */
export async function previewPlugin(params: PluginApi.InstallPluginParams) {
  try {
    params.onProgress?.({ percent: 0 });

    const data: PluginProbeInfo = await requestClient.upload(
      PluginApi.preview,
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

/**
 * uninstall plugin
 * @param id - Plugin ID
 * @returns Promise with uninstall response
 */
export async function uninstallPlugin(id: IdType) {
  return requestClient.delete(PluginApi.uninstall(id));
}

/**
 * get plugin by id
 * @param id - Plugin ID
 * @returns Promise with plugin response
 */
export async function getPluginById(id: IdType) {
  return requestClient.get<PluginInfo>(PluginApi.getById(id));
}

/**
 * get plugin schemas (PluginSchemas) by id
 * @param id - Plugin ID
 */
export async function fetchPluginSchemasById(id: IdType) {
  return requestClient.get<any>(PluginApi.getSchemasById(id));
}
