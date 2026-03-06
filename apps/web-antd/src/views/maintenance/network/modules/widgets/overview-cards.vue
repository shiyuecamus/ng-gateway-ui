<script lang="ts" setup>
import type { NetworkInterfaceSummary } from '@vben/types';

import { ref } from 'vue';

import { $t } from '@vben/locales';

import { Empty, Spin } from 'ant-design-vue';

import InterfaceCard from './interface-card.vue';
import InterfaceCardMobile from './interface-card-mobile.vue';

const props = defineProps<{
  interfaces: NetworkInterfaceSummary[];
  loading: boolean;
  isMobile: boolean;
}>();

const emit = defineEmits<{
  detail: [name: string];
}>();

const expandedNames = ref<Set<string>>(new Set());

function toggleExpand(name: string) {
  if (expandedNames.value.has(name)) {
    expandedNames.value.delete(name);
  } else {
    expandedNames.value.add(name);
  }
}
</script>

<template>
  <Spin :spinning="loading">
    <template v-if="interfaces.length > 0">
      <!-- Mobile: collapsible list -->
      <div v-if="props.isMobile" class="flex flex-col gap-2">
        <InterfaceCardMobile
          v-for="iface in interfaces"
          :key="iface.name"
          :iface="iface"
          :expanded="expandedNames.has(iface.name)"
          @toggle="toggleExpand(iface.name)"
          @detail="emit('detail', $event)"
        />
      </div>

      <!-- Desktop: responsive grid -->
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <InterfaceCard
          v-for="iface in interfaces"
          :key="iface.name"
          :iface="iface"
          @detail="emit('detail', $event)"
        />
      </div>
    </template>
    <Empty
      v-else-if="!loading"
      :description="$t('page.maintenance.network.noInterfaces')"
    />
  </Spin>
</template>
