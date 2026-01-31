import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType, RetryPolicy, StatusInfo } from './base';
import type { LogLevel, TtlRangeView } from './common';
import type { ConnectionState } from './connection-state';

// Channel collection type
export const CollectionType = {
  Report: 0,
  Collection: 1,
} as const;

// Channel report type
export const ReportType = {
  Change: 0,
  Always: 1,
} as const;

export interface ConnectionPolicy {
  connectTimeoutMs: number;
  readTimeoutMs: number;
  writeTimeoutMs: number;
  backoff: RetryPolicy;
}

interface ChannelInfo extends BaseEntity, StatusInfo {
  name: string;
  driverId: IdType;
  driverType: string;
  collectionType: (typeof CollectionType)[keyof typeof CollectionType];
  period?: number;
  reportType: (typeof ReportType)[keyof typeof ReportType];
  connectionPolicy: ConnectionPolicy;
  driverConfig: Recordable<any>;
  /**
   * Connection state from runtime manager (optional)
   */
  connectionState?: ConnectionState | null;
}

/**
 * Temporary channel log override view (TTL).
 */
export interface ChannelLogOverrideView {
  level: LogLevel;
  /** TTL in ms used when setting this override. */
  ttlMs?: number;
  expiresAtMs: number;
}

/**
 * Runtime view for channel log level (effective + active override + TTL bounds).
 */
export interface ChannelLogLevelView {
  channelId: number;
  effective: LogLevel;
  override?: ChannelLogOverrideView;
  ttl: TtlRangeView;
}

export interface SetChannelLogLevelRequest {
  level: LogLevel;
  ttlMs?: number;
}

export type { ChannelInfo };
