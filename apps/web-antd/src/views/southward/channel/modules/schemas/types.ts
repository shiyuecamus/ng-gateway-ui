import type { GatewayWsConnectionStatus } from '@vben/types';

export type ObservabilityConnectionStatus = GatewayWsConnectionStatus;

export interface DeviceObservabilityRow {
  deviceId: number;
  deviceName: string;
  deviceType: string;
  status: number;
  runtimeState?: number;

  bytesSent: number;
  bytesReceived: number;
  bytesAttributed: boolean;

  collectSuccessTotal: number;
  collectFailTotal: number;
  collectTimeoutTotal: number;

  avgCollectLatencyMs: number;
  lastCollectLatencyMs: number;
  lastActivityMs: number;
}
