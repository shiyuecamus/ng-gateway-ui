import type { IdType } from '@vben/types';

import { requestClient } from '#/api/request';

import { getChannelCapabilities } from './capability';

export type MmsTlsIdentity =
  | {
      client_certificate_der_base64: string;
      client_certificate_sha256: string;
      material_check_interval_ms: number;
      mode: 'tls';
      not_after_unix: string;
      not_before_unix: string;
      revocation_issuer_material_sha256: string[];
      revocation_material_sha256: string[];
      server_name: string;
      trust_material_sha256: string[];
    }
  | { mode: 'tcp' };

const identityCapability = 'ng:southward:iec61850:tls-identity:boot';

/** Connector-owned public identity remains observable before MMS becomes ready. */
export async function getMmsTlsIdentity(id: IdType, signal: AbortSignal) {
  const inventory = await getChannelCapabilities(id, signal);
  return requestClient.post<MmsTlsIdentity>(
    `/channel/${id}/capabilities/${encodeURIComponent(identityCapability)}`,
    null,
    {
      headers: {
        'X-Gateway-Configuration-Revision': inventory.configurationRevision,
      },
      responseReturn: 'body',
      signal,
      timeout: 10_000,
    },
  );
}
