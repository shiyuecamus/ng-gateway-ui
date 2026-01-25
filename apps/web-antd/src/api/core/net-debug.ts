import type {
  HttpRequest,
  HttpResponse,
  PingRequest,
  PingResponse,
  TcpConnectRequest,
  TcpConnectResponse,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace NetDebugApi {
  export const base = '/net-debug';
  export const ping = `${base}/ping`;
  export const tcp = `${base}/tcp`;
  export const http = `${base}/http`;
}

export async function netDebugPing(data: PingRequest) {
  return requestClient.post<PingResponse>(NetDebugApi.ping, data);
}

export async function netDebugTcp(data: TcpConnectRequest) {
  return requestClient.post<TcpConnectResponse>(NetDebugApi.tcp, data);
}

export async function netDebugHttp(data: HttpRequest) {
  return requestClient.post<HttpResponse>(NetDebugApi.http, data);
}
