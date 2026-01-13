import type { Recordable } from '@vben-core/typings';

import type { BaseEntity, IdType, StatusInfo } from './base';

interface DeviceInfo extends BaseEntity, StatusInfo {
  deviceName: string;
  deviceType: string;
  channelId: IdType;
  driverConfig: Recordable<any>;
}

export type { DeviceInfo };
