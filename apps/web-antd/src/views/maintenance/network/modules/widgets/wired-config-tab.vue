<script lang="ts" setup>
import type {
  ConfigureInterfaceRequest,
  IpMethod,
  WiredStatus,
} from '@vben/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { configureNetworkInterface, fetchWiredStatus } from '#/api/core';

import { prefixToSubnetMask } from '../schemas';

const props = defineProps<{
  readOnly: boolean;
  isMobile: boolean;
}>();

const { handleRequest } = useRequestHandler();

const loading = ref(false);
const applying = ref(false);
const status = ref<WiredStatus | null>(null);

const selectedName = ref<string>('');

const form = ref<{
  method: IpMethod;
  ipAddress: string;
  prefixLength: number;
  gateway: string;
  dns: string;
}>({
  method: 'dhcp',
  ipAddress: '',
  prefixLength: 24,
  gateway: '',
  dns: '',
});

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

watch(selectedName, (name) => {
  const iface = status.value?.allInterfaces.find((i) => i.name === name);
  if (!iface) return;
  const ipv4 = iface.ipv4;
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
});

const isStatic = computed(() => form.value.method === 'static');

const confirmOpen = ref(false);

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

async function applyConfig() {
  confirmOpen.value = false;
  if (!selectedName.value) return;
  if (isStatic.value && (!form.value.ipAddress || !form.value.prefixLength)) {
    message.warning($t('page.maintenance.network.wiredConfig.staticRequired'));
    return;
  }

  applying.value = true;
  const dnsServers = form.value.dns.split('\n').map((s) => s.trim()).filter(Boolean);
  const payload: ConfigureInterfaceRequest = {
    method: form.value.method,
    ipAddress: isStatic.value ? form.value.ipAddress : undefined,
    prefixLength: isStatic.value ? form.value.prefixLength : undefined,
    gateway: isStatic.value && form.value.gateway ? form.value.gateway : undefined,
    dns: dnsServers.length > 0 ? dnsServers : undefined,
  };

  await handleRequest(
    () => configureNetworkInterface(selectedName.value, payload),
    () => {
      message.success($t('page.maintenance.network.wiredConfig.applySuccess'));
      loadStatus();
    },
  );
  applying.value = false;
}

const ipModeOptions = computed(() => [
  { label: $t('page.maintenance.network.dhcp'), value: 'dhcp' },
  { label: $t('page.maintenance.network.static'), value: 'static' },
]);

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

        <Form layout="vertical" :class="isMobile ? 'w-full' : 'max-w-lg'">
          <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
            <Select v-model:value="form.method" :options="ipModeOptions" />
          </Form.Item>

          <template v-if="isStatic">
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipAddress')" required>
              <Input
                v-model:value="form.ipAddress"
                placeholder="192.168.1.100"
                inputmode="decimal"
                class="!text-base"
              />
            </Form.Item>
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.prefixLength')" required>
              <InputNumber
                v-model:value="form.prefixLength"
                :min="1"
                :max="32"
                class="!w-full"
                inputmode="numeric"
              />
            </Form.Item>
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.gateway')">
              <Input
                v-model:value="form.gateway"
                placeholder="192.168.1.1"
                inputmode="decimal"
                class="!text-base"
              />
            </Form.Item>
          </template>

          <Form.Item :label="$t('page.maintenance.network.wiredConfig.dnsServers')">
            <Input.TextArea
              v-model:value="form.dns"
              :rows="3"
              :placeholder="$t('page.maintenance.network.wiredConfig.dnsHint')"
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
              {{ applying
                ? $t('page.maintenance.network.wiredConfig.applying')
                : $t('page.maintenance.network.wiredConfig.apply') }}
            </Button>
          </Form.Item>
        </Form>
      </template>

      <!-- Mobile confirmation bottom sheet -->
      <Drawer
        v-if="isMobile"
        :open="confirmOpen"
        placement="bottom"
        height="auto"
        :closable="true"
        :title="$t('page.maintenance.network.wiredConfig.apply')"
        class="confirm-sheet"
        @close="confirmOpen = false"
      >
        <p class="mb-4 text-sm text-gray-600">
          {{ $t('page.maintenance.network.confirmSwitchIpMode') }}
        </p>
        <div class="flex gap-3">
          <Button block @click="confirmOpen = false">
            {{ $t('page.maintenance.network.confirmCancel') }}
          </Button>
          <Button type="primary" block :loading="applying" @click="applyConfig">
            {{ $t('page.maintenance.network.confirmAction') }}
          </Button>
        </div>
      </Drawer>
    </div>
  </Spin>
</template>

<style scoped>
.confirm-sheet :deep(.ant-drawer-content-wrapper) {
  border-radius: 12px 12px 0 0;
}

.confirm-sheet :deep(.ant-drawer-body) {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
