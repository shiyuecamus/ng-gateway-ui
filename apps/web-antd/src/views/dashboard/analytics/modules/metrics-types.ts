export type GatewayWsConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'reconnecting';

export type MetricsScope = 'app' | 'channel' | 'global';

export interface MetricsSubscribeMessage {
  type: 'subscribe';
  requestId?: string;
  scope: MetricsScope;
  id?: number;
  intervalMs?: number;
}

export interface MetricsUnsubscribeMessage {
  type: 'unsubscribe';
  requestId?: string;
}

export interface MetricsPingMessage {
  type: 'ping';
  ts: number;
}

export type MetricsClientMessage =
  | MetricsPingMessage
  | MetricsSubscribeMessage
  | MetricsUnsubscribeMessage;

export interface MetricsSubscribedMessage {
  type: 'subscribed';
  requestId?: string;
  scope?: MetricsScope;
  id?: number;
}

export interface MetricsSnapshotMessage {
  type: 'snapshot';
  requestId?: string;
  scope: MetricsScope;
  id?: number;
  ts: number;
  data: GatewayStatusSnapshot;
}

export interface MetricsUpdateMessage {
  type: 'update';
  scope: MetricsScope;
  id?: number;
  ts: number;
  data: GatewayStatusSnapshot;
}

export interface MetricsErrorMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export interface MetricsPongMessage {
  type: 'pong';
  ts: number;
}

export type MetricsServerMessage =
  | MetricsErrorMessage
  | MetricsPongMessage
  | MetricsSnapshotMessage
  | MetricsSubscribedMessage
  | MetricsUpdateMessage;

// ---- Snapshot DTOs (TS mirror of backend ng-gateway-models/src/core/metrics.rs) ----
// We only model fields that the dashboard uses; keep these narrow on purpose.

/**
 * Best-effort chrono::Duration JSON shapes we accept from backend.
 *
 * chrono serde formats can vary across feature flags; this code accepts multiple shapes:
 * - number (seconds / milliseconds / nanoseconds - heuristics)
 * - tuple [secs, nanos]
 * - object { secs, nanos } / { seconds, nanoseconds }
 */
export type ChronoDurationJson =
  | number
  | [number, number]
  | { nanos?: number; nanoseconds?: number; secs?: number; seconds?: number }
  | null;

export interface GatewayStatusSnapshot {
  state: string;
  metrics: GatewayMetricsSnapshot;
  southward_metrics: SouthwardManagerMetricsSnapshot;
  northward_metrics: NorthwardManagerMetricsSnapshot;
  collector_metrics: CollectorMetricsSnapshot;
  version: string;
  system_info: SystemInfoSnapshot;
}

export interface GatewayMetricsSnapshot {
  uptime: ChronoDurationJson;
  total_channels: number;
  connected_channels: number;
  total_devices: number;
  active_devices: number;
  total_data_points: number;
  total_collections: number;
  successful_collections: number;
  failed_collections: number;
  timeout_collections: number;
  average_collection_time_ms: number;
  active_tasks: number;
  memory_usage: number;
  cpu_usage: number;
  network_bytes_sent: number;
  network_bytes_received: number;
  total_errors: number;
  error_rate: number;
  last_update?: null | string;
}

export interface SystemInfoSnapshot {
  os_type: string;
  os_arch: string;
  hostname?: null | string;
  cpu_cores: number;
  total_memory: number;
  used_memory: number;
  memory_usage_percent: number;
  cpu_usage_percent: number;
  total_disk: number;
  used_disk: number;
  disk_usage_percent: number;
}

export interface SouthwardManagerMetricsSnapshot {
  total_channels: number;
  connected_channels: number;
  total_devices: number;
  active_devices: number;
  total_data_points: number;
  total_actions: number;
  average_points_per_device: number;
  last_update?: null | string;
}

export interface NorthwardManagerMetricsSnapshot {
  total_apps: number;
  active_apps: number;
  total_events_received: number;
  total_data_routed: number;
  routing_errors: number;
  last_update?: null | string;
}

export interface CollectorMetricsSnapshot {
  total_collections: number;
  successful_collections: number;
  failed_collections: number;
  timeout_collections: number;
  average_collection_time_ms: number;
  active_tasks: number;
  batch_efficiency: number;
  current_permits: number;
  available_permits: number;
}

export interface TrendPoint {
  ts: number;
  v: number;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '-';
  const abs = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = abs;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const sign = bytes < 0 ? '-' : '';
  let decimals = 2;
  if (u === 0) decimals = 0;
  else if (v >= 100) decimals = 0;
  else if (v >= 10) decimals = 1;
  return `${sign}${v.toFixed(decimals)} ${units[u]}`;
}

export function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec)) return '-';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) {
    let decimals = 0;
    if (ms < 10) decimals = 2;
    else if (ms < 100) decimals = 1;
    return `${ms.toFixed(decimals)} ms`;
  }
  const s = ms / 1000;
  if (s < 60) {
    const decimals = s < 10 ? 2 : 1;
    return `${s.toFixed(decimals)} s`;
  }
  const m = s / 60;
  return `${m.toFixed(1)} min`;
}

/**
 * Best-effort conversion for chrono::Duration serialized over JSON.
 *
 * chrono serde formats can vary across feature flags; we accept multiple shapes:
 * - number (seconds / milliseconds / nanoseconds - heuristics)
 * - tuple [secs, nanos]
 * - { secs, nanos } like std::time::Duration-ish objects (best-effort)
 */
export function parseChronoDurationToMs(input: ChronoDurationJson): number {
  // chrono::Duration in this codebase often serializes as tuple [secs, nanos]
  if (Array.isArray(input) && input.length >= 2) {
    const secs = Number(input[0]);
    const nanos = Number(input[1]);
    if (Number.isFinite(secs) || Number.isFinite(nanos)) {
      return secs * 1000 + nanos / 1e6;
    }
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const n = input;
    const abs = Math.abs(n);
    // Heuristics:
    // - >= 1e12: likely nanos
    // - >= 1e9: likely micros/nanos (treat as nanos)
    // - >= 1e6: likely millis
    // - else: seconds
    if (abs >= 1e12) return n / 1e6;
    if (abs >= 1e9) return n / 1e6;
    if (abs >= 1e6) return n;
    return n * 1000;
  }
  if (input && typeof input === 'object') {
    const anyObj = input as Record<string, unknown>;
    const secs = Number(((anyObj.secs ?? anyObj.seconds) as unknown) ?? 0);
    const nanos = Number(
      ((anyObj.nanos ?? anyObj.nanoseconds) as unknown) ?? 0,
    );
    if (Number.isFinite(secs) || Number.isFinite(nanos)) {
      return secs * 1000 + nanos / 1e6;
    }
  }
  return 0;
}
