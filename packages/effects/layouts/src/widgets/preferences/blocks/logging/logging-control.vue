<script setup lang="ts">
/**
 * Channel override TTL configuration.
 *
 * This card is wired to `/system/settings/logging_control`.
 */
import type { ApplySystemSettingsResult, SettingField } from '../system/types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import { useV1Api } from '../../api/v1';
import NumberFieldItem from '../number-field-item.vue';
import CardShell from '../system/card-shell.vue';
import SourceBadge from '../system/source-badge.vue';

type LoggingControlSettingsView = {
  ingestQueueCapacity: SettingField<number>;
  overrideCleanupIntervalMs: SettingField<number>;
  overrideDefaultTtlMs: SettingField<number>;
  overrideMaxTtlMs: SettingField<number>;
  overrideMinTtlMs: SettingField<number>;
};

type PatchLoggingControlSettingsRequest = Partial<{
  ingestQueueCapacity: number;
  overrideCleanupIntervalMs: number;
  overrideDefaultTtlMs: number;
  overrideMaxTtlMs: number;
  overrideMinTtlMs: number;
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
  overrideMinTtlMs: 10_000,
  overrideDefaultTtlMs: 300_000,
  overrideMaxTtlMs: 1_800_000,
  overrideCleanupIntervalMs: 5000,
  ingestQueueCapacity: 10_000,
});
const draft = reactive({ ...loaded });

function applyView(v: LoggingControlSettingsView) {
  view.value = v;
  loaded.overrideMinTtlMs = v.overrideMinTtlMs.value;
  loaded.overrideDefaultTtlMs = v.overrideDefaultTtlMs.value;
  loaded.overrideMaxTtlMs = v.overrideMaxTtlMs.value;
  loaded.overrideCleanupIntervalMs = v.overrideCleanupIntervalMs.value;
  loaded.ingestQueueCapacity = v.ingestQueueCapacity.value;
  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(() => {
  return (
    draft.overrideMinTtlMs !== loaded.overrideMinTtlMs ||
    draft.overrideDefaultTtlMs !== loaded.overrideDefaultTtlMs ||
    draft.overrideMaxTtlMs !== loaded.overrideMaxTtlMs ||
    draft.overrideCleanupIntervalMs !== loaded.overrideCleanupIntervalMs ||
    draft.ingestQueueCapacity !== loaded.ingestQueueCapacity
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
  if (draft.overrideMinTtlMs <= 0)
    return $t('preferences.system.loggingControl.errMin');
  if (draft.overrideMaxTtlMs <= 0)
    return $t('preferences.system.loggingControl.errMax');
  if (draft.overrideDefaultTtlMs <= 0)
    return $t('preferences.system.loggingControl.errDefault');
  if (draft.overrideCleanupIntervalMs < 200)
    return $t('preferences.system.loggingControl.errCleanupInterval');
  if (draft.ingestQueueCapacity <= 0)
    return $t('preferences.system.loggingControl.errIngestQueue');
  if (draft.overrideMaxTtlMs < draft.overrideMinTtlMs)
    return $t('preferences.system.loggingControl.errRange');
  if (
    draft.overrideDefaultTtlMs < draft.overrideMinTtlMs ||
    draft.overrideDefaultTtlMs > draft.overrideMaxTtlMs
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
    !v.overrideMinTtlMs.envOverridden &&
    draft.overrideMinTtlMs !== loaded.overrideMinTtlMs
  ) {
    patch.overrideMinTtlMs = draft.overrideMinTtlMs;
  }
  if (
    !v.overrideDefaultTtlMs.envOverridden &&
    draft.overrideDefaultTtlMs !== loaded.overrideDefaultTtlMs
  ) {
    patch.overrideDefaultTtlMs = draft.overrideDefaultTtlMs;
  }
  if (
    !v.overrideMaxTtlMs.envOverridden &&
    draft.overrideMaxTtlMs !== loaded.overrideMaxTtlMs
  ) {
    patch.overrideMaxTtlMs = draft.overrideMaxTtlMs;
  }
  if (
    !v.overrideCleanupIntervalMs.envOverridden &&
    draft.overrideCleanupIntervalMs !== loaded.overrideCleanupIntervalMs
  ) {
    patch.overrideCleanupIntervalMs = draft.overrideCleanupIntervalMs;
  }
  if (
    !v.ingestQueueCapacity.envOverridden &&
    draft.ingestQueueCapacity !== loaded.ingestQueueCapacity
  ) {
    patch.ingestQueueCapacity = draft.ingestQueueCapacity;
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
        v-model="draft.overrideMinTtlMs"
        :disabled="fieldDisabled(view.overrideMinTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.minTtlMs') }}
          <SourceBadge :field="view.overrideMinTtlMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.overrideDefaultTtlMs"
        :disabled="fieldDisabled(view.overrideDefaultTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.defaultTtlMs') }}
          <SourceBadge :field="view.overrideDefaultTtlMs" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.overrideMaxTtlMs"
        :disabled="fieldDisabled(view.overrideMaxTtlMs)"
        :min="1"
        :step="1000"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingControl.maxTtlMs') }}
          <SourceBadge :field="view.overrideMaxTtlMs" />
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
            {{
              $t('preferences.system.loggingControl.overrideCleanupIntervalMs')
            }}
            <SourceBadge :field="view.overrideCleanupIntervalMs" />
          </span>
          <template #tip>
            {{
              $t(
                'preferences.system.loggingControl.overrideCleanupIntervalMsTip',
              )
            }}
          </template>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.ingestQueueCapacity"
          :disabled="fieldDisabled(view.ingestQueueCapacity)"
          :min="1"
          :max="1000000"
          :step="100"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingControl.ingestQueueCapacity') }}
            <SourceBadge :field="view.ingestQueueCapacity" />
          </span>
          <template #tip>
            {{ $t('preferences.system.loggingControl.ingestQueueCapacityTip') }}
          </template>
        </NumberFieldItem>
      </div>
    </template>
  </CardShell>
</template>
