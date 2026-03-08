<script lang="ts" setup>
import type { Ipv4Config } from '@vben/types';

import { $t } from '@vben/locales';

import { Collapse } from 'ant-design-vue';

import IpConfigForm from './ip-config-form.vue';

const props = defineProps<{
  interfaceName: string | null;
  currentIpv4: Ipv4Config | null | undefined;
  isMobile: boolean;
}>();

const emit = defineEmits<{
  applied: [];
}>();
</script>

<template>
  <Collapse ghost>
    <Collapse.Panel
      key="ip-config"
      :header="$t('page.maintenance.network.wifiConfig.ipConfigTitle')"
    >
      <IpConfigForm
        :interface-name="props.interfaceName"
        :current-ipv4="props.currentIpv4"
        :is-mobile="props.isMobile"
        @applied="emit('applied')"
      />
    </Collapse.Panel>
  </Collapse>
</template>
