<script lang="ts" setup>
import type { DnsConfig } from '@vben/types';

import { onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, Form, Input, message, Space, Spin } from 'ant-design-vue';

import { configureDns, fetchDnsConfig } from '#/api/core';

defineProps<{
  readOnly: boolean;
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
    <Form layout="vertical" class="max-w-lg">
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
              :disabled="readOnly"
              class="flex-1"
            />
            <Button
              v-if="!readOnly"
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

      <Form.Item v-if="!readOnly">
        <Space>
          <Button @click="addServer">
            {{ $t('page.maintenance.network.dnsConfig.addServer') }}
          </Button>
          <Button type="primary" :loading="applying" @click="applyDns">
            {{ applying
              ? $t('page.maintenance.network.dnsConfig.applying')
              : $t('page.maintenance.network.dnsConfig.apply') }}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  </Spin>
</template>
