<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { useAppConfig } from '@vben/hooks';
import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { VbenButton } from '@vben-core/shadcn-ui';

import SelectItem from '../select-item.vue';

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

type WebResponse<T> = { code: number; data: T; message?: string };

type GlobalLogLevelView = {
  baseline: LogLevel;
  effective: LogLevel;
  channelOverrideTtl: { minMs: number; maxMs: number; defaultMs: number };
};

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const accessStore = useAccessStore();

const loading = ref(false);
const error = ref<string>('');
const view = ref<GlobalLogLevelView | null>(null);
const desired = ref<LogLevel>('INFO');

const items = [
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'TRACE', value: 'TRACE' },
];

const ttlText = computed(() => {
  const ttl = view.value?.channelOverrideTtl;
  if (!ttl) return '';
  const min = Math.ceil(ttl.minMs / 1000);
  const max = Math.floor(ttl.maxMs / 1000);
  const def = Math.round(ttl.defaultMs / 1000);
  return $t('preferences.system.log.channelTtlRange', { min, max, def });
});

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
    view.value = data;
    desired.value = data.baseline;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await apiFetch<GlobalLogLevelView>('PUT', '/logging/level', {
      level: desired.value,
    });
    view.value = data;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
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

    <div class="text-muted-foreground text-xs">
      <div v-if="view">
        {{
          $t('preferences.system.log.baselineEffective', {
            baseline: view.baseline,
            effective: view.effective,
          })
        }}
      </div>
      <div v-if="ttlText">{{ ttlText }}</div>
      <div class="mt-1">
        {{ $t('preferences.system.log.tip') }}
      </div>
    </div>

    <SelectItem v-model="desired" :disabled="loading" :items="items">
      {{ $t('preferences.system.log.levelLabel') }}
    </SelectItem>

    <div class="flex gap-2 px-2 pt-1">
      <VbenButton
        size="sm"
        variant="secondary"
        :disabled="loading"
        @click="reload"
      >
        {{ $t('preferences.system.log.refresh') }}
      </VbenButton>
      <VbenButton size="sm" :disabled="loading" @click="apply">
        {{ $t('preferences.system.log.apply') }}
      </VbenButton>
    </div>
  </div>
</template>
