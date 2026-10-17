import { DataType } from '@vben/types';

/** Validate the exact JSON control representation without ever passing through Number. */
export function isCanonicalWideInteger(
  value: unknown,
  dataType: number,
): boolean {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^(?:0|-?[1-9]\d*)$/.test(value)
  ) {
    return false;
  }
  const integer = BigInt(value);
  switch (dataType) {
    case DataType.Int64: {
      return integer >= -(1n << 63n) && integer < 1n << 63n;
    }
    case DataType.Int128: {
      return integer >= -(1n << 127n) && integer < 1n << 127n;
    }
    case DataType.UInt64: {
      return integer >= 0n && integer < 1n << 64n;
    }
    default: {
      return false;
    }
  }
}
