import { beforeEach, describe, expect, it } from 'vitest';

import {
  listControlIntents,
  loadControlIntent,
  prepareControlIntent,
  resetControlIntent,
} from './intent';

describe('control intent ownership', () => {
  beforeEach(() => sessionStorage.clear());

  it('freezes the request and revision when acknowledgement is lost and the form is reconstructed', () => {
    const first = prepareControlIntent('user:1', 'action:42', {
      params: { value: true },
      expectedConfigurationRevision: '7',
    });
    const retry = prepareControlIntent('user:1', 'action:42', {
      params: { value: false },
      expectedConfigurationRevision: '8',
    });
    expect(retry).toEqual(first);
    expect(first.idempotencyKey).toMatch(/^[\da-f]{32}$/);
  });

  it('keeps different authenticated users independent even with the same target', () => {
    const first = prepareControlIntent('user:1', 'action:42', { value: true });
    const second = prepareControlIntent('user:2', 'action:42', {
      value: false,
    });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.request.value).toBe(false);
  });

  it('requires explicit replacement and keeps other target intents intact', () => {
    const first = prepareControlIntent('user:1', 'action:42', { value: true });
    const other = prepareControlIntent('user:1', 'action:43', { value: true });
    resetControlIntent('user:1', 'action:42');
    expect(
      prepareControlIntent('user:1', 'action:42', { value: false })
        .idempotencyKey,
    ).not.toBe(first.idempotencyKey);
    expect(
      prepareControlIntent('user:1', 'action:43', { value: false }),
    ).toEqual(other);
  });

  it('recovers a removed or offline target without constructing a replacement request', () => {
    const original = prepareControlIntent('user:1', 'action:removed', {
      value: '9007199254740993',
    });
    prepareControlIntent('user:2', 'action:removed', { value: false });
    const before = sessionStorage.length;
    expect(listControlIntents('user:1')).toEqual([
      { ...original, target: 'action:removed' },
    ]);
    expect(loadControlIntent('user:1', 'action:missing')).toBeUndefined();
    expect(sessionStorage.length).toBe(before);
    expect(listControlIntents('')).toEqual([]);
  });
});
