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
  Drawer,
  Empty,
  List,
  message,
  Skeleton,
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

const props = defineProps<{
  readOnly: boolean;
  isMobile: boolean;
}>();

const { handleRequest } = useRequestHandler();

const scanning = ref(false);
const initialLoading = ref(true);
const accessPoints = ref<WifiAccessPoint[]>([]);
const wifiStatus = ref<WifiStaStatus | null>(null);
const bestWifiIface = ref<NetworkInterfaceSummary | null>(null);

const connectModalOpen = ref(false);
const selectedAp = ref<WifiAccessPoint | null>(null);
const connecting = ref(false);
const disconnecting = ref(false);

const connectResult = ref<'idle' | 'success' | 'failed'>('idle');
let connectResultTimer: ReturnType<typeof setTimeout> | undefined;

// Pull-to-refresh state
const pullContainer = ref<HTMLElement | null>(null);
const pullDistance = ref(0);
const isPulling = ref(false);
const pullThreshold = 60;

const descColumn = computed(() => (props.isMobile ? 1 : { xs: 1, sm: 2 }));

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
  connectResult.value = 'idle';
}

function openConnectHidden() {
  selectedAp.value = null;
  connectModalOpen.value = true;
  connectResult.value = 'idle';
}

async function doConnect(request: WifiConnectRequest) {
  connecting.value = true;
  connectResult.value = 'idle';
  clearTimeout(connectResultTimer);

  await handleRequest(
    () => connectWifi(request),
    (data) => {
      wifiStatus.value = data;
      connectResult.value = 'success';
      message.success($t('page.maintenance.network.wifiConfig.connectSuccess'));
      connectResultTimer = setTimeout(() => {
        connectModalOpen.value = false;
        connectResult.value = 'idle';
      }, 1500);
    },
    () => {
      connectResult.value = 'failed';
      message.error($t('page.maintenance.network.wifiConfig.connectFailed'));
      connectResultTimer = setTimeout(() => {
        connectResult.value = 'idle';
      }, 3000);
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

// Pull-to-refresh handlers (mobile only)
let startY = 0;
function onTouchStart(e: TouchEvent) {
  if (!props.isMobile || scanning.value) return;
  const el = pullContainer.value;
  if (el && el.scrollTop === 0) {
    startY = e.touches[0]!.clientY;
    isPulling.value = true;
  }
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value) return;
  const delta = e.touches[0]!.clientY - startY;
  if (delta > 0) {
    pullDistance.value = Math.min(delta * 0.4, pullThreshold * 1.5);
    if (delta > 10) e.preventDefault();
  }
}

async function onTouchEnd() {
  if (!isPulling.value) return;
  isPulling.value = false;
  if (pullDistance.value >= pullThreshold) {
    await doScan();
  }
  pullDistance.value = 0;
}

onMounted(async () => {
  await Promise.all([loadWifiInterface(), doScan(), loadStatus()]);
  initialLoading.value = false;
});
</script>

<template>
  <div>
    <!-- Wi-Fi interface status preview -->
    <Card v-if="bestWifiIface" size="small" class="mb-4">
      <div class="mb-3 flex items-center gap-3">
        <div
          class="flex items-center justify-center rounded-lg bg-primary/10"
          :class="isMobile ? 'h-9 w-9' : 'h-10 w-10'"
        >
          <IconifyIcon icon="mdi:wifi" class="text-primary size-5" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="truncate text-sm font-semibold">{{ bestWifiIface.displayName || bestWifiIface.name }}</span>
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
          <div v-if="bestWifiIface.macAddress" class="truncate text-xs text-gray-400">
            {{ bestWifiIface.macAddress }}
          </div>
        </div>
        <div class="shrink-0">
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
        :column="descColumn"
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
          <span class="break-all">{{ wifiStatus.ipAddress ?? '—' }}</span>
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
        <Descriptions.Item
          v-if="wifiStatus.dns?.length"
          :label="$t('page.maintenance.network.wifiConfig.dns')"
          :span="isMobile ? 1 : 2"
        >
          <span class="break-all">{{ wifiStatus.dns.join(', ') }}</span>
        </Descriptions.Item>
      </Descriptions>

      <!-- Not connected: show basic interface info -->
      <Descriptions
        v-else
        size="small"
        :column="descColumn"
        bordered
      >
        <Descriptions.Item :label="$t('page.maintenance.network.ipAddress')">
          <span class="break-all">{{ bestWifiIface.ipv4?.addresses?.[0]?.address ?? '—' }}</span>
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
          :span="isMobile ? 1 : 2"
        >
          <span class="break-all">{{ bestWifiIface.ipv4.dns.join(', ') }}</span>
        </Descriptions.Item>
      </Descriptions>
    </Card>

    <!-- Scan section -->
    <Divider orientation="left" class="!my-3 !text-xs">
      {{ $t('page.maintenance.network.wifiConfig.scanTitle') }}
    </Divider>

    <div class="mb-3 flex items-center justify-end gap-2">
      <Button v-if="!readOnly" size="small" @click="openConnectHidden">
        {{ isMobile
          ? $t('page.maintenance.network.wifiConfig.hiddenNetwork')
          : $t('page.maintenance.network.wifiConfig.connectToHidden') }}
      </Button>
      <Button type="primary" ghost size="small" :loading="scanning" @click="doScan">
        {{ scanning
          ? $t('page.maintenance.network.wifiConfig.scanning')
          : $t('page.maintenance.network.wifiConfig.scan') }}
      </Button>
    </div>

    <!-- Pull-to-refresh indicator (mobile) -->
    <div
      v-if="isMobile && pullDistance > 0"
      class="flex items-center justify-center py-2 text-xs text-gray-400 transition-opacity"
      :style="{ height: `${pullDistance}px` }"
    >
      <IconifyIcon
        icon="mdi:arrow-down"
        class="mr-1 size-4 transition-transform"
        :class="{ 'rotate-180': pullDistance >= pullThreshold }"
      />
      {{ pullDistance >= pullThreshold
        ? $t('page.maintenance.network.wifiConfig.releaseToRefresh')
        : $t('page.maintenance.network.wifiConfig.pullToRefresh') }}
    </div>

    <!-- Wi-Fi list with pull-to-refresh container -->
    <div
      ref="pullContainer"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- Skeleton screen during initial load -->
      <div v-if="initialLoading" class="flex flex-col gap-2">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3 rounded-md px-3 py-3">
          <Skeleton.Avatar :size="20" shape="square" active />
          <div class="flex-1">
            <Skeleton.Input active style="width: 60%; height: 16px" />
            <Skeleton.Input active style="width: 40%; height: 12px; margin-top: 4px" />
          </div>
        </div>
      </div>

      <template v-else>
        <Empty
          v-if="accessPoints.length === 0 && !scanning"
          :description="$t('page.maintenance.network.wifiConfig.noNetworks')"
        />

        <List v-else size="small" :data-source="accessPoints">
          <template #renderItem="{ item }">
            <List.Item
              class="wifi-list-item !px-3"
              :class="{ 'wifi-list-item--mobile': isMobile }"
            >
              <div class="flex w-full items-center gap-3">
                <IconifyIcon
                  :icon="signalIcon(item.signalQuality)"
                  :class="item.isConnected ? 'text-green-500' : 'text-gray-400'"
                  class="size-5 shrink-0"
                />

                <div
                  class="min-w-0 flex-1"
                  @click="isMobile && !readOnly && !item.isConnected ? openConnect(item) : undefined"
                >
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
      </template>
    </div>

    <!-- Desktop: Modal / Mobile: Bottom-sheet Drawer -->
    <template v-if="isMobile">
      <Drawer
        :open="connectModalOpen"
        :title="selectedAp
          ? `${$t('page.maintenance.network.wifiConfig.connect')} — ${selectedAp.ssid}`
          : $t('page.maintenance.network.wifiConfig.connectToHidden')"
        placement="bottom"
        height="auto"
        class="wifi-connect-sheet"
        :closable="true"
        :destroy-on-close="true"
        @close="connectModalOpen = false"
      >
        <WifiConnectModal
          :open="true"
          :ap="selectedAp"
          :connecting="connecting"
          :connect-result="connectResult"
          :is-mobile="true"
          :inline-mode="true"
          @cancel="connectModalOpen = false"
          @connect="doConnect"
        />
      </Drawer>
    </template>
    <template v-else>
      <WifiConnectModal
        :open="connectModalOpen"
        :ap="selectedAp"
        :connecting="connecting"
        :connect-result="connectResult"
        :is-mobile="false"
        @cancel="connectModalOpen = false"
        @connect="doConnect"
      />
    </template>
  </div>
</template>

<style scoped>
.wifi-list-item--mobile {
  cursor: pointer;
  transition: background-color 0.15s;
}

.wifi-list-item--mobile:active {
  background-color: rgba(0, 0, 0, 0.04);
}

.wifi-connect-sheet :deep(.ant-drawer-content-wrapper) {
  border-radius: 12px 12px 0 0;
  max-height: 80vh;
}

.wifi-connect-sheet :deep(.ant-drawer-body) {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
