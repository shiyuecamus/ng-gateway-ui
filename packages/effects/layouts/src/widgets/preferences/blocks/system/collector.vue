<script setup lang="ts">
import type { ApplySystemSettingsResult, SettingField } from './types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import NumberFieldItem from '../number-field-item.vue';
import SwitchItem from '../switch-item.vue';
import { useV1Api } from './api';
import CardShell from './card-shell.vue';
import SourceBadge from './source-badge.vue';

type RetryPolicySettingsView = {
  initialIntervalMs: SettingField<number>;
  maxAttempts: SettingField<null | number>;
  maxElapsedTimeMs: SettingField<null | number>;
  maxIntervalMs: SettingField<number>;
  multiplier: SettingField<number>;
  randomizationFactor: SettingField<number>;
};

type CollectorSettingsView = {
  collectionTimeoutMs: SettingField<number>;
  maxConcurrentCollections: SettingField<number>;
  outboundQueueCapacity: SettingField<number>;
  retryPolicy: RetryPolicySettingsView;
};

type PatchRetryPolicyRequest = Partial<{
  initialIntervalMs: number;
  maxAttempts: null | number;
  maxElapsedTimeMs: null | number;
  maxIntervalMs: number;
  multiplier: number;
  randomizationFactor: number;
}>;

