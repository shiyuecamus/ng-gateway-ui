import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType, RetryPolicy, StatusInfo } from './base';
import type { LogLevel, TtlRangeView } from './common';
import type { ConnectionState } from './connection-state';

/**
 * Drop policy options for app queue handling.
 */
export const DropPolicy = {
  /**
   * Discard overflowing messages directly.
   */
  Discard: 0,
  /**
   * Block producers until space becomes available.
   */
  Block: 1,
} as const;

/**
 * Queue policy configuration for a northward app.
 */
interface QueuePolicy {
  /**
   * Maximum number of in-flight messages.
   */
  capacity: number;
  /**
   * Strategy to apply when the queue reaches capacity.
   */
  dropPolicy: (typeof DropPolicy)[keyof typeof DropPolicy];
  /**
   * Duration in milliseconds to block incoming messages when using block policy.
   */
  blockDuration: number;
  /**
   * Flag that indicates whether buffering is enabled when the upstream is unavailable.
   */
  bufferEnabled: boolean;
  /**
   * Maximum number of buffered items when buffering is enabled.
   */
  bufferCapacity: number;
  /**
   * Expiration interval for buffered messages, measured in milliseconds.
   */
  bufferExpireMs: number;
}

/**
 * Read-only northward app information.
 */
interface AppInfo extends BaseEntity, StatusInfo {
  /**
   * Identifier of the plugin associated with the app.
   */
  pluginId: IdType;
  /**
   * Display name of the plugin associated with the app.
   */
  pluginType: string;
  /**
   * Display name of the app.
   */
  name: string;
  /**
   * Optional description that explains the app purpose.
   */
  description?: string;
  /**
   * Arbitrary configuration payload compatible with the plugin metadata definition.
   */
  config: Recordable<any>;
  /**
   * Retry policy applied when pushing data to the northbound channel.
   */
  retryPolicy: RetryPolicy;
  /**
   * Queue policy used to buffer outgoing messages.
   */
  queuePolicy: QueuePolicy;
  /**
   * Connection state from runtime manager (optional)
   */
  connectionState?: ConnectionState | null;
}

/**
 * Temporary app log override view (TTL).
 */
export interface AppLogOverrideView {
  level: LogLevel;
  /** TTL in ms used when setting this override. */
  ttlMs?: number;
  expiresAtMs: number;
}

/**
 * Runtime view for app log level (effective + active override + TTL bounds).
 */
export interface AppLogLevelView {
  appId: number;
  effective: LogLevel;
  override?: AppLogOverrideView;
  ttl: TtlRangeView;
}

export interface SetAppLogLevelRequest {
  level: LogLevel;
  ttlMs?: number;
}

export type { AppInfo, QueuePolicy };
