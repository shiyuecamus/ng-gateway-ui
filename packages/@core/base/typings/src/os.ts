export const OsType = {
  Windows: 0,
  Linux: 1,
  MacOS: 2,
  Unknown: 3,
} as const;

export const OsArch = {
  x86: 0,
  arm64: 1,
  arm: 2,
  Unknown: 3,
} as const;

// Driver source type
export const DriverSource = {
  BuiltIn: 0,
  Custom: 1,
} as const;

// Plugin source type
export const PluginSource = {
  BuiltIn: 0,
  Custom: 1,
} as const;
