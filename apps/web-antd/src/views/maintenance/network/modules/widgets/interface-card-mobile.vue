<script lang="ts" setup>
import type { NetworkInterfaceSummary } from '@vben/types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import { Button, Tag } from 'ant-design-vue';

import {
  formatBytes,
  interfaceKindIcon,
  linkStateColor,
} from '../schemas';

const props = defineProps<{
  iface: NetworkInterfaceSummary;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
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
  <div
    class="mobile-iface-card"
    :class="{ 'mobile-iface-card--expanded': expanded }"
  >
    <!-- Collapsed header row (always visible, tappable) -->
    <div
      class="flex items-center gap-3 px-3 py-2.5 active:bg-gray-50"
      @click="emit('toggle')"
    >
      <div
        class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        :style="{ backgroundColor: `${badgeColor}15` }"
      >
        <IconifyIcon :icon="icon" class="size-[18px]" :style="{ color: badgeColor }" />
        <span
          class="absolute -right-0.5 -top-0.5 block h-2.5 w-2.5 rounded-full border-2 border-white"
          :style="{ backgroundColor: badgeColor }"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="truncate text-sm font-medium">
            {{ iface.displayName || iface.name }}
          </span>
          <Tag
            :color="iface.linkState === 'up' ? 'success' : 'default'"
            size="small"
            class="!m-0 !text-[11px]"
          >
            {{ iface.linkState === 'up'
              ? $t('page.maintenance.network.linkUp')
              : $t('page.maintenance.network.linkDown') }}
          </Tag>
        </div>
        <div class="truncate text-xs text-gray-400">
          {{ primaryIp }}
        </div>
      </div>

      <IconifyIcon
        icon="mdi:chevron-down"
        class="size-5 shrink-0 text-gray-400 transition-transform duration-200"
        :class="{ 'rotate-180': expanded }"
      />
    </div>

    <!-- Expanded detail area -->
    <div v-if="expanded" class="border-t border-gray-100 px-3 pb-3 pt-2">
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span class="text-gray-400">{{ $t('page.maintenance.network.type') }}</span>
          <div>{{ kindLabel }}</div>
        </div>
        <div>
          <span class="text-gray-400">{{ $t('page.maintenance.network.macAddress') }}</span>
          <div class="break-all">{{ iface.macAddress || '—' }}</div>
        </div>

        <div v-if="iface.connectedSsid" class="col-span-2">
          <span class="text-gray-400">{{ $t('page.maintenance.network.connectedTo') }}</span>
          <div class="flex items-center gap-1">
            <IconifyIcon icon="mdi:wifi" class="size-3.5 text-blue-500" />
            <span>{{ iface.connectedSsid }}</span>
            <span v-if="iface.signalQuality != null" class="text-gray-400">
              ({{ iface.signalQuality }}%)
            </span>
          </div>
        </div>

        <div v-if="iface.speedMbps">
          <span class="text-gray-400">{{ $t('page.maintenance.network.speed') }}</span>
          <div>{{ iface.speedMbps }} Mbps</div>
        </div>

        <template v-if="iface.rxBytes != null || iface.txBytes != null">
          <div>
            <span class="text-gray-400">↓ {{ $t('page.maintenance.network.rxBytes') }}</span>
            <div>{{ formatBytes(iface.rxBytes) }}</div>
          </div>
          <div>
            <span class="text-gray-400">↑ {{ $t('page.maintenance.network.txBytes') }}</span>
            <div>{{ formatBytes(iface.txBytes) }}</div>
          </div>
        </template>
      </div>

      <div class="mt-2 flex justify-end">
        <Button size="small" type="link" @click.stop="emit('detail', iface.name)">
          {{ $t('page.maintenance.network.viewDetail') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-iface-card {
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.mobile-iface-card--expanded {
  border-color: var(--ant-color-primary, #1677ff);
}
</style>
