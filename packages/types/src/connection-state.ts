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
  | 'Connected'
  | 'Connecting'
  | 'Disconnected'
  | 'Failed'
  | 'Initializing'
  | 'Reconnecting';

/**
 * Failure phase classification (where the failure happened).
 */
export type FailurePhase = 'Connect' | 'Init' | 'Run';

/**
 * Failure kind classification (how the supervisor should treat it).
 */
export type FailureKind = 'Fatal' | 'Retryable' | 'ShutdownIncomplete' | 'Stop';

export interface FailureReport {
  phase: FailurePhase;
  kind: FailureKind;
  summary: string;
  code: null | string;
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
  remaining_hint: null | number;
}

export interface ConnectionState {
  phase: ConnectionPhase;
  attempt: number;
  emitted_at_unix_ms: number;
  phase_entered_at_unix_ms: number;
  backoff: Duration | null;
  last_failure: FailureReport | null;
  budget: RetryBudgetSnapshot;
}
