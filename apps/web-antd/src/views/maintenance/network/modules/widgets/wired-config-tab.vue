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
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { configureNetworkInterface, fetchWiredStatus } from '#/api/core';

import { prefixToSubnetMask } from '../schemas';

const props = defineProps<{
  readOnly: boolean;
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

async function applyConfig() {
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
          <div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <IconifyIcon icon="mdi:ethernet" class="text-primary size-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold">{{ bestIface.displayName || bestIface.name }}</span>
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
            <div v-if="bestIface.macAddress" class="text-xs text-gray-400">
              {{ bestIface.macAddress }}
            </div>
          </div>
        </div>

        <Descriptions size="small" :column="{ xs: 1, sm: 2 }" bordered>
          <Descriptions.Item :label="$t('page.maintenance.network.ipAddress')">
            {{ bestIface.ipv4?.addresses?.[0]?.address ?? '—' }}
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
            :span="2"
          >
            {{ bestIface.ipv4.dns.join(', ') }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <!-- Configuration form (only on writable platforms) -->
      <template v-if="!readOnly">
        <Divider orientation="left" class="!my-3 !text-xs">
          {{ $t('page.maintenance.network.wiredConfig.title') }}
        </Divider>

        <Form layout="vertical" class="max-w-lg">
          <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
            <Select v-model:value="form.method" :options="ipModeOptions" />
          </Form.Item>

          <template v-if="isStatic">
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipAddress')" required>
              <Input v-model:value="form.ipAddress" placeholder="192.168.1.100" />
            </Form.Item>
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.prefixLength')" required>
              <InputNumber v-model:value="form.prefixLength" :min="1" :max="32" class="!w-full" />
            </Form.Item>
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.gateway')">
              <Input v-model:value="form.gateway" placeholder="192.168.1.1" />
            </Form.Item>
          </template>

          <Form.Item :label="$t('page.maintenance.network.wiredConfig.dnsServers')">
            <Input.TextArea
              v-model:value="form.dns"
              :rows="3"
              :placeholder="$t('page.maintenance.network.wiredConfig.dnsHint')"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" :loading="applying" @click="applyConfig">
              {{ applying
                ? $t('page.maintenance.network.wiredConfig.applying')
                : $t('page.maintenance.network.wiredConfig.apply') }}
            </Button>
          </Form.Item>
        </Form>
      </template>
    </div>
  </Spin>
</template>
