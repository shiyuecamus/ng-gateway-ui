import type {
  ApStatus,
  ConfigureApRequest,
  ConfigureInterfaceRequest,
  NetworkCapabilities,
  NetworkInterfaceDetail,
  NetworkInterfaceSummary,
  SavedWifiConnection,
  WifiConnectPreflight,
  WifiConnectRequest,
  WifiDisconnectRequest,
  WifiScanResult,
  WifiStaStatus,
  WiredStatus,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace NetworkApi {
  export const base = '/network';
  export const interfaces = `${base}/interfaces`;
  export const interfaceDetail = (name: string) => `${base}/interfaces/${name}`;
  export const capabilities = `${base}/capabilities`;
  export const wiredStatus = `${base}/wired/status`;
  export const wifiScan = `${base}/wifi/scan`;
  export const wifiPreflight = `${base}/wifi/preflight`;
  export const wifiConnect = `${base}/wifi/connect`;
  export const wifiDisconnect = `${base}/wifi/disconnect`;
  export const wifiStatus = `${base}/wifi/status`;
  export const wifiSaved = `${base}/wifi/saved`;
  export const wifiSavedDetail = (uuid: string) =>
    `${base}/wifi/saved/${uuid}`;
  export const ap = `${base}/ap`;
}

// ─── Phase 1: Discovery ───

export async function fetchNetworkInterfaces() {
  return requestClient.get<NetworkInterfaceSummary[]>(NetworkApi.interfaces);
}

export async function fetchNetworkInterfaceDetail(name: string) {
  return requestClient.get<NetworkInterfaceDetail>(
    NetworkApi.interfaceDetail(name),
  );
}

export async function fetchNetworkCapabilities() {
  return requestClient.get<NetworkCapabilities>(NetworkApi.capabilities);
}

// ─── Aggregated Status ───

export async function fetchWiredStatus() {
  return requestClient.get<WiredStatus>(NetworkApi.wiredStatus);
}

// ─── Phase 2: Interface Configuration ───

export async function configureNetworkInterface(
  name: string,
  data: ConfigureInterfaceRequest,
) {
  return requestClient.put<boolean>(NetworkApi.interfaceDetail(name), data);
}

// ─── Phase 3: Wi-Fi ───

export async function scanWifi(interfaceName?: string) {
  return requestClient.get<WifiScanResult>(NetworkApi.wifiScan, {
    params: interfaceName ? { interface: interfaceName } : undefined,
  });
}

export async function wifiConnectPreflight(data: WifiConnectRequest) {
  return requestClient.post<WifiConnectPreflight>(
    NetworkApi.wifiPreflight,
    data,
  );
}

export async function connectWifi(data: WifiConnectRequest) {
  return requestClient.post<WifiStaStatus>(NetworkApi.wifiConnect, data);
}

export async function disconnectWifi(data?: WifiDisconnectRequest) {
  return requestClient.post<boolean>(NetworkApi.wifiDisconnect, data ?? {});
}

export async function fetchWifiStatus(interfaceName?: string) {
  return requestClient.get<WifiStaStatus>(NetworkApi.wifiStatus, {
    params: interfaceName ? { interface: interfaceName } : undefined,
  });
}

// ─── Phase 3.5: Saved Wi-Fi Networks ───

export async function fetchSavedWifiConnections() {
  return requestClient.get<SavedWifiConnection[]>(NetworkApi.wifiSaved);
}

export async function forgetWifi(uuid: string) {
  return requestClient.delete<boolean>(NetworkApi.wifiSavedDetail(uuid));
}

// ─── Phase 4: AP Hotspot ───

export async function fetchApStatus() {
  return requestClient.get<ApStatus>(NetworkApi.ap);
}

export async function configureAp(data: ConfigureApRequest) {
  return requestClient.put<ApStatus>(NetworkApi.ap, data);
}

export async function startAp() {
  return requestClient.post<ApStatus>(`${NetworkApi.ap}/start`);
}

export async function stopAp() {
  return requestClient.post<ApStatus>(`${NetworkApi.ap}/stop`);
}
