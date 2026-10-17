import type { MonitorPointEntry } from '@vben/types';

import { requestClient } from '#/api/request';

export type ControlState =
  | 'awaitingTermination'
  | 'cancelled'
  | 'dispatching'
  | 'expired'
  | 'failedBeforeDispatch'
  | 'indeterminate'
  | 'partialProtocolCompleted'
  | 'partialServiceAccepted'
  | 'protocolRejected'
  | 'protocolSucceeded'
  | 'registered'
  | 'releasePending'
  | 'releasePendingLate'
  | 'resolvedByOperator'
  | 'selected'
  | 'serviceAccepted';

export type ControlPhase =
  | 'action'
  | 'cancel'
  | 'operate'
  | 'parameterWrite'
  | 'select'
  | 'selectWithValue';

export interface ControlOperation {
  cancellation: ControlCancellation | null;
  completionFingerprint: null | string;
  authorityBindingRevision: string;
  binding: {
    authorityId: string;
    footprints: (
      | { endExclusive: string; kind: 'range'; space: string; start: string }
      | { key: string; kind: 'object'; space: string }
      | { kind: 'wholeAuthority' }
    )[];
    requiresTermination: boolean;
  };
  channelId: number;
  clientRequest: unknown;
  configurationRevision: string;
  createdAt: string;
  deadline: string;
  deviceId: number;
  eventCount: string;
  fingerprint: string;
  idempotencyKey: string;
  operationId: string;
  phase: ControlPhase | null;
  phaseMask: number;
  principal: string;
  scope: string;
  state: ControlState;
  targetSnapshot: unknown;
  updatedAt: string;
}

export interface ControlCancellation {
  idempotencyKey: string;
  principal: string;
  reason: string;
  requestedAt: string;
  requestId: string;
}

export interface ControlEvent {
  cancellation: ControlCancellation | null;
  completionFingerprint: null | string;
  actor: null | string;
  evidence: unknown;
  operationId: string;
  phase: ControlPhase | null;
  previousState: ControlState | null;
  reason: string;
  recordedAt: string;
  sequence: string;
  state: ControlState;
}

export interface ControlDetails {
  canCancel: boolean;
  currentObservation: MonitorPointEntry | null;
  events: ControlEvent[];
  operation: ControlOperation;
}

export function cancelControl(
  operationId: string,
  expectedFingerprint: string,
  idempotencyKey: string,
  reason: string,
  signal: AbortSignal,
) {
  return requestClient.post<ControlOperation>(
    `/control/operations/${operationId}/cancel`,
    { expectedFingerprint, idempotencyKey, reason },
    { signal, timeout: 20_000 },
  );
}

export interface ControlCapabilities {
  canEngineer: boolean;
  canExecuteAction: boolean;
  canReadAll: boolean;
  canReconcile: boolean;
  canWritePoint: boolean;
}

export interface ControlOperationSummary {
  recordSequence: string;
  authorityId: string;
  channelId: number;
  createdAt: string;
  deviceId: number;
  operationId: string;
  principal: string;
  scope: string;
  state: ControlState;
  updatedAt: string;
}

export interface ControlOperationCursor {
  sequence: string;
}

export interface ControlOperationPage {
  items: ControlOperationSummary[];
  nextCursor: ControlOperationCursor | null;
}

export interface ControlOperationSearch {
  audience: 'all' | 'mine';
  authorityId?: string;
  beforeSequence?: string;
  channelId?: number;
  deviceId?: number;
  from?: string;
  limit?: number;
  state?: ControlState;
  unresolvedOnly?: boolean;
  until?: string;
}

export function listControlOperations(params: ControlOperationSearch) {
  return requestClient.get<ControlOperationPage>('/control/operations', {
    params,
  });
}

export function getControlCapabilities() {
  return requestClient.get<ControlCapabilities>('/control/capabilities');
}

export function getControlOperation(id: string) {
  return requestClient.get<ControlDetails>(
    `/control/operations/${encodeURIComponent(id)}`,
  );
}

export function reconcileControl(
  id: string,
  expectedFingerprint: string,
  reason: string,
  evidence: unknown,
) {
  return requestClient.post<ControlOperation>(
    `/control/operations/${encodeURIComponent(id)}/reconcile`,
    { expectedFingerprint, reason, evidence },
  );
}

export function isControlPending(state: ControlState) {
  return [
    'awaitingTermination',
    'dispatching',
    'registered',
    'releasePending',
    'selected',
  ].includes(state);
}

export interface ControlServiceStatus {
  activeOperations: number;
  available: boolean;
  fault: null | string;
  maximumActiveOperations: number;
}

export interface ControlAuthority {
  authorityId: string;
  createdAt: string;
  label: string;
  revision: string;
  state: 'unverified' | 'verified';
  updatedAt: string;
}

export interface ControlRoute {
  authorityId: string;
  authorityRevision: null | string;
  channelId: number;
  configurationFingerprint: string;
  deviceId: number;
  revision: string;
  routeSnapshot: unknown;
  state: 'unverified' | 'verified';
  updatedAt: string;
  verificationEvidence: unknown;
  verifiedAt: null | string;
  verifiedBy: null | string;
}

export function getControlServiceStatus() {
  return requestClient.get<ControlServiceStatus>('/control/status');
}

export function getControlRoute(deviceId: number | string) {
  return requestClient.get<ControlRoute | null>(`/control/routes/${deviceId}`);
}

export function getControlAuthority(id: string) {
  return requestClient.get<ControlAuthority>(
    `/control/authorities/${encodeURIComponent(id)}`,
  );
}

export function createControlAuthority(authorityId: string, label: string) {
  return requestClient.post<ControlAuthority>('/control/authorities', {
    authorityId,
    label,
  });
}

export function verifyControlAuthority(
  authority: ControlAuthority,
  reason: string,
  evidence: unknown,
) {
  return requestClient.post<ControlAuthority>(
    `/control/authorities/${encodeURIComponent(authority.authorityId)}/verify`,
    {
      expectedRevision: authority.revision,
      reason,
      evidence,
    },
  );
}

export function proposeControlRoute(
  deviceId: number | string,
  data: {
    authorityId: string;
    channelId: number;
    expectedRevision: null | string;
    reason: string;
    routeSnapshot: unknown;
  },
) {
  return requestClient.put<ControlRoute>(`/control/routes/${deviceId}`, data);
}

export function verifyControlRoute(
  route: ControlRoute,
  reason: string,
  evidence: unknown,
) {
  return requestClient.post<ControlRoute>(
    `/control/routes/${route.deviceId}/verify`,
    {
      expectedRevision: route.revision,
      reason,
      evidence,
    },
  );
}

export function invalidateControlAuthority(
  authority: ControlAuthority,
  reason: string,
  evidence: unknown,
) {
  return requestClient.post<ControlAuthority>(
    `/control/authorities/${encodeURIComponent(authority.authorityId)}/invalidate`,
    {
      expectedRevision: authority.revision,
      reason,
      evidence,
    },
  );
}

export function findControlOperation(idempotencyKey: string) {
  return requestClient.get<ControlDetails | null>(
    '/control/operations/by-key',
    { params: { idempotencyKey } },
  );
}
