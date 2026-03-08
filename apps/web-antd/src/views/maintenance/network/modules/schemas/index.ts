import type { InterfaceKind, LinkState, WifiSecurity } from '@vben/types';

export type NetworkTabKey = 'ap' | 'overview' | 'wifi' | 'wired';

export function linkStateColor(state: LinkState): string {
  switch (state) {
    case 'up': {
      return '#52c41a';
    }
    case 'down': {
      return '#ff4d4f';
    }
    case 'dormant': {
      return '#faad14';
    }
    default: {
      return '#d9d9d9';
    }
  }
}

export function interfaceKindIcon(kind: InterfaceKind): string {
  switch (kind) {
    case 'ethernet': {
      return 'mdi:ethernet';
    }
    case 'wifi': {
      return 'mdi:wifi';
    }
    case 'bridge': {
      return 'mdi:bridge';
    }
    case 'loopback': {
      return 'mdi:reload';
    }
    default: {
      return 'mdi:network';
    }
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${units[i]}`;
}

export function prefixToSubnetMask(prefix: number | null | undefined): string {
  if (prefix == null || prefix < 0 || prefix > 32) return '—';
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.');
}

export function signalQualityLevel(
  quality: number | null | undefined,
): 'excellent' | 'fair' | 'good' | 'none' | 'weak' {
  if (quality == null) return 'none';
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

export function securityShortLabel(sec: WifiSecurity | string): string {
  return SECURITY_SHORT_LABELS[sec] ?? sec;
}
