/**
 * Unified connection state DTO (southward + northward).
 *
 * This is designed to mirror `ng_gateway_sdk::ConnectionState` so the UI can render
 * diagnostics (phase/attempt/backoff/failure/budget) with strong typing.
 */

/**
 * Connection lifecycle phase.
 */
export type ConnectionPhase =
  | 'Disconnected'
  | 'Connecting'
  | 'Initializing'
  | 'Connected'
  | 'Reconnecting'
  | 'Failed';

/**
 * Failure phase classification (where the failure happened).
 */
export type FailurePhase = 'Connect' | 'Init' | 'Run';

/**
 * Failure kind classification (how the supervisor should treat it).
 */
export type FailureKind = 'Retryable' | 'Fatal' | 'Stop';

export interface FailureReport {
  phase: FailurePhase;
  kind: FailureKind;
  summary: string;
  code?: null | string;
}

/**
 * Rust `Duration` serialized by Serde (default JSON representation).
 */
export interface Duration {
  secs: number;
  nanos: number;
}

export interface RetryBudgetSnapshot {
  exhausted: boolean;
  remainingHint?: null | number;
}

export interface ConnectionState {
  phase: ConnectionPhase;
  attempt: number;
  emittedAtUnixMs: number;
  phaseEnteredAtUnixMs: number;
  backoff?: null | Duration;
  lastFailure?: null | FailureReport;
  budget: RetryBudgetSnapshot;
}

