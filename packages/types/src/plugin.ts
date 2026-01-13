import type { Recordable } from '@vben-core/typings';

import type { BaseEntity } from './base';

import { PluginSource, OsArch, OsType } from '@vben-core/typings';

interface PluginInfo extends BaseEntity {
  name: string;
  description: string;
  driverType: string;
  source: (typeof PluginSource)[keyof typeof PluginSource];
  version: string;
  apiVersion: number;
  sdkVersion: string;
  osType: (typeof OsType)[keyof typeof OsType];
  osArch: (typeof OsArch)[keyof typeof OsArch];
  size: number;
  path: string;
  checksum: string;
  metadata: Recordable<any>;
}

interface PluginProbeInfo {
  name: string;
  description: string;
  pluginType: string;
  source: (typeof PluginSource)[keyof typeof PluginSource];
  version: string;
  apiVersion: number;
  sdkVersion: string;
  osType: (typeof OsType)[keyof typeof OsType];
  osArch: (typeof OsArch)[keyof typeof OsArch];
  size: number;
  path: string;
  checksum: string;
  metadata: Recordable<any>;
}

export type { PluginInfo, PluginProbeInfo };
