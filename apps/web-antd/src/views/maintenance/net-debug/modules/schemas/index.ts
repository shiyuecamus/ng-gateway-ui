import type { HttpRequest, PingRequest, TcpConnectRequest } from '@vben/types';

export type NetDebugTabKey = 'http' | 'ping' | 'tcp';
export type NetDebugResultView = 'raw' | 'summary';

export const DEFAULT_PING_FORM: PingRequest = {
  host: '',
  mode: 'icmp',
  count: 4,
  timeoutMs: 1000,
  intervalMs: 250,
  tcpPort: 80,
  payloadBytes: 32,
};

export const DEFAULT_TCP_FORM: TcpConnectRequest = {
  host: '',
  port: 80,
  timeoutMs: 3000,
  readBanner: true,
  bannerBytes: 256,
};

export const DEFAULT_HTTP_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'Accept', value: '*/*' },
];

export const DEFAULT_HTTP_FORM: HttpRequest = {
  method: 'GET',
  url: '',
  timeoutMs: 8000,
  followRedirects: true,
  insecureTls: false,
  maxResponseBytes: 256 * 1024,
  body: '',
};

export const HTTP_METHOD_OPTIONS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
].map((m) => ({ label: m, value: m }));

