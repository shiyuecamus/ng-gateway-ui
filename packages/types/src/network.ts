// ─────────────────── Enums ───────────────────

export type InterfaceKind =
  | 'bridge'
  | 'ethernet'
  | 'loopback'
  | 'unknown'
  | 'virtual'
  | 'vlan'
  | 'wifi';

export type IpMethod = 'dhcp' | 'disabled' | 'static';

export type LinkState = 'dormant' | 'down' | 'unknown' | 'up';

export type WifiSecurity =
  | 'OPEN'
  | 'UNKNOWN'
  | 'WEP'
  | 'WPA2_ENTERPRISE'
  | 'WPA2_PSK'
  | 'WPA3_SAE'
  | 'WPA_ENTERPRISE'
  | 'WPA_PSK';

export type WifiBand = '2.4ghz' | '5ghz' | '6ghz' | 'unknown';

export type WifiMode = 'ad_hoc' | 'ap' | 'station' | 'unknown';

export type StaApCapability =
  | 'dual_card'
  | 'not_supported'
  | 'single_card_concurrent'
  | 'unknown';

export type ApMode = 'concurrent' | 'dedicated_card' | 'exclusive' | 'unavailable';

export type PlatformSupport = 'full' | 'read_only' | 'unavailable';

// ─────────────────── Responses ───────────────────

export interface Ipv4AddressInfo {
  address: string;
  prefixLength: number;
}

export interface Ipv4Config {
  addresses: Ipv4AddressInfo[];
  dns: string[];
  gateway?: null | string;
  method: IpMethod;
}

export interface Ipv6AddressInfo {
  address: string;
  prefixLength: number;
}

export interface Ipv6Config {
  addresses: Ipv6AddressInfo[];
  dns: string[];
  gateway?: null | string;
  method: IpMethod;
}

export interface NetworkInterfaceSummary {
  name: string;
  displayName?: null | string;
  kind: InterfaceKind;
  linkState: LinkState;
  macAddress?: null | string;
  ipv4?: Ipv4Config | null;
  ipv6?: Ipv6Config | null;
  wifiMode?: null | WifiMode;
  connectedSsid?: null | string;
  apSsid?: null | string;
  signalDbm?: null | number;
  signalQuality?: null | number;
  speedMbps?: null | number;
  rxBytes?: null | number;
  txBytes?: null | number;
}

export interface NetworkInterfaceDetail extends NetworkInterfaceSummary {
  nmConnectionUuid?: null | string;
  mtu?: null | number;
  driver?: null | string;
  firmwareVersion?: null | string;
  rxPackets?: null | number;
  txPackets?: null | number;
  rxErrors?: null | number;
  txErrors?: null | number;
}

export interface WifiAccessPoint {
  ssid: string;
  bssid: string;
  security: WifiSecurity;
  band: WifiBand;
  channel: number;
  frequency: number;
  signalDbm: number;
  signalQuality: number;
  maxBitrateKbps?: null | number;
  isConnected: boolean;
}

export interface WifiStaStatus {
  connected: boolean;
  interfaceName?: null | string;
  ssid?: null | string;
  bssid?: null | string;
  security?: null | WifiSecurity;
  band?: null | WifiBand;
  channel?: null | number;
  frequency?: null | number;
  signalDbm?: null | number;
  signalQuality?: null | number;
  ipAddress?: null | string;
  gateway?: null | string;
  dns: string[];
  speedMbps?: null | number;
  connectedSecs?: null | number;
}

export interface WifiConnectPreflight {
  ssid: string;
  apWillStop: boolean;
  connectionWillBeLost: boolean;
  apCanRestore: boolean;
  warnings: string[];
}

export interface ApStatus {
  active: boolean;
  interfaceName?: null | string;
  ssid?: null | string;
  band?: null | WifiBand;
  channel?: null | number;
  frequency?: null | number;
  security?: null | WifiSecurity;
  connectedClients?: null | number;
  ipAddress?: null | string;
  prefixLength?: null | number;
  apMode: ApMode;
  staWillDisconnect: boolean;
  staRestoreFailed?: boolean;
}

export interface DnsConfig {
  servers: string[];
  searchDomains: string[];
  mode: IpMethod;
}

export interface WirelessInterfaceCapability {
  name: string;
  phy: string;
  supportedModes: string[];
  supportsStaApConcurrent: boolean;
  supportedBands: WifiBand[];
  currentMode?: null | WifiMode;
}

export interface NetworkCapabilities {
  platform: PlatformSupport;
  os: string;
  arch: string;
  networkManagerAvailable: boolean;
  networkManagerVersion?: null | string;
  canConfigureInterfaces: boolean;
  canScanWifi: boolean;
  canConnectWifi: boolean;
  canManageAp: boolean;
  apMode: ApMode;
  staApCapability: StaApCapability;
  wirelessInterfaces: WirelessInterfaceCapability[];
}

// ─────────────────── Aggregated Status ───────────────────

export interface WiredStatus {
  available: boolean;
  interface: NetworkInterfaceSummary | null;
  allInterfaces: NetworkInterfaceSummary[];
}

// ─────────────────── Requests ───────────────────

export interface ConfigureInterfaceRequest {
  method: IpMethod;
  ipAddress?: null | string;
  prefixLength?: null | number;
  gateway?: null | string;
  dns?: null | string[];
}

export interface WifiConnectRequest {
  ssid: string;
  password?: null | string;
  bssid?: null | string;
  hidden?: boolean;
  interfaceName?: null | string;
}

export interface ConfigureApRequest {
  ssid?: null | string;
  password?: null | string;
  channel?: null | number;
  restart?: boolean;
}

export interface ConfigureDnsRequest {
  servers: string[];
  searchDomains?: null | string[];
}
