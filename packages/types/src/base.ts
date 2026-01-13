import { TagColor } from './color';

export type IdType = number | string | undefined;

export const CommonStatus = {
  /**
   * 禁用
   */
  DISABLED: 1,
  /**
   * 正常
   */
  ENABLED: 0,
} as const;

export const CommonStatusTrans: Map<
  (typeof CommonStatus)[keyof typeof CommonStatus],
  string
> = new Map([
  [CommonStatus.DISABLED, 'common.status.disabled'],
  [CommonStatus.ENABLED, 'common.status.enabled'],
]);

export const CommonStatusColor: Map<
  (typeof CommonStatus)[keyof typeof CommonStatus],
  { borderColor: string; color: string; textColor: string }
> = new Map([
  [CommonStatus.DISABLED, TagColor.Magenta],
  [CommonStatus.ENABLED, TagColor.Cyan],
]);

export enum EntityType {
  /**
   * 动作
   */
  ACTION = 'ACTION',
  /**
   * 通道
   */
  CHANNEL = 'CHANNEL',
  /**
   * 设备
   */
  DEVICE = 'DEVICE',
  /**
   * 驱动
   */
  DRIVER = 'DRIVER',
  /**
   * 菜单
   */
  MENU = 'MENU',
  /**
   * 点
   */
  POINT = 'POINT',
  /**
   * 角色
   */
  ROLE = 'ROLE',
  /**
   * 用户
   */
  USER = 'USER',
  /**
   * 插件
   */
  PLUGIN = 'PLUGIN',
  /**
   * 应用
   */
  APP = 'APP',
}

interface BaseEntity {
  id: IdType;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface StatusInfo {
  /**
   * 状态
   */
  status?: (typeof CommonStatus)[keyof typeof CommonStatus];
}

/** 联系信息 */
interface ContactInfo {
  /**
   * 国家
   */
  country?: string;
  /**
   * 省/州
   */
  state?: string;
  /**
   * 城市
   */
  city?: string;
  /**
   * 邮编
   */
  zip?: string;
  /**
   * 电话
   */
  phone?: string;
  /**
   * 邮箱
   */
  email?: string;
  /**
   * 地址1
   */
  address?: string;
  /**
   * 地址2
   */
  address2?: string;
}

interface AdditionalInfo {
  additionalInfo?: string;
}

interface RetryPolicy {
  maxAttempts?: number;
  initialIntervalMs: number;
  maxIntervalMs: number;
  randomizationFactor: number;
  multiplier: number;
  maxElapsedTimeMs?: number;
}

export type {
  AdditionalInfo,
  BaseEntity,
  ContactInfo,
  StatusInfo,
  RetryPolicy,
};
