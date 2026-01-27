<script lang="ts" setup>
import type { IdType } from '@vben/types';

import type { ChannelLogLevelView, LogLevel } from '#/api/core/channel';

import { nextTick, ref } from 'vue';

import { confirm, useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Button, message, Spin } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';

import {
  clearChannelLogLevel,
  getChannelLogLevel,
  setChannelLogLevel,
} from '#/api/core/channel';

import LogLevelCountdownProgress from './log-level-countdown-progress.vue';
import {
  useChannelLogLevelFormSchema,
  type ChannelLogLevelFormSchemaOptions,
} from '../schemas/form';

defineOptions({ name: 'ChannelLogLevelModal' });

type ModalData = { channelId: IdType; channelName?: string };

const DEFAULT_TTL_OPTS: ChannelLogLevelFormSchemaOptions = {
  minSeconds: 10,
  maxSeconds: 1800,
  defaultSeconds: 300,
};

const loading = ref(false);
const view = ref<ChannelLogLevelView | null>(null);
const channelName = ref<string>('');
const channelId = ref<IdType>(0 as any);

const [Form, formApi] = useVbenForm({
  schema: useChannelLogLevelFormSchema(DEFAULT_TTL_OPTS),
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/4',
  },
});

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

    const ttl = resp.ttl;
    const ttlOpts: ChannelLogLevelFormSchemaOptions = {
      minSeconds: Math.ceil(ttl.minMs / 1000),
      maxSeconds: Math.floor(ttl.maxMs / 1000),
      defaultSeconds: Math.round(ttl.defaultMs / 1000),
    };
    formApi.setState({ schema: useChannelLogLevelFormSchema(ttlOpts) });

    await formApi.resetForm({
      values: {
        level: resp.override?.level ?? resp.effective,
        ttlSeconds: ttlOpts.defaultSeconds,
      },
    });
  } finally {
    loading.value = false;
  }
}

async function applyOverride() {
  const { valid } = await formApi.validate();
  if (!valid) return;

  const values = await formApi.getValues();
  const level = values?.level as LogLevel;
  const ttlSeconds = Number(values?.ttlSeconds);
  const min = view.value ? Math.ceil(view.value.ttl.minMs / 1000) : 10;
  const max = view.value ? Math.floor(view.value.ttl.maxMs / 1000) : 1800;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < min || ttlSeconds > max) {
    message.error(
      $t('page.southward.channel.logLevelModal.invalidTtl', { min, max }),
    );
    return;
  }

  const name = String(channelName.value || channelId.value);
  const msg = $t('page.southward.channel.logLevelModal.confirmApply', {
    name,
    level,
    seconds: ttlSeconds,
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
          level,
          ttlMs: Math.round(ttlSeconds * 1000),
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
        <LogLevelCountdownProgress
          :override="view?.override ?? null"
          :on-expired="load"
        />
        <Form />

        <div class="flex justify-end gap-2 pt-2">
          <Button @click="modalApi.close()">
            {{ $t('page.southward.channel.logLevelModal.close') }}
          </Button>
          <Button danger @click="clearOverride">
            {{ $t('page.southward.channel.logLevelModal.restore') }}
          </Button>
          <Button type="primary" :loading="loading" @click="applyOverride">
            {{ $t('page.southward.channel.logLevelModal.apply') }}
          </Button>
        </div>
      </div>
    </Spin>
  </Modal>
</template>

