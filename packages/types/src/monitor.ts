import type {
  BaseClientMessage,
  BaseServerMessage,
  GatewayWsConnectionStatus,
  WsErrorMessage,
  WsPingMessage,
  WsPongMessage,
  WsUnsubscribeMessage,
} from './ws';

export type MonitorSourceType = 'attributes' | 'telemetry';

export type MonitorAttributeScope = 'client' | 'server' | 'shared';

export interface MonitorUpdateHint {
  deviceId: number;
  dataType: MonitorSourceType;
  /** For attributes only */
  scope?: MonitorAttributeScope;
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

export type MonitorConnectionStatus = GatewayWsConnectionStatus;

// ---- WS protocol models for `/api/ws/monitor` ----

export interface MonitorSubscribeMessage extends BaseClientMessage {
  type: 'subscribe';
  channelId?: number;
  deviceId?: number;
  deviceIds?: number[];
}

export type MonitorClientMessage =
  | MonitorSubscribeMessage
  | WsPingMessage
  | WsUnsubscribeMessage;

export type MonitorSnapshotMessage = BaseServerMessage & {
  type: 'snapshot';
  attributes: {
    client: Record<string, unknown>;
    server: Record<string, unknown>;
    shared: Record<string, unknown>;
  };
  device: {
    channelId: number;
    deviceName: string;
    id: number;
  };
  lastUpdate: string;
  telemetry: Record<string, unknown>;
};

export type MonitorUpdateMessage =
  | (BaseServerMessage & {
      type: 'update';
      dataType: 'telemetry';
      deviceId: number;
      timestamp: string;
      values: Record<string, unknown>;
    })
  | (BaseServerMessage & {
      type: 'update';
      dataType: 'attributes';
      deviceId: number;
      /**
       * Optional scope hint. Some servers may emit a scope string, but the
       * client still maintains all three attribute maps.
       */
      scope?: MonitorAttributeScope;
      timestamp: string;
      values: Partial<{
        client: Record<string, unknown>;
        server: Record<string, unknown>;
        shared: Record<string, unknown>;
      }>;
    });

export type MonitorSubscribedMessage = BaseServerMessage & {
  type: 'subscribed';
  deviceIds: number[];
  requestId?: string;
};

export type MonitorServerMessage =
  | WsPongMessage
  | WsErrorMessage
  | MonitorSnapshotMessage
  | MonitorUpdateMessage
  | MonitorSubscribedMessage;

