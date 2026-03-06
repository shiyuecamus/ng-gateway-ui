<script lang="ts" setup>
import type { NetworkInterfaceSummary } from '@vben/types';

import { $t } from '@vben/locales';

import { Empty, Spin } from 'ant-design-vue';

import InterfaceCard from './interface-card.vue';

defineProps<{
  interfaces: NetworkInterfaceSummary[];
  loading: boolean;
}>();

const emit = defineEmits<{
  detail: [name: string];
}>();
</script>

<template>
  <Spin :spinning="loading">
    <div v-if="interfaces.length > 0" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <InterfaceCard
        v-for="iface in interfaces"
        :key="iface.name"
        :iface="iface"
        @detail="emit('detail', $event)"
      />
    </div>
    <Empty
      v-else-if="!loading"
      :description="$t('page.maintenance.network.noInterfaces')"
    />
  </Spin>
</template>
