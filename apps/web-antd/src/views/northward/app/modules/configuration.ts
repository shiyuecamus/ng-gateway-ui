import type { AppInfo } from '@vben/types';

import { isEqual } from '@vben-core/shared/utils';

/** A failed HTTP write can still have persisted the exact submitted revision. */
export type AppFormResult =
  | { configuration: AppInfo; kind: 'persisted-failed' }
  | { kind: 'applied' }
  | { kind: 'unconfirmed' };

type AppDraft = Partial<Pick<AppInfo, 'queuePolicy'>> &
  Pick<
    AppInfo,
    | 'config'
    | 'description'
    | 'expectedRevision'
    | 'id'
    | 'name'
    | 'retryPolicy'
  >;
type AppRevision = Omit<AppDraft, 'expectedRevision'> &
  Pick<
    AppInfo,
    'appliedRevision' | 'configurationState' | 'desiredRevision' | 'id'
  >;

/** Match the failed next target by wire content; this does not identify its author. */
export function matchesFailedAppRevision(
  draft: AppDraft,
  current: AppRevision,
): boolean {
  const revision = draft.expectedRevision;
  if (
    draft.id !== current.id ||
    current.configurationState !== 'failed' ||
    !revision ||
    !/^[1-9]\d{0,18}$/.test(revision) ||
    !/^[1-9]\d{0,18}$/.test(current.desiredRevision) ||
    BigInt(current.desiredRevision) !== BigInt(revision) + 1n ||
    current.appliedRevision === current.desiredRevision
  )
    return false;

  // Compare the JSON sent over HTTP, including explicit false/zero/null values.
  const encoded = JSON.stringify({
    name: draft.name,
    config: draft.config,
    retryPolicy: {
      ...draft.retryPolicy,
      // Rust serializes omitted nullable retry budgets as None/null.
      maxAttempts: draft.retryPolicy.maxAttempts ?? null,
      maxElapsedTimeMs: draft.retryPolicy.maxElapsedTimeMs ?? null,
    },
    ...(draft.queuePolicy === undefined
      ? {}
      : { queuePolicy: draft.queuePolicy }),
    ...(draft.description === undefined
      ? {}
      : { description: draft.description }),
  });
  const wire: Record<string, unknown> = JSON.parse(encoded);
  return Object.entries(wire).every(([key, value]) =>
    isEqual(current[key as keyof AppRevision], value),
  );
}
