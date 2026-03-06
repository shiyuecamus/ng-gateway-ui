<script lang="ts" setup>
import type {
  NetworkInterfaceSummary,
  WifiAccessPoint,
  WifiConnectRequest,
  WifiStaStatus,
} from '@vben/types';

import { computed, onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  List,
  message,
  Space,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  connectWifi,
  disconnectWifi,
  fetchNetworkInterfaces,
  fetchWifiStatus,
  scanWifi,
} from '#/api/core';

import { prefixToSubnetMask, signalQualityLevel } from '../schemas';
import WifiConnectModal from './wifi-connect-modal.vue';

defineProps<{
  readOnly: boolean;
}>();

const { handleRequest } = useRequestHandler();

const scanning = ref(false);
const accessPoints = ref<WifiAccessPoint[]>([]);
const wifiStatus = ref<WifiStaStatus | null>(null);
const bestWifiIface = ref<NetworkInterfaceSummary | null>(null);

const connectModalOpen = ref(false);
const selectedAp = ref<WifiAccessPoint | null>(null);
const connecting = ref(false);
const disconnecting = ref(false);

async function loadWifiInterface() {
  await handleRequest(
    () => fetchNetworkInterfaces(),
    (data) => {
      const wifiIfaces = data.filter((i: NetworkInterfaceSummary) => i.kind === 'wifi');
      bestWifiIface.value =
        wifiIfaces.find((i: NetworkInterfaceSummary) => i.linkState === 'up') ?? wifiIfaces[0] ?? null;
    },
  );
}

async function doScan() {
  scanning.value = true;
  await handleRequest(
    () => scanWifi(),
    (data) => { accessPoints.value = data; },
  );
  scanning.value = false;
}

async function loadStatus() {
  await handleRequest(
    () => fetchWifiStatus(),
    (data) => { wifiStatus.value = data; },
  );
}

function openConnect(ap: WifiAccessPoint) {
  selectedAp.value = ap;
  connectModalOpen.value = true;
}

function openConnectHidden() {
  selectedAp.value = null;
  connectModalOpen.value = true;
}

async function doConnect(request: WifiConnectRequest) {
  connecting.value = true;
  await handleRequest(
    () => connectWifi(request),
    (data) => {
      wifiStatus.value = data;
      connectModalOpen.value = false;
      message.success($t('page.maintenance.network.wifiConfig.connectSuccess'));
    },
  );
  connecting.value = false;
  await doScan();
}

async function doDisconnect() {
  disconnecting.value = true;
  await handleRequest(
    () => disconnectWifi(),
    () => {
      wifiStatus.value = null;
      message.success($t('page.maintenance.network.wifiConfig.disconnectSuccess'));
    },
  );
  disconnecting.value = false;
  await doScan();
}

function signalIcon(quality: number): string {
  const level = signalQualityLevel(quality);
  switch (level) {
    case 'excellent': return 'mdi:wifi-strength-4';
    case 'good': return 'mdi:wifi-strength-3';
    case 'fair': return 'mdi:wifi-strength-2';
    case 'weak': return 'mdi:wifi-strength-1';
    default: return 'mdi:wifi-strength-outline';
  }
}

function securityShortLabel(sec: string): string {
  const map: Record<string, string> = {
    OPEN: '',
    WPA_PSK: 'WPA',
    WPA2_PSK: 'WPA2',
    WPA3_SAE: 'WPA3',
    WEP: 'WEP',
    WPA_ENTERPRISE: 'WPA-E',
    WPA2_ENTERPRISE: 'WPA2-E',
  };
  return map[sec] ?? sec;
}

onMounted(async () => {
  await Promise.all([loadWifiInterface(), doScan(), loadStatus()]);
});
</script>

