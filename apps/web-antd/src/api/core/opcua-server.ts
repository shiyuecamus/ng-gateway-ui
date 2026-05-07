import type { RequestResponse } from '@vben/request';
import type { IdType } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * REST endpoints for OPC UA Server specific northward app APIs.
 */
export namespace AppOpcuaServerApi {
  /**
   * Route template for downloading materialized OPC UA Server points.
   */
  export const exportPoints = (id: IdType) =>
    `/northward-app/${id}/opcua-server/export-points.xlsx`;
}

export interface OpcuaExportDownload {
  /**
   * Downloaded workbook blob.
   */
  blob: Blob;
  /**
   * Server-suggested file name.
   */
  filename: string;
}

/**
 * Download materialized OPC UA Server points as an Excel workbook.
 * @param id - Northward app identifier.
 */
export async function downloadOpcuaServerPoints(
  id: IdType,
): Promise<OpcuaExportDownload> {
  const response = await requestClient.download<RequestResponse<Blob>>(
    AppOpcuaServerApi.exportPoints(id),
    { responseReturn: 'raw' },
  );
  return {
    blob: response.data,
    filename: parseContentDispositionFilename(
      response.headers['content-disposition'],
    ),
  };
}

function parseContentDispositionFilename(header: unknown): string {
  if (typeof header !== 'string' || header.length === 0) {
    return 'opcua-server-points.xlsx';
  }

  const filenameExt = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (filenameExt?.[1]) {
    return decodeURIComponent(filenameExt[1]);
  }

  const filename = header.match(/filename="([^"]+)"/i);
  return filename?.[1] ?? 'opcua-server-points.xlsx';
}
