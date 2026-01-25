import type {
  BaseClientMessage,
  BaseServerMessage,
  WsPingMessage,
  WsPongMessage,
} from './ws';

export type MetricsScope = 'app' | 'channel' | 'device' | 'global';

/**
 * Best-effort chrono::Duration JSON shapes we accept from backend.
 *
 * Note: for device metrics we intentionally avoid chrono durations and use `*LatencyMs` numbers.
 */
export type ChronoDurationJson =
  | [number, number]
  | null
  | number
  | { nanos?: number; nanoseconds?: number; seconds?: number; secs?: number };

// ---- Snapshot DTOs (TS mirror of backend ng-gateway-models/src/core/metrics.rs) ----

export interface GatewayStatusSnapshot {
  state: string;
  metrics: GatewayMetricsSnapshot;
  southwardMetrics: SouthwardManagerMetricsSnapshot;
  northwardMetrics: NorthwardManagerMetricsSnapshot;
  collectorMetrics: CollectorMetricsSnapshot;
  version: string;
  systemInfo: SystemInfoSnapshot;
}

export interface GatewayMetricsSnapshot {
  uptime: ChronoDurationJson;
  totalChannels: number;
  connectedChannels: number;

  totalDevices: number;
  activeDevices: number;
  totalDataPoints: number;

  totalCollections: number;
  successfulCollections: number;
  failedCollections: number;
  timeoutCollections: number;
  averageCollectionTimeMs: number;
  activeTasks: number;

  memoryUsage: number;
  cpuUsage: number;
  networkBytesSent: number;
  networkBytesReceived: number;

  totalErrors: number;
  errorRate: number;
  lastUpdate?: null | string;
}

export interface SystemInfoSnapshot {
  osType: string;
  osArch: string;
  hostname?: null | string;
  cpuCores: number;
  totalMemory: number;
  usedMemory: number;
  memoryUsagePercent: number;
  cpuUsagePercent: number;
  totalDisk: number;
  usedDisk: number;
  diskUsagePercent: number;
}

export interface SouthwardManagerMetricsSnapshot {
  totalChannels: number;
  connectedChannels: number;
  totalDevices: number;
  activeDevices: number;
  totalDataPoints: number;
  totalActions: number;
  averagePointsPerDevice: number;
  lastUpdate?: null | string;
}

export interface NorthwardManagerMetricsSnapshot {
  totalApps: number;
  activeApps: number;
  totalEventsReceived: number;
  totalDataRouted: number;
  routingErrors: number;
  lastUpdate?: null | string;
}

export interface CollectorMetricsSnapshot {
  totalCollections: number;
  successfulCollections: number;
  failedCollections: number;
  timeoutCollections: number;
  averageCollectionTimeMs: number;
  activeTasks: number;
  batchEfficiency: number;
  currentPermits: number;
  availablePermits: number;
}

export interface ChannelMetricsSnapshot {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: ChronoDurationJson;
  lastOperationTime: ChronoDurationJson;
  bytesSent: number;
  bytesReceived: number;
  reconnectionCount: number;
  // collection (point-based)
  pointReadSuccessTotal: number;
  pointReadFailTotal: number;
  pointReadTimeoutTotal: number;
  // connection reliability
  connectFailedCount: number;
  disconnectCount: number;
  lastStateChangeAt?: null | string;
  // report/push (driver publisher.try_publish)
  reportPublishSuccessTotal: number;
  reportPublishDroppedTotal: number;
  reportPublishFailTotal: number;
  lastReportAt?: null | string;
}

export interface ControlMetricsSnapshot {
  // write-point
  writeSuccessTotal: number;
  writeFailTotal: number;
  writeTimeoutTotal: number;
  writeQueueWaitAvgMs: number;
  writeExecuteAvgMs: number;
  // execute-action
  executeSuccessTotal: number;
  executeFailTotal: number;
  executeTimeoutTotal: number;
  executeAvgMs: number;
}

