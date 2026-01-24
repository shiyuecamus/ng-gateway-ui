export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export interface FormatBytesOptions {
  /**
   * Label to use for 0 / non-finite.
   * - default: '-'
   */
  zero?: string;
  /**
   * Whether to include a space between value and unit.
   * - default: true
   */
  space?: boolean;
  /**
   * Whether to preserve sign for negative values.
   * - default: true
   */
  sign?: boolean;
}

/**
 * Human readable bytes formatter (binary/IEC-ish, base 1024).
 *
 * Examples:
 * - 0 -> '-' (by default)
 * - 1536 -> '1.50 KB'
 * - 1048576 -> '1.00 MB'
 */
export function formatBytesHuman(
  bytes?: null | number,
  options?: FormatBytesOptions,
): string {
  const zero = options?.zero ?? '-';
  const space = options?.space ?? true;
  const keepSign = options?.sign ?? true;

  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n === 0) return zero;

  const abs = Math.abs(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = abs;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }

  let decimals = 2;
  if (u === 0) decimals = 0;
  else if (v >= 100) decimals = 0;
  else if (v >= 10) decimals = 1;

  const sign = keepSign && n < 0 ? '-' : '';
  const join = space ? ' ' : '';
  return `${sign}${v.toFixed(decimals)}${join}${units[u]}`;
}

export function formatRate(bytesPerSec?: null | number): string {
  const v = Number(bytesPerSec ?? 0);
  if (!Number.isFinite(v) || v === 0) return '-';
  return `${formatBytesHuman(v)}/s`;
}

export function formatMs(ms?: null | number): string {
  const v = Number(ms ?? 0);
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v < 1000) {
    let decimals = 0;
    if (v < 10) decimals = 2;
    else if (v < 100) decimals = 1;
    return `${v.toFixed(decimals)} ms`;
  }
  const s = v / 1000;
  if (s < 60) {
    const decimals = s < 10 ? 2 : 1;
    return `${s.toFixed(decimals)} s`;
  }
  const m = s / 60;
  return `${m.toFixed(1)} min`;
}

/**
 * Best-effort conversion for chrono::Duration serialized over JSON.
 *
 * chrono serde formats can vary across feature flags; we accept multiple shapes:
 * - number (seconds / milliseconds / nanoseconds - heuristics)
 * - tuple [secs, nanos]
 * - { secs, nanos } like std::time::Duration-ish objects (best-effort)
 */
export function parseChronoDurationToMs(input: unknown): number {
  if (Array.isArray(input) && input.length >= 2) {
    const secs = Number(input[0]);
    const nanos = Number(input[1]);
    if (Number.isFinite(secs) || Number.isFinite(nanos)) {
      return secs * 1000 + nanos / 1e6;
    }
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const n = input;
    const abs = Math.abs(n);
    // Heuristics:
    // - >= 1e12: likely nanos
    // - >= 1e9: likely micros/nanos (treat as nanos)
    // - >= 1e6: likely millis
    // - else: seconds
    if (abs >= 1e12) return n / 1e6;
    if (abs >= 1e9) return n / 1e6;
    if (abs >= 1e6) return n;
    return n * 1000;
  }
  if (input && typeof input === 'object') {
    const anyObj = input as Record<string, unknown>;
    const secs = Number(anyObj.secs ?? anyObj.seconds ?? 0);
    const nanos = Number(anyObj.nanos ?? anyObj.nanoseconds ?? 0);
    if (Number.isFinite(secs) || Number.isFinite(nanos)) {
      return secs * 1000 + nanos / 1e6;
    }
  }
  return 0;
}
