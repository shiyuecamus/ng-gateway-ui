import { DriverSource, OsArch, OsType } from '@vben-core/typings';

export type TagOption = { color: string; label: string; value: number };

export function osTypeColor(
  value?: (typeof OsType)[keyof typeof OsType],
): string {
  // 0 windows(blue), 1 linux(volcano), 2 macos(orange), 3 unknown(error)
  switch (value) {
    case OsType.Linux: {
      return 'volcano';
    }
    case OsType.MacOS: {
      return 'orange';
    }
    case OsType.Unknown: {
      return 'error';
    }
    case OsType.Windows: {
      return 'blue';
    }
  }
  return 'error';
}

export function osArchColor(
  value?: (typeof OsArch)[keyof typeof OsArch],
): string {
  // 0 x86(purple), 1 arm64(lime), 2 arm(gold), 3 unknown(error)
  switch (value) {
    case OsArch.arm: {
      return 'gold';
    }
    case OsArch.arm64: {
      return 'lime';
    }
    case OsArch.x86: {
      return 'purple';
    }
    default: {
      return 'error';
    }
  }
}

export function sourceColor(
  value?: (typeof DriverSource)[keyof typeof DriverSource],
): string {
  // 0 built-in(volcano), 1 custom(cyan), default error
  switch (value) {
    case DriverSource.BuiltIn: {
      return 'volcano';
    }
    case DriverSource.Custom: {
      return 'cyan';
    }
    default: {
      return 'error';
    }
  }
}
