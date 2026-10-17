import type { RequestResponse } from '@vben/request';
import type { IdType } from '@vben/types';

import { requestClient } from '#/api/request';

export interface OpcuaClientCertificateInfo {
  subject: string;
  issuer: string;
  serial: string;
  applicationUris: string[];
  dnsNames: string[];
  ipAddresses: string[];
  notBefore: string;
  notAfter: string;
  validNow: boolean;
  sha256Hex: string;
  derBase64: string;
}

export interface OpcuaClientIdentityInfo {
  mode: 'none' | 'secure';
  configurationRevision: string;
  certificate: null | OpcuaClientCertificateInfo;
}

const certificate = (id: IdType) => `/channel/${id}/opcua-client/certificate`;
const certificateDer = (id: IdType) =>
  `/channel/${id}/opcua-client/certificate.der`;

export async function getOpcuaClientCertificateInfo(
  id: IdType,
  signal: AbortSignal,
) {
  return requestClient.get<OpcuaClientIdentityInfo>(certificate(id), {
    signal,
  });
}

export async function downloadOpcuaClientCertificate(
  id: IdType,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await requestClient.download<RequestResponse<Blob>>(
    certificateDer(id),
    { responseReturn: 'raw', signal },
  );
  return response.data;
}
