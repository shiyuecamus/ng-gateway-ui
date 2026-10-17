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
  export const certificate = (id: IdType) =>
    `/northward-app/${id}/opcua-server/certificate`;
  export const certificateDer = (id: IdType) =>
    `/northward-app/${id}/opcua-server/certificate.der`;
}

export interface OpcuaPublicCertificateInfo {
  sha256Hex: string;
  summary: {
    common_name: string;
    days_to_expiry: number;
    health: string;
    not_after: string;
    not_before: string;
    san_hostnames: string[];
    san_ips: string[];
    san_uri: string;
    thumbprint_hex: string;
  };
}

export async function getOpcuaServerCertificateInfo(
  id: IdType,
  signal: AbortSignal,
) {
  return requestClient.get<OpcuaPublicCertificateInfo>(
    AppOpcuaServerApi.certificate(id),
    { signal },
  );
}

export async function downloadOpcuaServerCertificate(
  id: IdType,
  signal: AbortSignal,
): Promise<OpcuaExportDownload> {
  const response = await requestClient.download<RequestResponse<Blob>>(
    AppOpcuaServerApi.certificateDer(id),
    { responseReturn: 'raw', signal },
  );
  return {
    blob: response.data,
    filename: parseContentDispositionFilename(
      response.headers['content-disposition'],
      'ng-gateway-opcua-server.der',
    ),
  };
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
      'opcua-server-points.xlsx',
    ),
  };
}

function parseContentDispositionFilename(
  header: unknown,
  fallback: string,
): string {
  if (typeof header !== 'string' || header.length === 0) {
    return fallback;
  }

  const filenameExt = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (filenameExt?.[1]) {
    return decodeURIComponent(filenameExt[1]);
  }

  const filename = header.match(/filename="([^"]+)"/i);
  return filename?.[1] ?? fallback;
}
