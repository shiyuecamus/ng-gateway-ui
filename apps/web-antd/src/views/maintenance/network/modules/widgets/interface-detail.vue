<script lang="ts" setup>
import type { NetworkInterfaceDetail } from '@vben/types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import { Descriptions, Drawer, Spin, Tag } from 'ant-design-vue';

import { formatBytes } from '../schemas';

const props = defineProps<{
  open: boolean;
  detail: NetworkInterfaceDetail | null;
  loading: boolean;
  isMobile: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const title = computed(
  () =>
    `${$t('page.maintenance.network.detailTitle')} — ${props.detail?.displayName || props.detail?.name || ''}`,
);

const drawerWidth = computed(() => (props.isMobile ? '100%' : 520));
const labelWidth = computed(() => (props.isMobile ? '110px' : '140px'));
</script>

<template>
  <Drawer
    :open="open"
    :title="title"
    :width="drawerWidth"
    :placement="isMobile ? 'bottom' : 'right'"
    :height="isMobile ? '85%' : undefined"
    :class="{ 'mobile-drawer': isMobile }"
    @close="emit('update:open', false)"
  >
    <Spin :spinning="loading">
      <Descriptions
        v-if="detail"
        bordered
        size="small"
        :column="1"
        :label-style="{ width: labelWidth }"
      >
        <Descriptions.Item :label="$t('page.maintenance.network.interfaceName')">
          {{ detail.name }}
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.status')">
          <Tag :color="detail.linkState === 'up' ? 'success' : 'default'">
            {{ detail.linkState }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="$t('page.maintenance.network.macAddress')">
          <span class="break-all">{{ detail.macAddress || '—' }}</span>
        </Descriptions.Item>

        <Descriptions.Item
          v-if="detail.ipv4?.addresses?.length"
          :label="$t('page.maintenance.network.ipAddress') + ' (IPv4)'"
        >
          <div v-for="addr in detail.ipv4.addresses" :key="addr.address" class="break-all">
            {{ addr.address }}/{{ addr.prefixLength }}
          </div>
        </Descriptions.Item>
        <Descriptions.Item
          v-if="detail.ipv4?.gateway"
          :label="$t('page.maintenance.network.gateway') + ' (IPv4)'"
        >
          {{ detail.ipv4.gateway }}
        </Descriptions.Item>
        <Descriptions.Item
          v-if="detail.ipv4?.dns?.length"
          :label="$t('page.maintenance.network.dnsServers') + ' (IPv4)'"
        >
          <span class="break-all">{{ detail.ipv4.dns.join(', ') }}</span>
        </Descriptions.Item>

        <Descriptions.Item
          v-if="detail.ipv6?.addresses?.length"
          :label="$t('page.maintenance.network.ipAddress') + ' (IPv6)'"
        >
          <div v-for="addr in detail.ipv6.addresses" :key="addr.address" class="break-all">
            {{ addr.address }}/{{ addr.prefixLength }}
          </div>
        </Descriptions.Item>

        <Descriptions.Item v-if="detail.driver" :label="$t('page.maintenance.network.driver')">
          {{ detail.driver }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.firmwareVersion" :label="$t('page.maintenance.network.firmware')">
          {{ detail.firmwareVersion }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.mtu" :label="$t('page.maintenance.network.mtu')">
          {{ detail.mtu }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.speedMbps" :label="$t('page.maintenance.network.speed')">
          {{ detail.speedMbps }} Mbps
        </Descriptions.Item>

        <Descriptions.Item v-if="detail.rxBytes != null" :label="$t('page.maintenance.network.rxBytes')">
          {{ formatBytes(detail.rxBytes) }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.txBytes != null" :label="$t('page.maintenance.network.txBytes')">
          {{ formatBytes(detail.txBytes) }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.rxPackets != null" :label="$t('page.maintenance.network.rxPackets')">
          {{ detail.rxPackets?.toLocaleString() }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.txPackets != null" :label="$t('page.maintenance.network.txPackets')">
          {{ detail.txPackets?.toLocaleString() }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.rxErrors != null" :label="$t('page.maintenance.network.rxErrors')">
          {{ detail.rxErrors?.toLocaleString() }}
        </Descriptions.Item>
        <Descriptions.Item v-if="detail.txErrors != null" :label="$t('page.maintenance.network.txErrors')">
          {{ detail.txErrors?.toLocaleString() }}
        </Descriptions.Item>
      </Descriptions>
    </Spin>
  </Drawer>
</template>

<style scoped>
.mobile-drawer :deep(.ant-drawer-content-wrapper) {
  border-radius: 12px 12px 0 0;
}
</style>
