<script lang="ts" setup>
import type { IdType } from '@vben/types';

import { computed, nextTick, ref } from 'vue';

import { confirm, useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  InputNumber,
  Select,
  Space,
  Spin,
  message,
} from 'ant-design-vue';

import {
  clearChannelLogLevel,
  getChannelLogLevel,
  setChannelLogLevel,
  type ChannelLogLevelView,
  type LogLevel,
} from '#/api/core/channel';

defineOptions({ name: 'ChannelLogLevelModal' });

type ModalData = { channelId: IdType; channelName?: string };

const loading = ref(false);
const view = ref<ChannelLogLevelView | null>(null);
const channelName = ref<string>('');
const channelId = ref<IdType>(0 as any);

const level = ref<LogLevel>('INFO');
const ttlSeconds = ref<number>(300);

const ttlPolicy = computed(() => view.value?.ttl);
const ttlMinSeconds = computed(() =>
  ttlPolicy.value ? Math.ceil(ttlPolicy.value.minMs / 1000) : 10,
);
const ttlMaxSeconds = computed(() =>
  ttlPolicy.value ? Math.floor(ttlPolicy.value.maxMs / 1000) : 1800,
);
const ttlDefaultSeconds = computed(() =>
  ttlPolicy.value ? Math.round(ttlPolicy.value.defaultMs / 1000) : 300,
);

const ttlMs = computed(() => Math.round((ttlSeconds.value ?? 0) * 1000));

const levelOptions: Array<{ label: string; value: LogLevel }> = [
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'TRACE', value: 'TRACE' },
];

const [Modal, modalApi] = useVbenModal({
  class: 'w-[520px]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    await load();
  },
});

async function load() {
  const data = modalApi.getData<ModalData>();
  channelId.value = data.channelId;
  channelName.value = data.channelName ?? '';

  loading.value = true;
  try {
    const resp = await getChannelLogLevel(data.channelId);
    view.value = resp;

    // Default to current override level if any; otherwise use effective.
    level.value = resp.override?.level ?? resp.effective;

    // Default TTL: server default.
    ttlSeconds.value = ttlDefaultSeconds.value;
  } finally {
    loading.value = false;
  }
}

function validateTtlOrThrow() {
  const min = ttlMinSeconds.value;
  const max = ttlMaxSeconds.value;
  const v = Number(ttlSeconds.value);
  if (!Number.isFinite(v)) {
    throw new Error($t('page.southward.channel.logLevelModal.ttlNotNumber'));
  }
  if (v < min || v > max) {
    throw new Error(
      $t('page.southward.channel.logLevelModal.invalidTtl', { min, max }),
    );
  }
}

async function applyOverride() {
  if (!view.value) return;
  try {
    validateTtlOrThrow();
  } catch (e: any) {
    message.error(e?.message ?? String(e));
    return;
  }

  const seconds = Number(ttlSeconds.value);
  const name = String(channelName.value || channelId.value);
  const msg = $t('page.southward.channel.logLevelModal.confirmApply', {
    name,
    level: level.value,
    seconds,
  });

  confirm({
    title: $t('common.tips'),
    icon: 'warning',
    content: msg,
  })
    .then(async () => {
      loading.value = true;
      try {
        await setChannelLogLevel(channelId.value, {
          level: level.value,
          ttlMs: ttlMs.value,
        });
        message.success($t('page.southward.channel.logLevelModal.applied'));
        await load();
      } finally {
        loading.value = false;
      }
    })
    .catch(() => {});
}

async function clearOverride() {
  if (!view.value) return;
  if (!view.value.override) {
    message.info($t('page.southward.channel.logLevelModal.noOverride'));
    return;
  }
  const name = String(channelName.value || channelId.value);
  confirm({
    title: $t('common.tips'),
    icon: 'warning',
    content: $t('page.southward.channel.logLevelModal.confirmRestore', {
      name,
    }),
  })
    .then(async () => {
      loading.value = true;
      try {
        await clearChannelLogLevel(channelId.value);
        message.success($t('page.southward.channel.logLevelModal.restored'));
        await load();
      } finally {
        loading.value = false;
      }
    })
    .catch(() => {});
}
</script>

<template>
  <Modal>
    <Spin :spinning="loading">
      <div class="space-y-4">
        <Alert
          type="info"
          show-icon
          :message="$t('page.southward.channel.logLevelModal.tipTitle')"
          :description="$t('page.southward.channel.logLevelModal.tipDesc')"
        />

        <div class="text-sm">
          <div>
            <span class="font-medium">
              {{ $t('page.southward.channel.logLevelModal.channel') }}：
            </span>
            <span>{{ channelName || channelId }}</span>
          </div>
          <div v-if="view">
            <span class="font-medium">
              {{ $t('page.southward.channel.logLevelModal.effectiveLevel') }}：
            </span>
            <span>{{ view.effective }}</span>
          </div>
          <div v-if="view?.override">
            <span class="font-medium">
              {{ $t('page.southward.channel.logLevelModal.override') }}：
            </span>
            <span>{{ view.override.level }}</span>
            <span class="ml-2 text-xs text-gray-500">
              {{ $t('page.southward.channel.logLevelModal.expiresAt') }}：{{
                new Date(view.override.expiresAtMs).toLocaleString()
              }}
            </span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">
            {{ $t('page.southward.channel.logLevelModal.setTitle') }}
          </div>
          <Space>
            <Select
              v-model:value="level"
              style="width: 140px"
              :options="levelOptions"
            />
            <div class="text-sm text-gray-500">
              {{ $t('page.southward.channel.logLevelModal.ttlSeconds') }}：
              <InputNumber
                v-model:value="ttlSeconds"
                :min="ttlMinSeconds"
                :max="ttlMaxSeconds"
                :step="10"
              />
              <span class="ml-2">
                {{
                  $t('page.southward.channel.logLevelModal.ttlRange', {
                    min: ttlMinSeconds,
                    max: ttlMaxSeconds,
                    def: ttlDefaultSeconds,
                  })
                }}
              </span>
            </div>
          </Space>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button @click="modalApi.close()">
            {{ $t('page.southward.channel.logLevelModal.close') }}
          </Button>
          <Button danger @click="clearOverride">
            {{ $t('page.southward.channel.logLevelModal.restore') }}
          </Button>
          <Button type="primary" @click="applyOverride">
            {{ $t('page.southward.channel.logLevelModal.apply') }}
          </Button>
        </div>
      </div>
    </Spin>
  </Modal>
</template>
