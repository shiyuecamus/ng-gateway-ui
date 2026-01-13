export type MonitorSourceType = 'attributes' | 'telemetry';

export interface MonitorUpdateHint {
  deviceId: number;
  dataType: MonitorSourceType;
  /** For attributes only */
  scope?: 'client' | 'server' | 'shared';
  /** Keys included in this update window */
  keys: string[];
}

/**
 * Single row in realtime monitor table.
 */
export interface MonitorRow {
  /** Unique row id: `${deviceId}-${sourceType}-${key}` */
  id: string;
  deviceId: number;
  deviceName: string;
  key: string;
  value: unknown;
  sourceType: MonitorSourceType;
  /**
   * Attribute scope for attributes rows.
   * - telemetry rows: undefined
   * - attributes rows: client/shared/server
   *
   * Used to avoid ambiguity when same key exists in multiple attribute scopes.
   */
  scope?: 'client' | 'server' | 'shared';
  lastUpdate: string;
}

/**
 * Device-level snapshot maintained on the client.
 */
export interface MonitorDeviceSnapshot {
  deviceId: number;
  deviceName: string;
  channelId: number;
  telemetry: Record<string, unknown>;
  clientAttributes: Record<string, unknown>;
  sharedAttributes: Record<string, unknown>;
  serverAttributes: Record<string, unknown>;
  lastUpdate: string;
}

export type MonitorConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'reconnecting';
