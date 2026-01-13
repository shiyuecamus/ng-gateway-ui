import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType } from './base';

import { DataType } from './common';

export const DataPointType = {
  Attribute: 0,
  Telemetry: 1,
  Event: 2,
} as const;

export const AccessMode = {
  Read: 0,
  Write: 1,
  ReadWrite: 2,
} as const;

interface PointInfo extends BaseEntity {
  deviceId: IdType;
  name: string;
  key: string;
  type: (typeof DataPointType)[keyof typeof DataPointType];
  dataType: (typeof DataType)[keyof typeof DataType];
  accessMode: (typeof AccessMode)[keyof typeof AccessMode];
  unit?: string;
  minValue?: number;
  maxValue?: number;
  scale?: number;
  driverConfig: Recordable<any>;
}

export type { PointInfo };
