import type { GatewayWsConnectionStatus } from '@vben/types';

export type ObservabilityConnectionStatus = GatewayWsConnectionStatus;

export interface DeviceObservabilityRow {
  deviceId: number;
  deviceName: string;
  deviceType: string;
  status: number;
  runtimeState?: number;

  collectSuccessTotal: number;
  collectFailTotal: number;
  collectTimeoutTotal: number;

  avgCollectLatencyMs: number;
  lastCollectLatencyMs: number;

  reportSuccessTotal: number;
  reportDroppedTotal: number;
  reportFailTotal: number;
  lastReportMs: number;

  lastActivityMs: number;
}
