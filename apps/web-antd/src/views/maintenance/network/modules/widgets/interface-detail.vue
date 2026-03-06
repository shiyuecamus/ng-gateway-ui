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
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const title = computed(
  () =>
    `${$t('page.maintenance.network.detailTitle')} — ${props.detail?.displayName || props.detail?.name || ''}`,
);
</script>

<template>
  <Drawer
    :open="open"
    :title="title"
    :width="520"
    @close="emit('update:open', false)"
  >
    <Spin :spinning="loading">
      <Descriptions
        v-if="detail"
        bordered
        size="small"
        :column="1"
        :label-style="{ width: '140px' }"
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
          {{ detail.macAddress || '—' }}
        </Descriptions.Item>

        <Descriptions.Item
          v-if="detail.ipv4?.addresses?.length"
          :label="$t('page.maintenance.network.ipAddress') + ' (IPv4)'"
        >
          <div v-for="addr in detail.ipv4.addresses" :key="addr.address">
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
          {{ detail.ipv4.dns.join(', ') }}
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