export interface ChannelStatsSnapshot {
  channelId: number;
  name: string;
  driverName: string;
  state: unknown;
  health?: unknown;
  deviceCount: number;
  metrics: ChannelMetricsSnapshot;
  controlMetrics?: ControlMetricsSnapshot | null;
  createdAt: string;
  lastActivity: string;
}

export interface NorthwardAppMetricsSnapshot {
  messagesSent: number;
  messagesDropped: number;
  errors: number;
  retries: number;
  lastSent?: null | string;
  lastError?: null | string;
  avgLatencyMs: number;
}

export interface NorthwardAppStatsSnapshot {
  appId: number;
  pluginId: number;
  name: string;
  state: number;
  isConnected: boolean;
  metrics: NorthwardAppMetricsSnapshot;
}

export interface DeviceStatsSnapshot {
  deviceId: number;
  channelId: number;
  deviceName: string;
  deviceType: string;
  status: number;
  runtimeState?: number;

  // flattened metrics fields (backend uses `#[serde(flatten)]`)
  collectSuccessTotal: number;
  collectFailTotal: number;
  collectTimeoutTotal: number;
  avgCollectLatencyMs: number;
  lastCollectLatencyMs: number;
  // report/push (driver publisher.try_publish)
  reportSuccessTotal: number;
  reportDroppedTotal: number;
  reportFailTotal: number;
  lastReportMs: number;
  lastActivityMs: number;
}

export interface DeviceRowsPayload {
  rows: DeviceStatsSnapshot[];
}

export interface TrendPoint {
  ts: number;
  v: number;
}

// ---- WS protocol models for `/api/ws/metrics` ----

export interface MetricsSubscribeMessage extends BaseClientMessage {
  type: 'subscribe';
  requestId?: string;
  scope: MetricsScope;
  id?: number;
  intervalMs?: number;
}

export interface MetricsUnsubscribeMessage extends BaseClientMessage {
  type: 'unsubscribe';
  requestId?: string;
  scope?: MetricsScope;
  id?: number;
}

export type MetricsClientMessage =
  | MetricsSubscribeMessage
  | MetricsUnsubscribeMessage
  | WsPingMessage;

export interface MetricsSubscribedMessage extends BaseServerMessage {
  type: 'subscribed';
  requestId?: string;
  scope?: MetricsScope;
  id?: number;
}

export interface MetricsErrorMessage extends BaseServerMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export type MetricsSnapshotMessage =
  | (BaseServerMessage & {
      data: ChannelStatsSnapshot;
      id: number;
      requestId?: string;
      scope: 'channel';
      ts: number;
      type: 'snapshot';
    })
  | (BaseServerMessage & {
      data: DeviceRowsPayload;
      id: number;
      requestId?: string;
      scope: 'device';
      ts: number;
      type: 'snapshot';
    })
  | (BaseServerMessage & {
      data: GatewayStatusSnapshot;
      requestId?: string;
      scope: 'global';
      ts: number;
      type: 'snapshot';
    })
  | (BaseServerMessage & {
      data: NorthwardAppStatsSnapshot;
      id: number;
      requestId?: string;
      scope: 'app';
      ts: number;
      type: 'snapshot';
    });

export type MetricsUpdateMessage =
  | (BaseServerMessage & {
      data: ChannelStatsSnapshot;
      id: number;
      scope: 'channel';
      ts: number;
      type: 'update';
    })
  | (BaseServerMessage & {
      data: DeviceRowsPayload;
      id: number;
      scope: 'device';
      ts: number;
      type: 'update';
    })
  | (BaseServerMessage & {
      data: GatewayStatusSnapshot;
      scope: 'global';
      ts: number;
      type: 'update';
    })
  | (BaseServerMessage & {
      data: NorthwardAppStatsSnapshot;
      id: number;
      scope: 'app';
      ts: number;
      type: 'update';
    });

export type MetricsServerMessage =
  | MetricsErrorMessage
  | MetricsSnapshotMessage
  | MetricsSubscribedMessage
  | MetricsUpdateMessage
  | WsPongMessage;