type PatchCollectorSettingsRequest = Partial<{
  collectionTimeoutMs: number;
  maxConcurrentCollections: number;
  outboundQueueCapacity: number;
  retryPolicy: PatchRetryPolicyRequest;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: CollectorSettingsView | null;
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

const view = ref<CollectorSettingsView | null>(null);
const loaded = reactive({
  collectionTimeoutMs: 0,
  maxConcurrentCollections: 0,
  outboundQueueCapacity: 0,
  maxAttemptsUnlimited: false,
  maxAttempts: 0,
  initialIntervalMs: 0,
  maxIntervalMs: 0,
  randomizationFactor: 0,
  multiplier: 0,
  maxElapsedUnlimited: false,
  maxElapsedTimeMs: 0,
});

const draft = reactive({ ...loaded });

function applyView(v: CollectorSettingsView) {
  view.value = v;

  loaded.collectionTimeoutMs = v.collectionTimeoutMs.value;
  loaded.maxConcurrentCollections = v.maxConcurrentCollections.value;
  loaded.outboundQueueCapacity = v.outboundQueueCapacity.value;

  loaded.maxAttemptsUnlimited = v.retryPolicy.maxAttempts.value === null;
  loaded.maxAttempts = v.retryPolicy.maxAttempts.value ?? 0;
  loaded.initialIntervalMs = v.retryPolicy.initialIntervalMs.value;
  loaded.maxIntervalMs = v.retryPolicy.maxIntervalMs.value;
  loaded.randomizationFactor = v.retryPolicy.randomizationFactor.value;
  loaded.multiplier = v.retryPolicy.multiplier.value;
  loaded.maxElapsedUnlimited = v.retryPolicy.maxElapsedTimeMs.value === null;
  loaded.maxElapsedTimeMs = v.retryPolicy.maxElapsedTimeMs.value ?? 0;

  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(() => {
  return (
    draft.collectionTimeoutMs !== loaded.collectionTimeoutMs ||
    draft.maxConcurrentCollections !== loaded.maxConcurrentCollections ||
    draft.outboundQueueCapacity !== loaded.outboundQueueCapacity ||
    draft.maxAttemptsUnlimited !== loaded.maxAttemptsUnlimited ||
    draft.maxAttempts !== loaded.maxAttempts ||
    draft.initialIntervalMs !== loaded.initialIntervalMs ||
    draft.maxIntervalMs !== loaded.maxIntervalMs ||
    draft.randomizationFactor !== loaded.randomizationFactor ||
    draft.multiplier !== loaded.multiplier ||
    draft.maxElapsedUnlimited !== loaded.maxElapsedUnlimited ||
    draft.maxElapsedTimeMs !== loaded.maxElapsedTimeMs
  );
});

function reset() {
  Object.assign(draft, loaded);
  result.value = null;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const v = await request<CollectorSettingsView>(
      'GET',
      '/system/settings/collector',
    );
    applyView(v);
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

function fieldDisabled(f?: SettingField<any>) {
  return Boolean(loading.value || f?.envOverridden);
}

async function apply() {
  if (!view.value) return;
  if (loading.value) return;

  const v = view.value;
  const patch: PatchCollectorSettingsRequest = {};

  if (
    !v.collectionTimeoutMs.envOverridden &&
    draft.collectionTimeoutMs !== loaded.collectionTimeoutMs
  ) {
    patch.collectionTimeoutMs = draft.collectionTimeoutMs;
  }
  if (
    !v.maxConcurrentCollections.envOverridden &&
    draft.maxConcurrentCollections !== loaded.maxConcurrentCollections
  ) {
    patch.maxConcurrentCollections = draft.maxConcurrentCollections;
  }
  if (
    !v.outboundQueueCapacity.envOverridden &&
    draft.outboundQueueCapacity !== loaded.outboundQueueCapacity
  ) {
    patch.outboundQueueCapacity = draft.outboundQueueCapacity;
  }

  const rpPatch: PatchRetryPolicyRequest = {};
  const rp = v.retryPolicy;

  const nextMaxAttempts = draft.maxAttemptsUnlimited
    ? null
    : Number(draft.maxAttempts);
  const prevMaxAttempts = loaded.maxAttemptsUnlimited
    ? null
    : Number(loaded.maxAttempts);
  if (!rp.maxAttempts.envOverridden && nextMaxAttempts !== prevMaxAttempts) {
    rpPatch.maxAttempts = nextMaxAttempts;
  }

  if (
    !rp.initialIntervalMs.envOverridden &&
    draft.initialIntervalMs !== loaded.initialIntervalMs
  ) {
    rpPatch.initialIntervalMs = draft.initialIntervalMs;
  }
  if (
    !rp.maxIntervalMs.envOverridden &&
    draft.maxIntervalMs !== loaded.maxIntervalMs
  ) {
    rpPatch.maxIntervalMs = draft.maxIntervalMs;
  }
  if (
    !rp.randomizationFactor.envOverridden &&
    draft.randomizationFactor !== loaded.randomizationFactor
  ) {
    rpPatch.randomizationFactor = draft.randomizationFactor;
  }
  if (!rp.multiplier.envOverridden && draft.multiplier !== loaded.multiplier) {
    rpPatch.multiplier = draft.multiplier;
  }

  const nextMaxElapsed = draft.maxElapsedUnlimited
    ? null
    : Number(draft.maxElapsedTimeMs);
  const prevMaxElapsed = loaded.maxElapsedUnlimited
    ? null
    : Number(loaded.maxElapsedTimeMs);
  if (!rp.maxElapsedTimeMs.envOverridden && nextMaxElapsed !== prevMaxElapsed) {
    rpPatch.maxElapsedTimeMs = nextMaxElapsed;
  }

  if (Object.keys(rpPatch).length > 0) {
    patch.retryPolicy = rpPatch;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/collector',
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
    :title="$t('preferences.system.collector.title')"
    :description="$t('preferences.system.collector.desc')"
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
        v-model="draft.collectionTimeoutMs"
        :disabled="fieldDisabled(view.collectionTimeoutMs)"
        :min="1"
        :step="100"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.collector.collectionTimeoutMs') }}
          <SourceBadge :field="view.collectionTimeoutMs" />
        </span>
        <template #tip>
          {{ $t('preferences.system.collector.collectionTimeoutMsTip') }}
        </template>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.maxConcurrentCollections"
        :disabled="fieldDisabled(view.maxConcurrentCollections)"
        :min="1"
        :step="1"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.collector.maxConcurrentCollections') }}
          <SourceBadge :field="view.maxConcurrentCollections" />
        </span>
      </NumberFieldItem>

      <NumberFieldItem
        v-model="draft.outboundQueueCapacity"
        :disabled="fieldDisabled(view.outboundQueueCapacity)"
        :min="1"
        :step="1"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.collector.outboundQueueCapacity') }}
          <SourceBadge :field="view.outboundQueueCapacity" />
        </span>
      </NumberFieldItem>

      <div class="bg-muted/20 mt-3 rounded-md border p-3">
        <div class="text-muted-foreground mb-2 text-xs font-medium">
          {{ $t('preferences.system.collector.retryPolicyTitle') }}
        </div>

        <SwitchItem
          v-model="draft.maxAttemptsUnlimited"
          :disabled="fieldDisabled(view.retryPolicy.maxAttempts)"
          class="px-0"
          :tip="$t('preferences.system.collector.maxAttemptsUnlimitedTip')"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.maxAttemptsUnlimited') }}
            <SourceBadge :field="view.retryPolicy.maxAttempts" />
          </span>
        </SwitchItem>

        <NumberFieldItem
          v-if="!draft.maxAttemptsUnlimited"
          v-model="draft.maxAttempts"
          :disabled="fieldDisabled(view.retryPolicy.maxAttempts)"
          :min="1"
          :step="1"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.maxAttempts') }}
            <SourceBadge :field="view.retryPolicy.maxAttempts" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.initialIntervalMs"
          :disabled="fieldDisabled(view.retryPolicy.initialIntervalMs)"
          :min="1"
          :step="50"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.initialIntervalMs') }}
            <SourceBadge :field="view.retryPolicy.initialIntervalMs" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.maxIntervalMs"
          :disabled="fieldDisabled(view.retryPolicy.maxIntervalMs)"
          :min="1"
          :step="50"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.maxIntervalMs') }}
            <SourceBadge :field="view.retryPolicy.maxIntervalMs" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.randomizationFactor"
          :disabled="fieldDisabled(view.retryPolicy.randomizationFactor)"
          :min="0"
          :max="1"
          :step="0.01"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.randomizationFactor') }}
            <SourceBadge :field="view.retryPolicy.randomizationFactor" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.multiplier"
          :disabled="fieldDisabled(view.retryPolicy.multiplier)"
          :min="1"
          :step="0.1"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.multiplier') }}
            <SourceBadge :field="view.retryPolicy.multiplier" />
          </span>
        </NumberFieldItem>

        <SwitchItem
          v-model="draft.maxElapsedUnlimited"
          :disabled="fieldDisabled(view.retryPolicy.maxElapsedTimeMs)"
          class="px-0"
          :tip="$t('preferences.system.collector.maxElapsedUnlimitedTip')"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.maxElapsedUnlimited') }}
            <SourceBadge :field="view.retryPolicy.maxElapsedTimeMs" />
          </span>
        </SwitchItem>

        <NumberFieldItem
          v-if="!draft.maxElapsedUnlimited"
          v-model="draft.maxElapsedTimeMs"
          :disabled="fieldDisabled(view.retryPolicy.maxElapsedTimeMs)"
          :min="1"
          :step="100"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.collector.maxElapsedTimeMs') }}
            <SourceBadge :field="view.retryPolicy.maxElapsedTimeMs" />
          </span>
        </NumberFieldItem>
      </div>
    </template>
  </CardShell>
</template>
