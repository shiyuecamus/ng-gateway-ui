import type {
  CommonPageRequest,
  CommonPageResponse,
  CommonStatus,
  CommonTimeRangeRequest,
  DriverInfo,
  DriverProbeInfo,
  DriverSource,
  OsArch,
  OsType,
  DriverTemplateEntity,
  IdType,
} from '@vben/types';

import { downloadFileFromBlob } from '@vben/utils';

import { requestClient } from '#/api/request';

export namespace DriverApi {
  export const base = '/driver';
  export const list = `${base}/list`;
  export const page = `${base}/page`;
  export const install = `${base}/install`;
  export const preview = `${base}/probe`;
  export const uninstall = (id: IdType) => `${base}/${id}`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const getSchemasById = (id: IdType) => `${base}/metadata/${id}`;
  export const templateDownload = (
    id: IdType,
    entity: (typeof DriverTemplateEntity)[keyof typeof DriverTemplateEntity],
  ) => `${base}/template/${id}/${entity}`;

  /** driver page params */
  export interface DriverPageParams
    extends CommonPageRequest,
      CommonTimeRangeRequest {
    name?: string;
    driver_type?: string;
    source?: (typeof DriverSource)[keyof typeof DriverSource];
    version?: string;
    sdk_version?: string;
    os_type?: (typeof OsType)[keyof typeof OsType];
    os_arch?: (typeof OsArch)[keyof typeof OsArch];
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }

  export interface InstallDriverParams {
    file: File;
    onError?: (error: Error) => void;
    onProgress?: (progress: { percent: number }) => void;
    onSuccess?: (data: any, file: File) => void;
  }
}

/**
 * fetch driver page
 * @param params - Driver page params
 * @returns Promise with driver page response
 */
export async function fetchDriverPage(params: DriverApi.DriverPageParams) {
  return requestClient.get<CommonPageResponse<DriverInfo>>(DriverApi.page, {
    params,
  });
}

/**
 * fetch all drivers
 * @returns Promise with all drivers response
 */
export async function fetchAllDrivers() {
  return requestClient.get<Array<DriverInfo>>(DriverApi.list);
}

/**
 * install driver
 * @param params - Install driver params
 * @returns Promise with install driver response
 */
export async function installDriver(params: DriverApi.InstallDriverParams) {
  try {
    params.onProgress?.({ percent: 0 });

    const data = await requestClient.upload(DriverApi.install, {
      file: params.file,
    });

    params.onProgress?.({ percent: 100 });
    params.onSuccess?.(data, params.file);
  } catch (error) {
    params.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * preview driver
 * @param params - Preview driver params
 * @returns Promise with preview response
 */
export async function previewDriver(params: DriverApi.InstallDriverParams) {
  try {
    params.onProgress?.({ percent: 0 });

    const data: DriverProbeInfo = await requestClient.upload(
      DriverApi.preview,
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
 * uninstall driver
 * @param id - Driver ID
 * @returns Promise with uninstall response
 */
export async function uninstallDriver(id: IdType) {
  return requestClient.delete(DriverApi.uninstall(id));
}

/**
 * get driver by id
 * @param id - Driver ID
 * @returns Promise with driver response
 */
export async function getDriverById(id: IdType) {
  return requestClient.get<DriverInfo>(DriverApi.getById(id));
}

/**
 * get driver schemas (DriverSchemas) by id
 * @param id - Driver ID
 */
export async function fetchDriverSchemasById(id: IdType) {
  return requestClient.get<any>(DriverApi.getSchemasById(id));
}

/**
 * download driver template
 * @param id - Driver ID
 * @param driverType - Driver type
 * @param entity - Driver template entity
 * @returns Promise with driver template Blob
 */
export async function downloadDriverTemplate(
  id: IdType,
  driverType: string,
  entity: (typeof DriverTemplateEntity)[keyof typeof DriverTemplateEntity],
) {
  const response = await requestClient.download<Blob>(
    DriverApi.templateDownload(id, entity),
  );
  downloadFileFromBlob({
    source: response,
    fileName: `${driverType}-${entity}-template.xlsx`,
  });
}
