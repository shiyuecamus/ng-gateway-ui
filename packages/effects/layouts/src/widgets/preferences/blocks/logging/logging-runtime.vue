<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import SelectItem from '../select-item.vue';
import { useV1Api } from '../../api/v1';
import CardShell from '../system/card-shell.vue';

/**
 * Log level DTO values returned by the backend.
 *
 * NOTE:
 * The backend serializes `LogLevel` as UPPERCASE strings (e.g. "INFO", "WARN").
 * Keep frontend values aligned with the API to ensure Select binding works.
 */
type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'TRACE' | 'WARN';

type TtlRange = {
  defaultMs: number;
  maxMs: number;
  minMs: number;
};

type GlobalLogLevelView = {
  baseline: LogLevel;
  channelOverrideTtl: TtlRange;
  effective: LogLevel;
};

type SetGlobalLogLevelRequest = {
  level: LogLevel;
};

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: GlobalLogLevelView | null;
  }>(),
  {
    initialView: null,
    autoLoad: true,
  },
);

const { request } = useV1Api();

const loading = ref(false);
const error = ref('');

const view = ref<GlobalLogLevelView | null>(null);
const loaded = reactive({
  baseline: 'INFO' as LogLevel,
});
const draft = reactive({ ...loaded });

const dirty = computed(() => draft.baseline !== loaded.baseline);

const levelItems = [
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'TRACE', value: 'TRACE' },
];

function applyView(v: GlobalLogLevelView) {
  view.value = v;
  loaded.baseline = v.baseline;
  Object.assign(draft, loaded);
}

function reset() {
  Object.assign(draft, loaded);
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const v = await request<GlobalLogLevelView>(
      'GET',
      '/system/settings/logging_runtime',
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

  loading.value = true;
  error.value = '';
  try {
    await request<GlobalLogLevelView>(
      'PATCH',
      '/system/settings/logging_runtime',
      { level: draft.baseline } satisfies SetGlobalLogLevelRequest,
    );
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
    :title="$t('preferences.system.loggingRuntime.title')"
    :description="$t('preferences.system.loggingRuntime.desc')"
    :loading="loading"
    :dirty="dirty"
    :error="error"
    @reload="reload"
    @reset="reset"
    @apply="apply"
  >
    <template v-if="view">
      <div
        v-if="view.effective !== view.baseline"
        class="mb-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900"
      >
        {{ $t('preferences.system.loggingRuntime.effectiveDiff') }}
        <span class="ml-1 font-mono">{{ view.baseline }} → {{ view.effective }}</span>
      </div>

      <SelectItem
        v-model="draft.baseline"
        :disabled="loading"
        :items="levelItems"
      >
        {{ $t('preferences.system.loggingRuntime.baseline') }}
      </SelectItem>

      <div class="bg-muted/20 mt-3 rounded-md border p-3 text-xs">
        <div class="text-muted-foreground font-medium">
          {{ $t('preferences.system.loggingRuntime.channelOverrideTtlTitle') }}
        </div>
        <div class="mt-1 grid grid-cols-3 gap-2 font-mono text-[11px] opacity-80">
          <div>min={{ view.channelOverrideTtl.minMs }}ms</div>
          <div>default={{ view.channelOverrideTtl.defaultMs }}ms</div>
          <div>max={{ view.channelOverrideTtl.maxMs }}ms</div>
        </div>
      </div>
    </template>
  </CardShell>
</template>

