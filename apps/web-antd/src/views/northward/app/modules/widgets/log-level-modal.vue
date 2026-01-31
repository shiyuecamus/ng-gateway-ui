<script lang="ts" setup>
import type { AppLogLevelView, IdType, LogLevel } from '@vben/types';

import type { AppLogLevelFormSchemaOptions } from '../schemas';

import { nextTick, ref } from 'vue';

import { confirm, useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Button, message, Spin } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  clearAppLogLevel,
  getAppLogLevel,
  setAppLogLevel,
} from '#/api/core/app';

import { useAppLogLevelFormSchema } from '../schemas';
import LogLevelCountdownProgress from './log-level-countdown-progress.vue';

defineOptions({ name: 'AppLogLevelModal' });

type ModalData = { appId: IdType; appName?: string };

const DEFAULT_TTL_OPTS: AppLogLevelFormSchemaOptions = {
  minSeconds: 10,
  maxSeconds: 1800,
  defaultSeconds: 300,
};

const loading = ref(false);
const view = ref<AppLogLevelView | null>(null);
const appName = ref<string>('');
const appId = ref<IdType>(0 as any);

const [Form, formApi] = useVbenForm({
  schema: useAppLogLevelFormSchema(DEFAULT_TTL_OPTS),
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
  appId.value = data.appId;
  appName.value = data.appName ?? '';

  loading.value = true;
  try {
    const resp = await getAppLogLevel(data.appId);
    view.value = resp;

    const ttl = resp.ttl;
    const ttlOpts: AppLogLevelFormSchemaOptions = {
      minSeconds: Math.ceil(ttl.minMs / 1000),
      maxSeconds: Math.floor(ttl.maxMs / 1000),
      defaultSeconds: Math.round(ttl.defaultMs / 1000),
    };
    formApi.setState({ schema: useAppLogLevelFormSchema(ttlOpts) });

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
      $t('page.northward.app.logLevelModal.invalidTtl', { min, max }),
    );
    return;
  }

  const name = String(appName.value || appId.value);
  const msg = $t('page.northward.app.logLevelModal.confirmApply', {
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
        await setAppLogLevel(appId.value, {
          level,
          ttlMs: Math.round(ttlSeconds * 1000),
        });
        message.success($t('page.northward.app.logLevelModal.applied'));
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
    message.info($t('page.northward.app.logLevelModal.noOverride'));
    return;
  }
  const name = String(appName.value || appId.value);
  confirm({
    title: $t('common.tips'),
    icon: 'warning',
    content: $t('page.northward.app.logLevelModal.confirmRestore', {
      name,
    }),
  })
    .then(async () => {
      loading.value = true;
      try {
        await clearAppLogLevel(appId.value);
        message.success($t('page.northward.app.logLevelModal.restored'));
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
            {{ $t('page.northward.app.logLevelModal.close') }}
          </Button>
          <Button danger @click="clearOverride">
            {{ $t('page.northward.app.logLevelModal.restore') }}
          </Button>
          <Button type="primary" :loading="loading" @click="applyOverride">
            {{ $t('page.northward.app.logLevelModal.apply') }}
          </Button>
        </div>
      </div>
    </Spin>
  </Modal>
</template>
