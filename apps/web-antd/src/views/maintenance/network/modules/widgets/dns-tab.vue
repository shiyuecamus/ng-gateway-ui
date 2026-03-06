<script lang="ts" setup>
import type { DnsConfig } from '@vben/types';

import { onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, Form, Input, message, Spin } from 'ant-design-vue';

import { configureDns, fetchDnsConfig } from '#/api/core';

const props = defineProps<{
  readOnly: boolean;
  isMobile: boolean;
}>();

const { handleRequest } = useRequestHandler();

const loading = ref(false);
const applying = ref(false);
const servers = ref<string[]>([]);

async function loadDns() {
  loading.value = true;
  await handleRequest(
    () => fetchDnsConfig(),
    (data: DnsConfig) => {
      servers.value =
        data.servers.length > 0 ? data.servers.map(String) : [''];
    },
  );
  loading.value = false;
}

function addServer() {
  servers.value.push('');
}

function removeServer(index: number) {
  servers.value.splice(index, 1);
  if (servers.value.length === 0) {
    servers.value.push('');
  }
}

async function applyDns() {
  applying.value = true;
  const validServers = servers.value
    .map((s) => s.trim())
    .filter(Boolean);

  await handleRequest(
    () => configureDns({ servers: validServers }),
    () => {
      message.success($t('page.maintenance.network.dnsConfig.applySuccess'));
    },
  );
  applying.value = false;
}

onMounted(() => {
  loadDns();
});
</script>

<template>
  <Spin :spinning="loading">
    <Form layout="vertical" :class="props.isMobile ? 'w-full' : 'max-w-lg'">
      <Form.Item :label="$t('page.maintenance.network.dnsConfig.globalDns')">
        <div class="flex flex-col gap-2">
          <div
            v-for="(_, index) in servers"
            :key="index"
            class="flex items-center gap-2"
          >
            <Input
              v-model:value="servers[index]"
              :placeholder="$t('page.maintenance.network.dnsConfig.placeholder')"
              :disabled="props.readOnly"
              class="flex-1 !text-base"
              inputmode="decimal"
            />
            <Button
              v-if="!props.readOnly"
              type="text"
              danger
              size="small"
              :disabled="servers.length <= 1"
              @click="removeServer(index)"
            >
              {{ $t('page.maintenance.network.dnsConfig.removeServer') }}
            </Button>
          </div>
        </div>
      </Form.Item>

      <Form.Item v-if="!props.readOnly">
        <div :class="props.isMobile ? 'flex flex-col gap-2' : 'flex gap-2'">
          <Button :block="props.isMobile" @click="addServer">
            {{ $t('page.maintenance.network.dnsConfig.addServer') }}
          </Button>
          <Button
            type="primary"
            :loading="applying"
            :block="props.isMobile"
            @click="applyDns"
          >
            {{ applying
              ? $t('page.maintenance.network.dnsConfig.applying')
              : $t('page.maintenance.network.dnsConfig.apply') }}
          </Button>
        </div>
      </Form.Item>
    </Form>
  </Spin>
</template>
