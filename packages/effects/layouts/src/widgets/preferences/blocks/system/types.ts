export type SettingValueSource = 'default' | 'env' | 'file';

export type SettingField<T> = {
  envKey?: null | string;
  envOverridden: boolean;
  source: SettingValueSource;
  value: T;
};

export type RuntimeSettingKey = string;

export type SystemSettingsImpact =
  | { components: string[]; type: 'restart_component' }
  | { type: 'hot_apply' }
  | { type: 'restart_process' };

export type ApplySystemSettingsResult = {
  applied: boolean;
  blockedByEnv: RuntimeSettingKey[];
  changedKeys: RuntimeSettingKey[];
  domain: string;
  impact: SystemSettingsImpact;
  persisted: boolean;
  persistenceWarning?: null | string;
  restartTargets: string[];
  runtimeWarning?: null | string;
};
