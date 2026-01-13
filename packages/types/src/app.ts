import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType, RetryPolicy, StatusInfo } from './base';

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
 * Northward connection state enumeration
 */
export const NorthwardConnectionState = {
  Disconnected: 'Disconnected',
  Connecting: 'Connecting',
  Connected: 'Connected',
  Reconnecting: 'Reconnecting',
  Failed: 'Failed',
} as const;

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
  connectionState?:
    | (typeof NorthwardConnectionState)[keyof typeof NorthwardConnectionState]
    | string;
}

export type { AppInfo, QueuePolicy };
