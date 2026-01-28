<script setup lang="ts">
import type { ApplySystemSettingsResult, SettingField } from './types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import NumberFieldItem from '../number-field-item.vue';
import { useV1Api } from '../../api/v1';
import CardShell from './card-shell.vue';
import SourceBadge from './source-badge.vue';

type SouthwardSettingsView = {
  deviceChangeCacheTtlMs: SettingField<number>;
  maxDevicesPerSnapshotTick: SettingField<number>;
  snapshotGcIntervalMs: SettingField<number>;
  snapshotGcWorkers: SettingField<number>;
  startTimeoutMs: SettingField<number>;
};

type PatchSouthwardSettingsRequest = Partial<{
  deviceChangeCacheTtlMs: number;
  maxDevicesPerSnapshotTick: number;
  snapshotGcIntervalMs: number;
  snapshotGcWorkers: number;
  startTimeoutMs: number;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: null | SouthwardSettingsView;
  }>(),
  {
    initialView: null,
    autoLoad: true,
  },
);

const { request } = useV1Api();

const loading = ref(false);
const error = ref('');
const result = ref<ApplySystemSettingsResult | null>(null);

const view = ref<null | SouthwardSettingsView>(null);
const loaded = reactive({
  startTimeoutMs: 0,
  deviceChangeCacheTtlMs: 0,
  snapshotGcIntervalMs: 0,
  snapshotGcWorkers: 0,
  maxDevicesPerSnapshotTick: 0,
});
const draft = reactive({ ...loaded });

function applyView(v: SouthwardSettingsView) {
  view.value = v;
  loaded.startTimeoutMs = v.startTimeoutMs.value;
  loaded.deviceChangeCacheTtlMs = v.deviceChangeCacheTtlMs.value;
  loaded.snapshotGcIntervalMs = v.snapshotGcIntervalMs.value;
  loaded.snapshotGcWorkers = v.snapshotGcWorkers.value;
  loaded.maxDevicesPerSnapshotTick = v.maxDevicesPerSnapshotTick.value;
  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(() => {
  return (
    draft.startTimeoutMs !== loaded.startTimeoutMs ||
    draft.deviceChangeCacheTtlMs !== loaded.deviceChangeCacheTtlMs ||
    draft.snapshotGcIntervalMs !== loaded.snapshotGcIntervalMs ||
    draft.snapshotGcWorkers !== loaded.snapshotGcWorkers ||
    draft.maxDevicesPerSnapshotTick !== loaded.maxDevicesPerSnapshotTick
  );
});

function reset() {
  Object.assign(draft, loaded);
  result.value = null;
}

function fieldDisabled(f?: SettingField<any>) {
  return Boolean(loading.value || f?.envOverridden);
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const v = await request<SouthwardSettingsView>(
      'GET',
      '/system/settings/southward',
    );
    applyView(v);
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (!view.value) return;
  if (loading.value) return;

  const v = view.value;
  const patch: PatchSouthwardSettingsRequest = {};

  if (
    !v.startTimeoutMs.envOverridden &&
    draft.startTimeoutMs !== loaded.startTimeoutMs
  ) {
    patch.startTimeoutMs = draft.startTimeoutMs;
  }
  if (
    !v.deviceChangeCacheTtlMs.envOverridden &&
    draft.deviceChangeCacheTtlMs !== loaded.deviceChangeCacheTtlMs
  ) {
    patch.deviceChangeCacheTtlMs = draft.deviceChangeCacheTtlMs;
  }
  if (
    !v.snapshotGcIntervalMs.envOverridden &&
    draft.snapshotGcIntervalMs !== loaded.snapshotGcIntervalMs
  ) {
    patch.snapshotGcIntervalMs = draft.snapshotGcIntervalMs;
  }
  if (
    !v.snapshotGcWorkers.envOverridden &&
    draft.snapshotGcWorkers !== loaded.snapshotGcWorkers
  ) {
    patch.snapshotGcWorkers = draft.snapshotGcWorkers;
  }
  if (
    !v.maxDevicesPerSnapshotTick.envOverridden &&
    draft.maxDevicesPerSnapshotTick !== loaded.maxDevicesPerSnapshotTick
  ) {
    patch.maxDevicesPerSnapshotTick = draft.maxDevicesPerSnapshotTick;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/southward',
      patch,
    );
    result.value = r;
    await reload();
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

if (props.initialView) {
  applyView(props.initialView);
}
if (props.autoLoad && !props.initialView) {
  reload();
}
</script>

<template>
  <CardShell
    :title="$t('preferences.system.southward.title')"
    :description="$t('preferences.system.southward.desc')"
    :loading="loading"
    :dirty="dirty"
    :error="error"
    :result="result"
    @reload="reload"
    @reset="reset"
    @apply="apply"
  >
    <template v-if="view">
      <NumberFieldItem
        v-model="draft.startTimeoutMs"
        :disabled="fieldDisabled(view.startTimeoutMs)"
        :min="1"
        :max="300000"
        :step="100"
        :tip="$t('preferences.system.southward.startTimeoutMsTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.southward.startTimeoutMs') }}
          <SourceBadge :field="view.startTimeoutMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.deviceChangeCacheTtlMs"
        :disabled="fieldDisabled(view.deviceChangeCacheTtlMs)"
        :min="0"
        :step="1000"
        :tip="$t('preferences.system.southward.deviceChangeCacheTtlMsTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.southward.deviceChangeCacheTtlMs') }}
          <SourceBadge :field="view.deviceChangeCacheTtlMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.snapshotGcIntervalMs"
        :disabled="fieldDisabled(view.snapshotGcIntervalMs)"
        :min="200"
        :max="300000"
        :step="200"
        :tip="$t('preferences.system.southward.snapshotGcIntervalMsTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.southward.snapshotGcIntervalMs') }}
          <SourceBadge :field="view.snapshotGcIntervalMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.snapshotGcWorkers"
        :disabled="fieldDisabled(view.snapshotGcWorkers)"
        :min="1"
        :max="16"
        :step="1"
        :tip="$t('preferences.system.southward.snapshotGcWorkersTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.southward.snapshotGcWorkers') }}
          <SourceBadge :field="view.snapshotGcWorkers" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.maxDevicesPerSnapshotTick"
        :disabled="fieldDisabled(view.maxDevicesPerSnapshotTick)"
        :min="1"
        :max="10000"
        :step="10"
        :tip="$t('preferences.system.southward.maxDevicesPerSnapshotTickTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.southward.maxDevicesPerSnapshotTick') }}
          <SourceBadge :field="view.maxDevicesPerSnapshotTick" />
        </span>
      </NumberFieldItem>
    </template>
  </CardShell>
</template>
