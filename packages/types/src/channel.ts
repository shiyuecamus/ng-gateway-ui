import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType, RetryPolicy, StatusInfo } from './base';
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

export type { ChannelInfo };
