import type { GooseSourceRequest } from '#/api/core/engineering';

import { describe, expect, it } from 'vitest';

import { describeFailure, validNamespaceBasis } from './engineering-evidence';

const digest = (value: string) => value.repeat(64);
type Selection = {
  data: string[];
  services: [
    GooseSourceRequest['namespaces']['services'][number],
    ...GooseSourceRequest['namespaces']['services'],
  ];
};
const basis = (): Selection => ({
  data: [digest('1'), digest('2')],
  services: [
    {
      service: digest('3'),
      applicability: digest('4'),
      data: digest('1'),
      primitives: ['octet6'],
    },
  ],
});

describe('explicit namespace original selection', () => {
  it('accepts explicit absence, complete pins and shared applicability originals', () => {
    expect(validNamespaceBasis({ data: [], services: [] }, [])).toBe(true);
    const selected = basis();
    selected.services.push({
      service: digest('5'),
      applicability: digest('4'),
      data: digest('2'),
      primitives: ['octet16'],
    });
    expect(validNamespaceBasis(selected, [digest('a'), digest('b')])).toBe(
      true,
    );
  });

  it('rejects absent bindings, malformed digests, role substitution and duplicates', () => {
    const changes: ((value: Selection) => void)[] = [
      (value) => {
        value.data.push(digest('1'));
      },
      (value) => {
        value.data[0] = digest('A');
      },
      (value) => {
        value.data[0] = ` ${digest('1')}`;
      },
      (value) => {
        value.services[0].data = digest('5');
      },
      (value) => {
        value.services[0].service = digest('1');
      },
      (value) => {
        value.services[0].applicability = digest('1');
      },
      (value) => {
        value.services[0].applicability = digest('3');
      },
      (value) => {
        value.services[0].primitives = ['octet6', 'octet6'];
      },
      (value) => {
        value.services.push({
          service: digest('4'),
          applicability: digest('5'),
          data: digest('1'),
          primitives: [],
        });
      },
      (value) => {
        value.services.push({
          service: digest('5'),
          applicability: digest('3'),
          data: digest('1'),
          primitives: [],
        });
      },
      (value) => {
        value.services.push({ ...value.services[0] });
      },
    ];
    for (const change of changes) {
      const selected = basis();
      change(selected);
      expect(validNamespaceBasis(selected, [])).toBe(false);
    }
    for (const source of [digest('1'), digest('3'), digest('4')])
      expect(validNamespaceBasis(basis(), [source])).toBe(false);
  });

  it('enforces a complete original count before selection work', () => {
    const data = Array.from({ length: 64 }, (_, index) =>
      index.toString(16).padStart(64, '0'),
    );
    expect(validNamespaceBasis({ data, services: [] }, [])).toBe(true);
    data.push('f'.repeat(64));
    expect(validNamespaceBasis({ data, services: [] }, [])).toBe(false);
  });
});

/** Real structured API diagnostics must survive instead of becoming a generic failure. */
it('preserves server diagnostics and keeps unsupported failures explicit', () => {
  expect(
    describeFailure(
      { message: 'Imported definition may not be redefined' },
      'fallback',
    ),
  ).toBe('Imported definition may not be redefined');
  expect(describeFailure(new Error('source role differs'), 'fallback')).toBe(
    'source role differs',
  );
  for (const cause of [
    null,
    undefined,
    { message: '' },
    { message: 7 },
    'unexpected',
  ]) {
    expect(describeFailure(cause, 'fallback')).toBe('fallback');
  }
});
