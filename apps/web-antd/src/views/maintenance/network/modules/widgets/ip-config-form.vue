<script lang="ts" setup>
import type { IpConfig, IpMethod, Ipv4Config } from '@vben/types';

import { computed, ref, watch } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
} from 'ant-design-vue';

import { configureNetworkInterface } from '#/api/core';

const props = defineProps<{
  interfaceName: string | null;
  currentIpv4: Ipv4Config | null | undefined;
  isMobile: boolean;
}>();

const emit = defineEmits<{
  applied: [];
}>();

const { handleRequest } = useRequestHandler();

const applying = ref(false);
const confirmOpen = ref(false);

const form = ref({
  method: 'dhcp' as IpMethod,
  ipAddress: '',
  prefixLength: 24,
  gateway: '',
  dns: '',
});

watch(
  () => props.currentIpv4,
  (ipv4) => {
    if (ipv4) {
      form.value.method = ipv4.method;
      form.value.ipAddress = ipv4.addresses?.[0]?.address ?? '';
      form.value.prefixLength = ipv4.addresses?.[0]?.prefixLength ?? 24;
      form.value.gateway = (ipv4.gateway as string) ?? '';
      form.value.dns = ipv4.dns?.join('\n') ?? '';
    } else {
      form.value.method = 'dhcp';
      form.value.ipAddress = '';
      form.value.prefixLength = 24;
      form.value.gateway = '';
      form.value.dns = '';
    }
  },
  { immediate: true },
);

const isStatic = computed(() => form.value.method === 'static');

const ipModeOptions = computed(() => [
  { label: $t('page.maintenance.network.dhcp'), value: 'dhcp' },
  { label: $t('page.maintenance.network.static'), value: 'static' },
]);

const dnsPlaceholder = computed(() =>
  isStatic.value
    ? $t('page.maintenance.network.wiredConfig.dnsHint')
    : $t('page.maintenance.network.wiredConfig.dnsHintDhcp'),
);

async function applyConfig() {
  confirmOpen.value = false;
  if (!props.interfaceName) return;
  if (isStatic.value && (!form.value.ipAddress || !form.value.prefixLength)) {
    message.warning(
      $t('page.maintenance.network.wiredConfig.staticRequired'),
    );
    return;
  }

  applying.value = true;
  const dnsServers = form.value.dns
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const ipConfig: IpConfig = isStatic.value
    ? {
        method: 'static' as const,
        ipAddress: form.value.ipAddress,
        prefixLength: form.value.prefixLength,
        gateway: form.value.gateway || null,
        dns: dnsServers.length > 0 ? dnsServers : null,
      }
    : {
        method: form.value.method as 'dhcp' | 'disabled',
        dns: dnsServers.length > 0 ? dnsServers : null,
      };

  await handleRequest(
    () =>
      configureNetworkInterface(props.interfaceName!, {
        ipConfig,
      }),
    () => {
      message.success(
        $t('page.maintenance.network.wiredConfig.applySuccess'),
      );
      emit('applied');
    },
  );
  applying.value = false;
}

function requestApply() {
  if (props.isMobile) {
    confirmOpen.value = true;
  } else {
    Modal.confirm({
      title: $t('page.maintenance.network.wiredConfig.apply'),
      content: $t('page.maintenance.network.confirmSwitchIpMode'),
      okText: $t('page.maintenance.network.confirmAction'),
      cancelText: $t('page.maintenance.network.confirmCancel'),
      onOk: () => applyConfig(),
    });
  }
}
</script>

<template>
  <Form layout="vertical" :class="isMobile ? 'w-full' : 'max-w-lg'">
    <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
      <Select v-model:value="form.method" :options="ipModeOptions" />
    </Form.Item>

    <template v-if="isStatic">
      <Form.Item
        :label="$t('page.maintenance.network.wiredConfig.ipAddress')"
        required
      >
        <Input
          v-model:value="form.ipAddress"
          placeholder="192.168.1.100"
          inputmode="decimal"
          class="!text-base"
        />
      </Form.Item>
      <Form.Item
        :label="$t('page.maintenance.network.wiredConfig.prefixLength')"
        required
      >
        <InputNumber
          v-model:value="form.prefixLength"
          :min="1"
          :max="32"
          class="!w-full"
          inputmode="numeric"
        />
      </Form.Item>
      <Form.Item
        :label="$t('page.maintenance.network.wiredConfig.gateway')"
      >
        <Input
          v-model:value="form.gateway"
          placeholder="192.168.1.1"
          inputmode="decimal"
          class="!text-base"
        />
      </Form.Item>
    </template>

    <Form.Item
      :label="$t('page.maintenance.network.wiredConfig.dnsServers')"
    >
      <Input.TextArea
        v-model:value="form.dns"
        :rows="2"
        :placeholder="dnsPlaceholder"
        class="!text-base"
      />
    </Form.Item>

    <Form.Item>
      <Button
        type="primary"
        :loading="applying"
        :block="isMobile"
        @click="requestApply"
      >
        {{
          applying
            ? $t('page.maintenance.network.wiredConfig.applying')
            : $t('page.maintenance.network.wiredConfig.apply')
        }}
      </Button>
    </Form.Item>
  </Form>

  <!-- Mobile confirmation bottom sheet -->
  <Drawer
    v-if="isMobile"
    :open="confirmOpen"
    placement="bottom"
    height="auto"
    :closable="true"
    :title="$t('page.maintenance.network.wiredConfig.apply')"
    class="ip-config-confirm-sheet"
    @close="confirmOpen = false"
  >
    <p class="mb-4 text-sm text-gray-600">
      {{ $t('page.maintenance.network.confirmSwitchIpMode') }}
    </p>
    <div class="flex gap-3">
      <Button block @click="confirmOpen = false">
        {{ $t('page.maintenance.network.confirmCancel') }}
      </Button>
      <Button
        type="primary"
        block
        :loading="applying"
        @click="applyConfig"
      >
        {{ $t('page.maintenance.network.confirmAction') }}
      </Button>
    </div>
  </Drawer>
</template>

<style scoped>
.ip-config-confirm-sheet :deep(.ant-drawer-content-wrapper) {
  border-radius: 12px 12px 0 0;
}

.ip-config-confirm-sheet :deep(.ant-drawer-body) {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
