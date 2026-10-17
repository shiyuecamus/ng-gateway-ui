import { requestClient } from '#/api/request';

export interface CertificatePreview {
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

export async function previewCertificate(file: File) {
  const data = new FormData();
  data.append('file', file);
  return requestClient.post<CertificatePreview>('/certificate/preview', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
