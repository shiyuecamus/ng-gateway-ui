import type { InterfaceKind, LinkState, WifiSecurity } from '@vben/types';

export type NetworkTabKey = 'ap' | 'overview' | 'wifi' | 'wired';

export function linkStateColor(state: LinkState): string {
  switch (state) {
    case 'dormant': {
      return '#faad14';
    }
    case 'down': {
      return '#ff4d4f';
    }
    case 'up': {
      return '#52c41a';
    }
    default: {
      return '#d9d9d9';
    }
  }
}

export function interfaceKindIcon(kind: InterfaceKind): string {
  switch (kind) {
    case 'bridge': {
      return 'mdi:bridge';
    }
    case 'ethernet': {
      return 'mdi:ethernet';
    }
    case 'loopback': {
      return 'mdi:reload';
    }
    case 'wifi': {
      return 'mdi:wifi';
    }
    default: {
      return 'mdi:network';
    }
  }
}

export function formatBytes(bytes: null | number | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${units[i]}`;
}

export function prefixToSubnetMask(prefix: null | number | undefined): string {
  if (prefix === null || prefix === undefined || prefix < 0 || prefix > 32)
    return '—';
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return [
    (mask >>> 24) & 255,
    (mask >>> 16) & 255,
    (mask >>> 8) & 255,
    mask & 255,
  ].join('.');
}

export function signalQualityLevel(
  quality: null | number | undefined,
): 'excellent' | 'fair' | 'good' | 'none' | 'weak' {
  if (quality === null || quality === undefined) return 'none';
  if (quality >= 75) return 'excellent';
  if (quality >= 50) return 'good';
  if (quality >= 25) return 'fair';
  return 'weak';
}

const SECURITY_SHORT_LABELS: Record<string, string> = {
  OPEN: '',
  WPA_PSK: 'WPA',
  WPA2_PSK: 'WPA2',
  WPA3_SAE: 'WPA3',
  WEP: 'WEP',
  WPA_ENTERPRISE: 'WPA-E',
  WPA2_ENTERPRISE: 'WPA2-E',
};

export function securityShortLabel(sec: string | WifiSecurity): string {
  return SECURITY_SHORT_LABELS[sec] ?? sec;
}
