<script lang="ts" setup>
import type {
  NetworkCapabilities,
  NetworkInterfaceDetail,
  NetworkInterfaceSummary,
} from '@vben/types';

import type { NetworkTabKey } from './modules/schemas';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Alert, Button, Card, Tabs } from 'ant-design-vue';

import {
  fetchNetworkCapabilities,
  fetchNetworkInterfaceDetail,
  fetchNetworkInterfaces,
} from '#/api/core';

import ApTab from './modules/widgets/ap-tab.vue';
import DnsTab from './modules/widgets/dns-tab.vue';
import InterfaceDetailDrawer from './modules/widgets/interface-detail.vue';
import OverviewCards from './modules/widgets/overview-cards.vue';
import WifiTab from './modules/widgets/wifi-tab.vue';
import WiredConfigTab from './modules/widgets/wired-config-tab.vue';

defineOptions({ name: 'MaintenanceNetwork' });

const { handleRequest } = useRequestHandler();

const activeTab = ref<NetworkTabKey>('overview');
const interfaces = ref<NetworkInterfaceSummary[]>([]);
const capabilities = ref<NetworkCapabilities | null>(null);
const loading = ref(false);

const detailDrawerOpen = ref(false);
const detailData = ref<NetworkInterfaceDetail | null>(null);
const detailLoading = ref(false);

const isReadOnly = computed(
  () => capabilities.value?.platform === 'read_only',
);
const canWifi = computed(
  () => capabilities.value?.canScanWifi === true,
);
const canAp = computed(
  () => capabilities.value != null,
);

async function loadInterfaces() {
  loading.value = true;
  await handleRequest(
    () => fetchNetworkInterfaces(),
    (data) => {
      interfaces.value = data;
    },
  );
  loading.value = false;
}

async function loadCapabilities() {
  await handleRequest(
    () => fetchNetworkCapabilities(),
    (data) => {
      capabilities.value = data;
    },
  );
}

async function openDetail(name: string) {
  detailDrawerOpen.value = true;
  detailLoading.value = true;
  detailData.value = null;

  await handleRequest(
    () => fetchNetworkInterfaceDetail(name),
    (data) => {
      detailData.value = data;
    },
  );
  detailLoading.value = false;
}

async function refresh() {
  await Promise.all([loadInterfaces(), loadCapabilities()]);
}

onMounted(() => {
  refresh();
});
</script>

<template>
  <Page auto-content-height>
    <div class="flex h-full flex-col gap-4">
      <Alert
        v-if="capabilities && isReadOnly"
        type="info"
        show-icon
        :message="$t('page.maintenance.network.platformReadOnly')"
        class="!mb-0"
      />

      <Card :body-style="{ padding: '16px' }">
        <Tabs v-model:activeKey="activeTab">
          <template #rightExtra>
            <Button
              type="primary"
              ghost
              size="small"
              :loading="loading"
              @click="refresh"
            >
              {{ $t('page.maintenance.network.refresh') }}
            </Button>
          </template>

          <Tabs.TabPane key="overview" :tab="$t('page.maintenance.network.overview')">
            <OverviewCards
              :interfaces="interfaces"
              :loading="loading"
              @detail="openDetail"
            />
          </Tabs.TabPane>

          <Tabs.TabPane key="wired" :tab="$t('page.maintenance.network.wired')">
            <WiredConfigTab :read-only="isReadOnly" />
          </Tabs.TabPane>

          <Tabs.TabPane
            v-if="canWifi"
            key="wifi"
            :tab="$t('page.maintenance.network.wifi')"
          >
            <WifiTab :read-only="isReadOnly" />
          </Tabs.TabPane>

          <Tabs.TabPane
            v-if="canAp"
            key="ap"
            :tab="$t('page.maintenance.network.ap')"
          >
            <ApTab :capabilities="capabilities" />
          </Tabs.TabPane>

          <Tabs.TabPane key="dns" :tab="$t('page.maintenance.network.dns')">
            <DnsTab :read-only="isReadOnly" />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>

    <InterfaceDetailDrawer
      v-model:open="detailDrawerOpen"
      :detail="detailData"
      :loading="detailLoading"
    />
  </Page>
</template>
