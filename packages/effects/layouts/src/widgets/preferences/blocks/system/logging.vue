<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useAppConfig } from '@vben/hooks';
import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';
import { useVbenModal } from '@vben-core/popup-ui';

import { VbenButton } from '@vben-core/shadcn-ui';

import LogDownloadModal from './log-download-modal.vue';
import SelectItem from '../select-item.vue';

type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'TRACE' | 'WARN';

type WebResponse<T> = { code: number; data: T; message?: string };

type GlobalLogLevelView = { baseline: LogLevel };

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const accessStore = useAccessStore();

const loading = ref(false);
const error = ref<string>('');
const desired = ref<LogLevel>('INFO');

const [LogDownloadModalComponent, logDownloadModalApi] = useVbenModal({
  class: 'w-[600px]',
  destroyOnClose: true,
  footer: false,
  title: $t('preferences.system.log.downloadTitle'),
  onCancel() {
    logDownloadModalApi.close();
  },
});

const items = [
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'TRACE', value: 'TRACE' },
];

async function apiFetch<T>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  const token = accessStore.accessToken;
  const resp = await fetch(`${apiURL}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Accept-Language': preferences.app.locale,
      'Accept-Api-Version': 'v1',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await resp.json()) as WebResponse<T>;
  if (json.code !== 0) {
    throw new Error(json.message || `Request failed (code=${json.code})`);
  }
  return json.data;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiFetch<GlobalLogLevelView>('GET', '/logging/level');
    desired.value = data.baseline;
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await apiFetch<GlobalLogLevelView>('PUT', '/logging/level', {
      level: desired.value,
    });
    await reload();
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  reload();
});
</script>

<template>
  <div class="space-y-2">
    <div v-if="error" class="text-xs text-red-500">{{ error }}</div>

    <SelectItem v-model="desired" :disabled="loading" :items="items">
      {{ $t('preferences.system.log.levelLabel') }}
    </SelectItem>

    <div class="flex gap-2 px-2 pt-1">
      <VbenButton size="sm" :disabled="loading" @click="apply">
        {{ $t('preferences.system.log.apply') }}
      </VbenButton>
      <VbenButton size="sm" variant="outline" @click="logDownloadModalApi.open()">
        {{ $t('preferences.system.log.download') }}
      </VbenButton>
    </div>

    <LogDownloadModalComponent>
      <LogDownloadModal @close="logDownloadModalApi.close()" />
    </LogDownloadModalComponent>
  </div>
</template>
