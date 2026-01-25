export type PingMode = 'icmp' | 'tcp';

export interface PingRequest {
  host: string;
  count?: number;
  timeoutMs?: number;
  intervalMs?: number;
  mode?: PingMode;
  tcpPort?: number;
  payloadBytes?: number;
}

export interface PingSample {
  seq: number;
  ok: boolean;
  rttMs?: null | number;
  error?: null | string;
}

export interface PingResponse {
  host: string;
  resolvedIps: string[];
  targetIp?: null | string;
  mode: PingMode;
  tcpPort?: null | number;
  sent: number;
  received: number;
  lossPercent: number;
  rttMinMs?: null | number;
  rttAvgMs?: null | number;
  rttMaxMs?: null | number;
  samples: PingSample[];
  note?: null | string;
}

export interface TcpConnectRequest {
  host: string;
  port: number;
  timeoutMs?: number;
  readBanner?: boolean;
  bannerBytes?: number;
}

export interface TcpConnectResponse {
  host: string;
  port: number;
  resolvedIps: string[];
  targetIp?: null | string;
  connected: boolean;
  connectMs?: null | number;
  banner?: null | string;
  error?: null | string;
}

export type HttpMethod =
  | 'DELETE'
  | 'GET'
  | 'HEAD'
  | 'OPTIONS'
  | 'PATCH'
  | 'POST'
  | 'PUT';

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: Array<[string, string]>;
  body?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  insecureTls?: boolean;
  maxResponseBytes?: number;
}

export interface HttpResponse {
  url: string;
  resolvedIps: string[];
  status?: null | number;
  headers: Record<string, string>;
  body?: null | string;
  bodyTruncated: boolean;
  totalMs: number;
  error?: null | string;
}
