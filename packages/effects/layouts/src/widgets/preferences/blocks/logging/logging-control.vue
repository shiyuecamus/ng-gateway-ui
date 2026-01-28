<script setup lang="ts">
/**
 * Channel override TTL configuration.
 *
 * This card is wired to `/system/settings/logging_control`.
 */
import type { ApplySystemSettingsResult, SettingField } from '../system/types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import NumberFieldItem from '../number-field-item.vue';
import { useV1Api } from '../../api/v1';
import CardShell from '../system/card-shell.vue';
import SourceBadge from '../system/source-badge.vue';

type LoggingControlSettingsView = {
  channelOverrideDefaultTtlMs: SettingField<number>;
  channelOverrideMaxTtlMs: SettingField<number>;
  channelOverrideMinTtlMs: SettingField<number>;
  driverIngestQueueCapacity: SettingField<number>;
  overrideCleanupIntervalMs: SettingField<number>;
};

type PatchLoggingControlSettingsRequest = Partial<{
  channelOverrideDefaultTtlMs: number;
  channelOverrideMaxTtlMs: number;
  channelOverrideMinTtlMs: number;
  driverIngestQueueCapacity: number;
  overrideCleanupIntervalMs: number;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: LoggingControlSettingsView | null;
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

const view = ref<LoggingControlSettingsView | null>(null);
const loaded = reactive({
  channelOverrideMinTtlMs: 10_000,
  channelOverrideDefaultTtlMs: 300_000,
  channelOverrideMaxTtlMs: 1_800_000,
  overrideCleanupIntervalMs: 5_000,
  driverIngestQueueCapacity: 10_000,
});
const draft = reactive({ ...loaded });

function applyView(v: LoggingControlSettingsView) {
  view.value = v;
  loaded.channelOverrideMinTtlMs = v.channelOverrideMinTtlMs.value;
  loaded.channelOverrideDefaultTtlMs = v.channelOverrideDefaultTtlMs.value;
  loaded.channelOverrideMaxTtlMs = v.channelOverrideMaxTtlMs.value;
  loaded.overrideCleanupIntervalMs = v.overrideCleanupIntervalMs.value;
  loaded.driverIngestQueueCapacity = v.driverIngestQueueCapacity.value;
  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(() => {
  return (
    draft.channelOverrideMinTtlMs !== loaded.channelOverrideMinTtlMs ||
    draft.channelOverrideDefaultTtlMs !== loaded.channelOverrideDefaultTtlMs ||
    draft.channelOverrideMaxTtlMs !== loaded.channelOverrideMaxTtlMs ||
    draft.overrideCleanupIntervalMs !== loaded.overrideCleanupIntervalMs ||
    draft.driverIngestQueueCapacity !== loaded.driverIngestQueueCapacity
  );
});

function reset() {
  Object.assign(draft, loaded);
  result.value = null;
}

function fieldDisabled(f?: SettingField<any>) {
  return Boolean(loading.value || f?.envOverridden);
}

const localValidationError = computed(() => {
  // Keep client-side checks aligned with server-side validation.
  if (draft.channelOverrideMinTtlMs <= 0) return $t('preferences.system.loggingControl.errMin');
  if (draft.channelOverrideMaxTtlMs <= 0) return $t('preferences.system.loggingControl.errMax');
  if (draft.channelOverrideDefaultTtlMs <= 0)
    return $t('preferences.system.loggingControl.errDefault');
  if (draft.overrideCleanupIntervalMs < 200)
    return $t('preferences.system.loggingControl.errCleanupInterval');
  if (draft.driverIngestQueueCapacity <= 0)
    return $t('preferences.system.loggingControl.errDriverQueue');
  if (draft.channelOverrideMaxTtlMs < draft.channelOverrideMinTtlMs)
    return $t('preferences.system.loggingControl.errRange');
  if (
    draft.channelOverrideDefaultTtlMs < draft.channelOverrideMinTtlMs ||
    draft.channelOverrideDefaultTtlMs > draft.channelOverrideMaxTtlMs
  ) {
    return $t('preferences.system.loggingControl.errDefaultRange');
  }
  return '';
});

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const v = await request<LoggingControlSettingsView>(
      'GET',
      '/system/settings/logging_control',
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
  if (!dirty.value) return;
  if (localValidationError.value) return;

  const v = view.value;
  const patch: PatchLoggingControlSettingsRequest = {};

  if (
    !v.channelOverrideMinTtlMs.envOverridden &&
    draft.channelOverrideMinTtlMs !== loaded.channelOverrideMinTtlMs
  ) {
    patch.channelOverrideMinTtlMs = draft.channelOverrideMinTtlMs;
  }
  if (
    !v.channelOverrideDefaultTtlMs.envOverridden &&
    draft.channelOverrideDefaultTtlMs !== loaded.channelOverrideDefaultTtlMs
  ) {
    patch.channelOverrideDefaultTtlMs = draft.channelOverrideDefaultTtlMs;
  }
  if (
    !v.channelOverrideMaxTtlMs.envOverridden &&
    draft.channelOverrideMaxTtlMs !== loaded.channelOverrideMaxTtlMs
  ) {
    patch.channelOverrideMaxTtlMs = draft.channelOverrideMaxTtlMs;
  }
  if (
    !v.overrideCleanupIntervalMs.envOverridden &&
    draft.overrideCleanupIntervalMs !== loaded.overrideCleanupIntervalMs
  ) {
    patch.overrideCleanupIntervalMs = draft.overrideCleanupIntervalMs;
  }
  if (
    !v.driverIngestQueueCapacity.envOverridden &&
    draft.driverIngestQueueCapacity !== loaded.driverIngestQueueCapacity
  ) {
    patch.driverIngestQueueCapacity = draft.driverIngestQueueCapacity;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/logging_control',
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
    :title="$t('preferences.system.loggingControl.title')"
    :description="$t('preferences.system.loggingControl.desc')"
    :loading="loading"
    :dirty="dirty"
    :error="error || localValidationError"
    :result="result"
    @reload="reload"
    @reset="reset"
    @apply="apply"
  >
    <template v-if="view">
      <NumberFieldItem
        v-model="draft.channelOverrideMinTtlMs"
        :disabled="fieldDisabled(view.channelOverrideMinTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.minTtlMs') }}
          <SourceBadge :field="view.channelOverrideMinTtlMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.channelOverrideDefaultTtlMs"
        :disabled="fieldDisabled(view.channelOverrideDefaultTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.defaultTtlMs') }}
          <SourceBadge :field="view.channelOverrideDefaultTtlMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.channelOverrideMaxTtlMs"
        :disabled="fieldDisabled(view.channelOverrideMaxTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.maxTtlMs') }}
          <SourceBadge :field="view.channelOverrideMaxTtlMs" />
        </span>
      </NumberFieldItem>

      <div class="bg-muted/20 mt-3 rounded-md border p-3">
        <div class="text-muted-foreground mb-2 text-xs font-medium">
          {{ $t('preferences.system.loggingControl.advancedTitle') }}
        </div>

        <NumberFieldItem
          v-model="draft.overrideCleanupIntervalMs"
          :disabled="fieldDisabled(view.overrideCleanupIntervalMs)"
          :min="200"
          :max="300000"
          :step="100"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingControl.overrideCleanupIntervalMs') }}
            <SourceBadge :field="view.overrideCleanupIntervalMs" />
          </span>
          <template #tip>
            {{ $t('preferences.system.loggingControl.overrideCleanupIntervalMsTip') }}
          </template>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.driverIngestQueueCapacity"
          :disabled="fieldDisabled(view.driverIngestQueueCapacity)"
          :min="1"
          :max="1000000"
          :step="100"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingControl.driverIngestQueueCapacity') }}
            <SourceBadge :field="view.driverIngestQueueCapacity" />
          </span>
          <template #tip>
            {{ $t('preferences.system.loggingControl.driverIngestQueueCapacityTip') }}
          </template>
        </NumberFieldItem>
      </div>
    </template>
  </CardShell>
</template>

