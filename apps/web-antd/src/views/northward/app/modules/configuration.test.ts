import { describe, expect, it } from 'vitest';

import { matchesFailedAppRevision } from './configuration';

const policy = {
  capacity: 10,
  dropPolicy: 0 as const,
  blockDuration: 0,
  bufferEnabled: false,
  bufferCapacity: 10,
  bufferExpireMs: 0,
  latestCapacity: 16,
  latestMaxBytes: 131_072,
  deliveryMaxInFlight: 2,
  deliveryMaxPayloadBytes: 16_384,
  deliveryTimeoutMs: 5000,
  deliveryRetryMs: 100,
  replyCapacity: 16,
  replyMaxBytes: 131_072,
  replyMaxInFlight: 2,
};
const draft = {
  id: 7,
  name: 'owned-app',
  expectedRevision: '9007199254740992',
  description: '',
  config: {
    communication: { tls: true, retain: false, timeout: 0, ca: null },
    unused: undefined,
  },
  retryPolicy: {
    maxAttempts: 0,
    initialIntervalMs: 100,
    maxIntervalMs: 1000,
    randomizationFactor: 0,
    multiplier: 2,
    maxElapsedTimeMs: null,
  },
  queuePolicy: policy,
};
const current = () => ({
  ...draft,
  config: { communication: { ca: null, timeout: 0, retain: false, tls: true } },
  desiredRevision: '9007199254740993',
  appliedRevision: '9007199254740991',
  configurationState: 'failed' as const,
});

describe('persisted application revision recovery', () => {
  it('recognizes omitted unlimited retry budgets as the native null defaults without conflating zero retries', () => {
    const native = {
      ...current(),
      retryPolicy: {
        ...draft.retryPolicy,
        maxAttempts: null,
        maxElapsedTimeMs: null,
      },
    };
    expect(
      matchesFailedAppRevision(
        {
          ...draft,
          retryPolicy: {
            ...draft.retryPolicy,
            maxAttempts: undefined,
            maxElapsedTimeMs: undefined,
          },
        },
        native,
      ),
    ).toBe(true);
    expect(matchesFailedAppRevision(draft, native)).toBe(false);
  });

  it('recognizes the exact failed wire target with precise revisions and omitted undefined values', () => {
    expect(matchesFailedAppRevision(draft, current())).toBe(true);
  });

  it('refuses newer writers, different content, different app and non-failed states', () => {
    expect(
      matchesFailedAppRevision(draft, {
        ...current(),
        desiredRevision: '9007199254740994',
      }),
    ).toBe(false);
    expect(
      matchesFailedAppRevision(draft, {
        ...current(),
        config: { communication: { tls: false } },
      }),
    ).toBe(false);
    expect(matchesFailedAppRevision(draft, { ...current(), id: 8 })).toBe(
      false,
    );
    expect(
      matchesFailedAppRevision(draft, {
        ...current(),
        configurationState: 'active',
      }),
    ).toBe(false);
    expect(
      matchesFailedAppRevision(draft, {
        ...current(),
        queuePolicy: { ...policy, latestMaxBytes: 262_144 },
      }),
    ).toBe(false);
  });

  it('preserves explicit values and refuses invalid or already-applied revisions', () => {
    expect(
      matchesFailedAppRevision(draft, { ...current(), description: undefined }),
    ).toBe(false);
    expect(
      matchesFailedAppRevision(
        { ...draft, expectedRevision: '1e3' },
        current(),
      ),
    ).toBe(false);
    expect(
      matchesFailedAppRevision(draft, {
        ...current(),
        appliedRevision: current().desiredRevision,
      }),
    ).toBe(false);
  });
});
