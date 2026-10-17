import { DataType } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { isCanonicalWideInteger } from './wide-integer';

describe('exact wide integer control input', () => {
  it('keeps values beyond Number precision as unchanged JSON strings', () => {
    for (const [kind, value] of [
      [DataType.Int64, '-9223372036854775808'],
      [DataType.Int64, '9223372036854775807'],
      [DataType.UInt64, '18446744073709551615'],
      [DataType.UInt64, '9007199254740993'],
      [DataType.Int128, '-170141183460469231731687303715884105728'],
      [DataType.Int128, '170141183460469231731687303715884105727'],
    ] as const) {
      expect(isCanonicalWideInteger(value, kind)).toBe(true);
      const wire = JSON.stringify({ value });
      expect(JSON.parse(wire).value).toBe(value);
    }
  });

  it('rejects numeric, noncanonical and overflowing representations', () => {
    for (const value of [
      1,
      9_007_199_254_740_992,
      '+1',
      '01',
      '-0',
      '1.0',
      '1e3',
      ' 1',
      '',
    ]) {
      for (const kind of [DataType.Int64, DataType.UInt64, DataType.Int128]) {
        expect(isCanonicalWideInteger(value, kind)).toBe(false);
      }
    }
    expect(isCanonicalWideInteger('9223372036854775808', DataType.Int64)).toBe(
      false,
    );
    expect(isCanonicalWideInteger('-1', DataType.UInt64)).toBe(false);
    expect(
      isCanonicalWideInteger('18446744073709551616', DataType.UInt64),
    ).toBe(false);
    expect(
      isCanonicalWideInteger(
        '170141183460469231731687303715884105728',
        DataType.Int128,
      ),
    ).toBe(false);
  });
});
