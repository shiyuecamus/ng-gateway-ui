import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType } from './base';

import { DataType } from './common';

interface ActionDebugRequest {
  params: Record<string, any>;
  timeoutMs?: number;
}

interface ActionDebugResponse {
  result: Recordable<any>;
  elapsedMs: number;
}

interface ActionInfo extends BaseEntity {
  deviceId: IdType;
  name: string;
  command: string;
  inputs: Parameter[];
}

interface Parameter {
  name: string;
  key: string;
  dataType: (typeof DataType)[keyof typeof DataType];
  required: boolean;
  defaultValue: any;
  minValue?: number;
  maxValue?: number;
  transformDataType?: (typeof DataType)[keyof typeof DataType];
  transformScale?: number;
  transformOffset?: number;
  transformNegate?: boolean;
  driverConfig: Recordable<any>;
}

export type { ActionInfo, ActionDebugRequest, ActionDebugResponse };
