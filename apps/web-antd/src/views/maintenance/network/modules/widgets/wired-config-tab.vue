<script lang="ts" setup>
import type { WiredStatus } from '@vben/types';

import { computed, onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  Card,
  Descriptions,
  Divider,
  Empty,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { fetchWiredStatus } from '#/api/core';

import { prefixToSubnetMask } from '../schemas';
import IpConfigForm from './ip-config-form.vue';

const props = defineProps<{
  readOnly: boolean;
  isMobile: boolean;
}>();

const { handleRequest } = useRequestHandler();

const loading = ref(false);
const status = ref<WiredStatus | null>(null);

const selectedName = ref<string>('');

const bestIface = computed(() => {
  if (!status.value) return null;
  if (selectedName.value) {
    return status.value.allInterfaces.find((i) => i.name === selectedName.value) ?? status.value.interface;
  }
  return status.value.interface;
});

async function loadStatus() {
  loading.value = true;
  await handleRequest(
    () => fetchWiredStatus(),
    (data: WiredStatus) => {
      status.value = data;
      if (data.interface && !selectedName.value) {
        selectedName.value = data.interface.name;
      }
    },
  );
  loading.value = false;
}

const interfaceOptions = computed(() =>
  (status.value?.allInterfaces ?? []).map((i) => ({
    label: `${i.displayName || i.name}${i.linkState === 'up' ? ' ●' : ''}`,
    value: i.name,
  })),
);

onMounted(() => { loadStatus(); });
</script>

<template>
  <Spin :spinning="loading">
    <Empty
      v-if="status && !status.available && !loading"
      :description="$t('page.maintenance.network.wiredConfig.noEthernetInterfaces')"
    />

    <div v-else-if="status?.available">
      <!-- Interface selector (only show if multiple) -->
      <div v-if="(status?.allInterfaces?.length ?? 0) > 1" class="mb-4 max-w-lg">
        <Select
          v-model:value="selectedName"
          :options="interfaceOptions"
          class="w-full"
          :placeholder="$t('page.maintenance.network.wiredConfig.selectInterface')"
        />
      </div>

      <!-- Status preview card -->
      <Card v-if="bestIface" size="small" class="mb-4">
        <div class="mb-3 flex items-center gap-3">
          <div
            class="flex items-center justify-center rounded-lg bg-primary/10"
            :class="isMobile ? 'h-9 w-9' : 'h-10 w-10'"
          >
            <IconifyIcon icon="mdi:ethernet" class="text-primary size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-semibold">{{ bestIface.displayName || bestIface.name }}</span>
              <Tag
                :color="bestIface.linkState === 'up' ? 'success' : 'default'"
                size="small"
                class="!m-0"
              >
                {{ bestIface.linkState === 'up'
                  ? $t('page.maintenance.network.linkUp')
                  : $t('page.maintenance.network.linkDown') }}
              </Tag>
            </div>
            <div v-if="bestIface.macAddress" class="truncate text-xs text-gray-400">
              {{ bestIface.macAddress }}
            </div>
          </div>
        </div>

        <Descriptions size="small" :column="isMobile ? 1 : { xs: 1, sm: 2 }" bordered>
          <Descriptions.Item :label="$t('page.maintenance.network.ipAddress')">
            <span class="break-all">{{ bestIface.ipv4?.addresses?.[0]?.address ?? '—' }}</span>
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.subnetMask')">
            {{ prefixToSubnetMask(bestIface.ipv4?.addresses?.[0]?.prefixLength) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.gateway')">
            {{ bestIface.ipv4?.gateway ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
            <Tag size="small" class="!m-0">
              {{ bestIface.ipv4?.method === 'static'
                ? $t('page.maintenance.network.static')
                : $t('page.maintenance.network.dhcp') }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item
            v-if="bestIface.ipv4?.dns?.length"
            :label="$t('page.maintenance.network.dnsServers')"
            :span="isMobile ? 1 : 2"
          >
            <span class="break-all">{{ bestIface.ipv4.dns.join(', ') }}</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <!-- Configuration form (only on writable platforms) -->
      <template v-if="!readOnly">
        <Divider orientation="left" class="!my-3 !text-xs">
          {{ $t('page.maintenance.network.wiredConfig.title') }}
        </Divider>

        <IpConfigForm
          :interface-name="selectedName"
          :current-ipv4="bestIface?.ipv4"
          :is-mobile="isMobile"
          @applied="loadStatus"
        />
      </template>
    </div>
  </Spin>
</template>
