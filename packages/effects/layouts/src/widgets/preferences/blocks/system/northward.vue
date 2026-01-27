<script setup lang="ts">
import type { ApplySystemSettingsResult, SettingField } from './types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import NumberFieldItem from '../number-field-item.vue';
import { useV1Api } from './api';
import CardShell from './card-shell.vue';
import SourceBadge from './source-badge.vue';

type NorthwardSettingsView = {
  queueCapacity: SettingField<number>;
  startTimeoutMs: SettingField<number>;
};

type PatchNorthwardSettingsRequest = Partial<{
  queueCapacity: number;
  startTimeoutMs: number;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: NorthwardSettingsView | null;
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

const view = ref<NorthwardSettingsView | null>(null);
const loaded = reactive({
  queueCapacity: 0,
  startTimeoutMs: 0,
});
const draft = reactive({ ...loaded });

function applyView(v: NorthwardSettingsView) {
  view.value = v;
  loaded.queueCapacity = v.queueCapacity.value;
  loaded.startTimeoutMs = v.startTimeoutMs.value;
  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(
  () =>
    draft.queueCapacity !== loaded.queueCapacity ||
    draft.startTimeoutMs !== loaded.startTimeoutMs,
);

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
    const v = await request<NorthwardSettingsView>(
      'GET',
      '/system/settings/northward',
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
  const patch: PatchNorthwardSettingsRequest = {};

  if (
    !v.queueCapacity.envOverridden &&
    draft.queueCapacity !== loaded.queueCapacity
  ) {
    patch.queueCapacity = draft.queueCapacity;
  }
  if (
    !v.startTimeoutMs.envOverridden &&
    draft.startTimeoutMs !== loaded.startTimeoutMs
  ) {
    patch.startTimeoutMs = draft.startTimeoutMs;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/northward',
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
    :title="$t('preferences.system.northward.title')"
    :description="$t('preferences.system.northward.desc')"
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
        v-model="draft.queueCapacity"
        :disabled="fieldDisabled(view.queueCapacity)"
        :min="1"
        :step="1"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.northward.queueCapacity') }}
          <SourceBadge :field="view.queueCapacity" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.startTimeoutMs"
        :disabled="fieldDisabled(view.startTimeoutMs)"
        :min="1"
        :step="100"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.northward.startTimeoutMs') }}
          <SourceBadge :field="view.startTimeoutMs" />
        </span>
      </NumberFieldItem>
    </template>
  </CardShell>
</template>
