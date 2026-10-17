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

/** Source-time availability is independent of source-clock quality. */
export type MonitorSourceTimeStatus =
  | 'invalid'
  | 'notBound'
  | 'notObserved'
  | 'notProvided'
  | 'partial'
  | 'provided'
  | 'uninterpreted';

/** A derived timestamp always retains its physical clock role. */
export interface MonitorDataTime {
  time: string;
  origin: 'gatewayReceived' | 'gatewayStateChanged' | 'source';
  fallback:
    | null
    | { kind: 'clockFailure' | 'invalid' | 'unsynchronized' }
    | { kind: 'unavailable'; status: MonitorSourceTimeStatus };
}

/** Protocol-level time never silently becomes per-point source time. */
export interface MonitorProtocolTime {
  kind: 'datasetStateChanged' | 'reportCreated' | 'upstreamServer';
  time: string;
}

/** Complete typed point sample emitted by the canonical SDK sample contract. */
export interface MonitorPointEntry {
  pointId: number;
  pointKey: string;
  value: null | unknown;
  valueType: null | number;
  sourceQuality: {
    raw: null | { bitLen: number; bytes: number[]; protocol: string };
    test: boolean | null;
    validity: 'good' | 'invalid' | 'questionable' | 'unknown';
  };
  freshness: 'current' | 'recovering' | 'stale' | 'unknown';
  sourceTime: null | string;
  sourceTimeStatus: MonitorSourceTimeStatus;
  dataTime: MonitorDataTime | null;
  timeQuality: null | {
    accuracy: null | number;
    clockFailure: boolean | null;
    clockNotSynchronized: boolean | null;
    leapSecondsKnown: boolean | null;
    raw: null | { bitLen: number; bytes: number[]; protocol: string };
    substituted: boolean | null;
    summerTime: boolean | null;
    validity: 'good' | 'invalid' | 'questionable' | 'unknown';
  };
  protocolTime: MonitorProtocolTime | null;
  receivedTime: null | string;
  stateChangedAt: string;
  origin: {
    configEpoch: null | number;
    sessionEpoch: null | number;
    sourceEpoch: null | number;
    sourceId: null | string;
  };
  updateKind: 'freshness' | 'observation';
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
  valueType?: null | number;
  sourceQuality?: MonitorPointEntry['sourceQuality']['validity'];
  sourceFacts?: MonitorPointEntry['sourceQuality'];
  timeFacts?: MonitorPointEntry['timeQuality'];
  sourceMode?: 'normal' | 'test' | 'unknown';
  timeValidity?: 'good' | 'invalid' | 'questionable' | 'unknown';
  freshness?: MonitorPointEntry['freshness'];
  sourceTime?: null | string;
  sourceTimeStatus?: MonitorSourceTimeStatus;
  receivedTime?: null | string;
  protocolTime?: MonitorProtocolTime | null;
  stateChangedAt?: string;
  dataTime?: MonitorDataTime | null;
  sourceType: MonitorSourceType;
  /**
   * Attribute scope for attributes rows.
   * - telemetry rows: undefined
   * - attributes rows: client/shared/server
   *
   * Used to avoid ambiguity when same key exists in multiple attribute scopes.
   */
  scope?: 'client' | 'server' | 'shared';
}

/**
 * Device-level snapshot maintained on the client.
 */
export interface MonitorDeviceSnapshot {
  deviceId: number;
  deviceName: string;
  channelId: number;
  telemetry: Record<string, MonitorPointEntry>;
  clientAttributes: Record<string, MonitorPointEntry>;
  sharedAttributes: Record<string, MonitorPointEntry>;
  serverAttributes: Record<string, MonitorPointEntry>;
  lastUpdate: string;
}

export type MonitorConnectionStatus = GatewayWsConnectionStatus;

export interface MonitorDeviceMeta {
  channelId: number;
  deviceName: string;
  id: number;
}

// ---- WS protocol models for `/api/ws/monitor` ----

export interface MonitorSubscribeMessage extends BaseClientMessage {
  type: 'subscribe';
  channelId?: number;
  requestId: string;
  deviceIds: number[];
}

export type MonitorClientMessage =
  | MonitorSubscribeMessage
  | WsPingMessage
  | WsUnsubscribeMessage;

export type MonitorSnapshotMessage = BaseServerMessage & {
  attributes: {
    client: Record<string, MonitorPointEntry>;
    server: Record<string, MonitorPointEntry>;
    shared: Record<string, MonitorPointEntry>;
  };
  lastUpdate: null | string;
  meta: MonitorDeviceMeta;
  requestId: string;
  telemetry: Record<string, MonitorPointEntry>;
  type: 'snapshot';
};

export type MonitorSubscribedMessage = BaseServerMessage & {
  deviceIds: number[];
  requestId?: string;
  type: 'subscribed';
};

export type MonitorServerMessage =
  | MonitorSnapshotMessage
  | MonitorSubscribedMessage
  | WsErrorMessage
  | WsPongMessage;
