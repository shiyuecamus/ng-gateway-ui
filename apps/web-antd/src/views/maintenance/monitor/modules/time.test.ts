import type { MonitorRow } from '@vben/types';

import { describe, expect, it, vi } from 'vitest';

import { sampleTimeText, sourceTimeText } from './time';

vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/utils', () => ({
  formatDateTime: (time: string) => `formatted:${time}`,
}));

describe('monitor time provenance', () => {
  it('does not render missing reception as the current system time', () => {
    for (const value of [undefined, null, ''])
      expect(sampleTimeText(value)).toBe('—');
    expect(sampleTimeText('2026-10-15T00:00:00Z')).toBe(
      'formatted:2026-10-15T00:00:00Z',
    );
  });

  it('keeps an absent source timestamp distinct from the reception clock', () => {
    const row: MonitorRow = {
      id: '1',
      deviceId: 1,
      deviceName: 'device',
      key: 'value',
      value: 7,
      sourceType: 'telemetry',
      sourceTime: null,
      sourceTimeStatus: 'notProvided',
      receivedTime: '2026-10-15T00:00:00Z',
    };
    expect(sourceTimeText(row)).toBe(
      'page.monitor.realtime.sourceTimeStatus.notProvided',
    );
    for (const status of [
      'notBound',
      'partial',
      'uninterpreted',
      'invalid',
    ] as const) {
      expect(sourceTimeText({ ...row, sourceTimeStatus: status })).toBe(
        `page.monitor.realtime.sourceTimeStatus.${status}`,
      );
    }
    expect(
      sourceTimeText({
        ...row,
        sourceTime: '2026-10-14T00:00:00Z',
        sourceTimeStatus: 'provided',
      }),
    ).toBe('formatted:2026-10-14T00:00:00Z');
  });
});
