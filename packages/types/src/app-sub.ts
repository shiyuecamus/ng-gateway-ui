import type { BaseEntity, IdType } from './base';

interface AppSubInfo extends BaseEntity {
  appId: IdType;
  allDevices: boolean;
  deviceIds?: IdType[];
  priority: number;
}

interface DeviceTreeNode {
  id: IdType;
  name: string;
}

interface ChannelDeviceTree {
  id: IdType;
  name: string;
  devices: DeviceTreeNode[];
}

export type { AppSubInfo, ChannelDeviceTree, DeviceTreeNode };
