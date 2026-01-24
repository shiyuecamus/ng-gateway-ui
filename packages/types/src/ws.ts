export type GatewayWsConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'reconnecting';

export interface BaseClientMessage {
  type: string;
  requestId?: string;
}

export interface BaseServerMessage {
  type: string;
  requestId?: string;
  ts?: number;
}

export interface WsPingMessage extends BaseClientMessage {
  type: 'ping';
  ts: number;
}

export interface WsPongMessage extends BaseServerMessage {
  type: 'pong';
  ts: number;
}

export interface WsErrorMessage extends BaseServerMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export interface WsSubscribedMessage extends BaseServerMessage {
  type: 'subscribed';
}

export interface WsUnsubscribeMessage extends BaseClientMessage {
  type: 'unsubscribe';
}
