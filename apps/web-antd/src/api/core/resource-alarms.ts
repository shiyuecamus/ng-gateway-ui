import { requestClient } from '#/api/request';

export type ResourceAlarmScope =
  | { appId: number; resource: 'northward_app_queue' }
  | { resource: 'extension_store' | 'quota_management' };

export type ResourceAlarmPhase =
  | 'ACKNOWLEDGED'
  | 'FIRING'
  | 'OWNER_CHANGED'
  | 'PENDING'
  | 'RECOVERED'
  | 'RULE_CHANGED'
  | 'SCOPE_RETIRED'
  | 'TRANSIENT';

export interface ResourceAlarm {
  acknowledgedBy: null | number;
  id: string;
  openedAt: string;
  ownerId: string;
  phase: ResourceAlarmPhase;
  recovery: null | {
    startedAtUptimeMs: string;
    successfulHandoffsAtStart: string;
  };
  recoveredWithSuccessfulHandoffs: null | string;
  ruleId: number;
  ruleRevision: string;
  silencedUntil: null | string;
  updatedAt: string;
}

export interface ResourceAlarmRule {
  appId?: number;
  clearThreshold: number;
  enabled: boolean;
  fireAfterMs: string;
  highThreshold: number;
  id: number;
  maximumThreshold: number;
  metric:
    | 'app_queue_configuration_mismatch'
    | 'app_queue_mailbox_pressure'
    | 'app_queue_owner_progress_age'
    | 'app_queue_refusals_per_second'
    | 'app_queue_retention_pressure'
    | 'desired_policy_mismatch'
    | 'external_source_drift'
    | 'owner_progress_age'
    | 'pending_operations'
    | 'persistence_unsettled'
    | 'refusals_per_second'
    | 'reserved_bytes'
    | 'source_backing_refusals_per_second';
  recoverAfterMs: string;
  resource: ResourceAlarmScope['resource'];
  revision: string;
  severity: 'critical' | 'warning';
  thresholdUnit: 'milliseconds' | 'per_mille' | 'per_second' | 'state';
}

export interface ResourceAlarmRuleEdit {
  clearThreshold: number;
  enabled: boolean;
  expectedRevision: string;
  fireAfterMs: string;
  highThreshold: number;
  recoverAfterMs: string;
  ruleId: number;
}

export interface ResourceAlarmView {
  alarms: ResourceAlarm[];
  canAudit: boolean;
  canManage: boolean;
  health: {
    current: boolean;
    historySaturated: boolean;
    persistenceUnavailable: boolean;
    sampleAgeMs: null | string;
    sampledAt: null | string;
    sourceAvailable: boolean;
  };
}

export interface ArchivedAppAlarmScope {
  appId: number;
  lastAlarmOpenedAt: null | string;
}

export interface ArchivedAppAlarmPage {
  nextBeforeAppId: null | number;
  scopes: ArchivedAppAlarmScope[];
}

export interface ResourceAlarmAudit {
  event: {
    acknowledged?: boolean;
    actorId?: number;
    appId?: number;
    appliedLocally?: string;
    brokerAcknowledged?: string;
    desiredRevision?: string;
    kind?: 'observation' | 'operator' | 'scope_retired';
    next?: ResourceAlarmRule;
    ownerId?: string;
    phase?: ResourceAlarmPhase;
    policyRevision?: string;
    previous?: null | ResourceAlarmPhase | ResourceAlarmRule;
    reason?: string;
    refusalsTotal?: string;
    refusedSourceBacking?: string;
    resource?: ResourceAlarmScope['resource'];
    silencedUntil?: null | string;
    successfulHandoffs?: string;
    transportFlushed?: string;
  };
  recordedAtMs: string;
  sequence: string;
}

export interface ResourceAlarmAction {
  acknowledge: boolean;
  reason: string;
  silenceUntil: null | string;
}

const root = '/system/resource-quotas';

export function getArchivedAppAlarmScopes(
  beforeAppId?: number,
  signal?: AbortSignal,
) {
  return requestClient.get<ArchivedAppAlarmPage>(
    `${root}/alarms/archived-apps`,
    {
      params: { beforeAppId },
      signal,
    },
  );
}

export function getResourceAlarms(scope: ResourceAlarmScope) {
  return requestClient.get<ResourceAlarmView>(`${root}/alarms`, {
    params: scope,
  });
}

export function getResourceAlarmRules(scope: ResourceAlarmScope) {
  return requestClient.get<ResourceAlarmRule[]>(`${root}/alarm-rules`, {
    params: scope,
  });
}

export function updateResourceAlarmRule(
  scope: ResourceAlarmScope,
  edit: ResourceAlarmRuleEdit,
) {
  return requestClient.put<ResourceAlarmRule>(`${root}/alarm-rules`, edit, {
    params: scope,
  });
}

export function recordResourceAlarmAction(
  id: string,
  action: ResourceAlarmAction,
  scope: ResourceAlarmScope,
) {
  return requestClient.post<ResourceAlarm>(
    `${root}/alarms/${encodeURIComponent(id)}/acknowledgements`,
    action,
    { params: scope },
  );
}

export function getResourceAlarmEvents(id: string, scope: ResourceAlarmScope) {
  return requestClient.get<ResourceAlarmAudit[]>(
    `${root}/alarms/${encodeURIComponent(id)}/events`,
    { params: scope },
  );
}

export function getResourceAlarmRuleEvents(
  id: number,
  scope: ResourceAlarmScope,
) {
  return requestClient.get<ResourceAlarmAudit[]>(
    `${root}/alarm-rules/${id}/events`,
    { params: scope },
  );
}
