<script lang="ts" setup>
import type { NetworkInterfaceSummary } from '@vben/types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import { Badge, Card, Tag, Tooltip, Typography } from 'ant-design-vue';

import {
  formatBytes,
  interfaceKindIcon,
  linkStateColor,
} from '../schemas';

const props = defineProps<{
  iface: NetworkInterfaceSummary;
}>();

const emit = defineEmits<{
  detail: [name: string];
}>();

const kindLabel = computed(() => {
  const map: Record<string, string> = {
    ethernet: $t('page.maintenance.network.typeEthernet'),
    wifi: $t('page.maintenance.network.typeWifi'),
    bridge: $t('page.maintenance.network.typeBridge'),
    vlan: $t('page.maintenance.network.typeVlan'),
    loopback: $t('page.maintenance.network.typeLoopback'),
    virtual: $t('page.maintenance.network.typeVirtual'),
    unknown: $t('page.maintenance.network.typeUnknown'),
  };
  return map[props.iface.kind] ?? props.iface.kind;
});

const stateLabel = computed(() => {
  const map: Record<string, string> = {
    up: $t('page.maintenance.network.linkUp'),
    down: $t('page.maintenance.network.linkDown'),
    dormant: $t('page.maintenance.network.linkDormant'),
    unknown: $t('page.maintenance.network.linkUnknown'),
  };
  return map[props.iface.linkState] ?? props.iface.linkState;
});

const primaryIp = computed(() => {
  const v4 = props.iface.ipv4?.addresses?.[0];
  if (v4) return `${v4.address}/${v4.prefixLength}`;
  const v6 = props.iface.ipv6?.addresses?.[0];
  if (v6) return `${v6.address}/${v6.prefixLength}`;
  return $t('page.maintenance.network.noIp');
});

const icon = computed(() => interfaceKindIcon(props.iface.kind));
const badgeColor = computed(() => linkStateColor(props.iface.linkState));
</script>

<template>
  <Card
    hoverable
    size="small"
    class="interface-card"
    @click="emit('detail', iface.name)"
  >
    <div class="flex items-start gap-3">
      <div class="flex flex-col items-center gap-1">
        <Badge :color="badgeColor" :dot="true">
          <div
            class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg"
          >
            <IconifyIcon :icon="icon" class="text-primary size-5" />
          </div>
        </Badge>
      </div>

      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-center gap-2">
          <Typography.Text strong class="truncate text-sm">
            {{ iface.displayName || iface.name }}
          </Typography.Text>
          <Tag :color="iface.linkState === 'up' ? 'success' : 'default'" size="small" class="!m-0">
            {{ stateLabel }}
          </Tag>
          <Tag size="small" class="!m-0">{{ kindLabel }}</Tag>
        </div>

        <div class="text-xs text-gray-500">
          <div class="truncate">{{ primaryIp }}</div>
        </div>

        <div v-if="iface.macAddress" class="mt-0.5 text-xs text-gray-400">
          {{ iface.macAddress }}
        </div>

        <div
          v-if="iface.connectedSsid"
          class="mt-1 flex items-center text-xs text-blue-500"
        >
          <IconifyIcon icon="mdi:wifi" class="mr-1 size-3.5" />
          {{ $t('page.maintenance.network.connectedTo') }}:
          {{ iface.connectedSsid }}
          <span v-if="iface.signalQuality != null" class="ml-1 text-gray-400">
            ({{ iface.signalQuality }}%)
          </span>
        </div>

        <div
          v-if="iface.speedMbps || iface.rxBytes != null"
          class="mt-1 flex gap-3 text-xs text-gray-400"
        >
          <Tooltip
            v-if="iface.speedMbps"
            :title="$t('page.maintenance.network.speed')"
          >
            <span>{{ iface.speedMbps }} Mbps</span>
          </Tooltip>
          <Tooltip
            v-if="iface.rxBytes != null"
            :title="$t('page.maintenance.network.rxBytes')"
          >
            <span>↓ {{ formatBytes(iface.rxBytes) }}</span>
          </Tooltip>
          <Tooltip
            v-if="iface.txBytes != null"
            :title="$t('page.maintenance.network.txBytes')"
          >
            <span>↑ {{ formatBytes(iface.txBytes) }}</span>
          </Tooltip>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.interface-card {
  cursor: pointer;
  transition: all 0.2s;
}
.interface-card:hover {
  border-color: var(--ant-color-primary);
}
</style>