<template>
  <div>
    <!-- Wi-Fi interface status preview -->
    <Card v-if="bestWifiIface" size="small" class="mb-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <IconifyIcon icon="mdi:wifi" class="text-primary size-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold">{{ bestWifiIface.displayName || bestWifiIface.name }}</span>
            <Tag
              :color="bestWifiIface.linkState === 'up' ? 'success' : 'default'"
              size="small"
              class="!m-0"
            >
              {{ bestWifiIface.linkState === 'up'
                ? $t('page.maintenance.network.linkUp')
                : $t('page.maintenance.network.linkDown') }}
            </Tag>
            <Tag v-if="bestWifiIface.connectedSsid" color="blue" size="small" class="!m-0">
              {{ bestWifiIface.connectedSsid }}
            </Tag>
          </div>
          <div v-if="bestWifiIface.macAddress" class="text-xs text-gray-400">
            {{ bestWifiIface.macAddress }}
          </div>
        </div>
        <div class="ml-auto">
          <Button
            v-if="wifiStatus?.connected && !props.readOnly"
            danger
            size="small"
            :loading="disconnecting"
            @click="doDisconnect"
          >
            {{ $t('page.maintenance.network.wifiConfig.disconnect') }}
          </Button>
        </div>
      </div>

      <!-- Connected state: show detailed info -->
      <Descriptions
        v-if="wifiStatus?.connected"
        size="small"
        :column="{ xs: 1, sm: 2 }"
        bordered
      >
        <Descriptions.Item label="SSID">
          <Tag color="blue" size="small" class="!m-0">{{ wifiStatus.ssid }}</Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wifiConfig.signal')">
          {{ wifiStatus.signalQuality }}%
          <span v-if="wifiStatus.signalDbm != null" class="ml-1 text-xs text-gray-400">
            ({{ wifiStatus.signalDbm }} dBm)
          </span>
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wifiConfig.ip')">
          {{ wifiStatus.ipAddress ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.subnetMask')">
          {{ prefixToSubnetMask(bestWifiIface?.ipv4?.addresses?.[0]?.prefixLength) }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wifiConfig.gateway')">
          {{ wifiStatus.gateway ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
          <Tag size="small" class="!m-0">
            {{ bestWifiIface?.ipv4?.method === 'static'
              ? $t('page.maintenance.network.static')
              : $t('page.maintenance.network.dhcp') }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wifiConfig.security')">
          {{ wifiStatus.security ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wifiConfig.band')">
          {{ wifiStatus.band ?? '—' }}
          <span v-if="wifiStatus.channel" class="ml-1 text-xs text-gray-400">
            Ch {{ wifiStatus.channel }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item v-if="wifiStatus.dns?.length" :label="$t('page.maintenance.network.wifiConfig.dns')" :span="2">
          {{ wifiStatus.dns.join(', ') }}
        </Descriptions.Item>
      </Descriptions>

      <!-- Not connected: show basic interface info -->
      <Descriptions
        v-else
        size="small"
        :column="{ xs: 1, sm: 2 }"
        bordered
      >
        <Descriptions.Item :label="$t('page.maintenance.network.ipAddress')">
          {{ bestWifiIface.ipv4?.addresses?.[0]?.address ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.subnetMask')">
          {{ prefixToSubnetMask(bestWifiIface.ipv4?.addresses?.[0]?.prefixLength) }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.gateway')">
          {{ bestWifiIface.ipv4?.gateway ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
          <Tag size="small" class="!m-0">
            {{ bestWifiIface.ipv4?.method === 'static'
              ? $t('page.maintenance.network.static')
              : $t('page.maintenance.network.dhcp') }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item
          v-if="bestWifiIface.ipv4?.dns?.length"
          :label="$t('page.maintenance.network.dnsServers')"
          :span="2"
        >
          {{ bestWifiIface.ipv4.dns.join(', ') }}
        </Descriptions.Item>
      </Descriptions>
    </Card>

    <!-- Scan section -->
    <Divider orientation="left" class="!my-3 !text-xs">
      {{ $t('page.maintenance.network.wifiConfig.scanTitle') }}
    </Divider>

    <div class="mb-3 flex items-center justify-end">
      <Space>
        <Button v-if="!readOnly" size="small" @click="openConnectHidden">
          {{ $t('page.maintenance.network.wifiConfig.connectToHidden') }}
        </Button>
        <Button type="primary" ghost size="small" :loading="scanning" @click="doScan">
          {{ scanning
            ? $t('page.maintenance.network.wifiConfig.scanning')
            : $t('page.maintenance.network.wifiConfig.scan') }}
        </Button>
      </Space>
    </div>

    <Spin :spinning="scanning">
      <Empty
        v-if="accessPoints.length === 0 && !scanning"
        :description="$t('page.maintenance.network.wifiConfig.noNetworks')"
      />

      <List v-else size="small" :data-source="accessPoints">
        <template #renderItem="{ item }">
          <List.Item class="!px-3">
            <div class="flex w-full items-center gap-3">
              <IconifyIcon
                :icon="signalIcon(item.signalQuality)"
                :class="item.isConnected ? 'text-green-500' : 'text-gray-400'"
                class="size-5 shrink-0"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium">{{ item.ssid }}</span>
                  <Tag v-if="item.isConnected" color="success" size="small" class="!m-0">
                    {{ $t('page.maintenance.network.wifiConfig.connected') }}
                  </Tag>
                </div>
                <div class="text-xs text-gray-400">
                  <span v-if="securityShortLabel(item.security)">
                    {{ securityShortLabel(item.security) }}
                  </span>
                  <span class="mx-1">·</span>
                  {{ item.band }}
                  <span class="mx-1">·</span>
                  Ch {{ item.channel }}
                  <span class="mx-1">·</span>
                  {{ item.signalQuality }}%
                </div>
              </div>

              <Button
                v-if="!readOnly && !item.isConnected"
                size="small"
                @click="openConnect(item)"
              >
                {{ $t('page.maintenance.network.wifiConfig.connect') }}
              </Button>
            </div>
          </List.Item>
        </template>
      </List>
    </Spin>

    <WifiConnectModal
      :open="connectModalOpen"
      :ap="selectedAp"
      :connecting="connecting"
      @cancel="connectModalOpen = false"
      @connect="doConnect"
    />
  </div>
</template>
