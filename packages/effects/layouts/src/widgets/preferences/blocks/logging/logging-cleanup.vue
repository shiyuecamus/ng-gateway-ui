<script setup lang="ts">
import type { ApplySystemSettingsResult, SettingField } from '../system/types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import NumberFieldItem from '../number-field-item.vue';
import SwitchItem from '../switch-item.vue';
import { useV1Api } from '../../api/v1';
import CardShell from '../system/card-shell.vue';
import SourceBadge from '../system/source-badge.vue';

type LoggingCleanupSettingsView = {
  enabled: SettingField<boolean>;
  intervalMs: SettingField<number>;
};

type PatchLoggingCleanupSettingsRequest = Partial<{
  enabled: boolean;
  intervalMs: number;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: LoggingCleanupSettingsView | null;
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

const view = ref<LoggingCleanupSettingsView | null>(null);
const loaded = reactive({
  enabled: false,
  intervalMs: 60_000,
});
const draft = reactive({ ...loaded });

function applyView(v: LoggingCleanupSettingsView) {
  view.value = v;
  loaded.enabled = v.enabled.value;
  loaded.intervalMs = v.intervalMs.value;
  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(
  () => draft.enabled !== loaded.enabled || draft.intervalMs !== loaded.intervalMs,
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
    const v = await request<LoggingCleanupSettingsView>(
      'GET',
      '/system/settings/logging_cleanup',
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
  const patch: PatchLoggingCleanupSettingsRequest = {};

  if (!v.enabled.envOverridden && draft.enabled !== loaded.enabled) {
    patch.enabled = draft.enabled;
  }
  if (!v.intervalMs.envOverridden && draft.intervalMs !== loaded.intervalMs) {
    patch.intervalMs = draft.intervalMs;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/logging_cleanup',
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
    :title="$t('preferences.system.loggingCleanup.title')"
    :description="$t('preferences.system.loggingCleanup.desc')"
    :loading="loading"
    :dirty="dirty"
    :error="error"
    :result="result"
    @reload="reload"
    @reset="reset"
    @apply="apply"
  >
    <template v-if="view">
      <SwitchItem v-model="draft.enabled" :disabled="fieldDisabled(view.enabled)">
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingCleanup.enabled') }}
          <SourceBadge :field="view.enabled" />
        </span>
      </SwitchItem>

      <NumberFieldItem
        v-model="draft.intervalMs"
        :disabled="fieldDisabled(view.intervalMs)"
        :min="1"
        :step="1000"
        :tip="$t('preferences.system.loggingCleanup.intervalMsTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingCleanup.intervalMs') }}
          <SourceBadge :field="view.intervalMs" />
        </span>
      </NumberFieldItem>
    </template>
  </CardShell>
</template>

