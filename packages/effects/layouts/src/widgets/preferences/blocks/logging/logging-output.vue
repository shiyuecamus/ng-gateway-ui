<script setup lang="ts">
import type { ApplySystemSettingsResult, SettingField } from '../system/types';

import { computed, reactive, ref } from 'vue';

import { $t } from '@vben/locales';

import InputItem from '../input-item.vue';
import NumberFieldItem from '../number-field-item.vue';
import SelectItem from '../select-item.vue';
import SwitchItem from '../switch-item.vue';
import { useV1Api } from '../../api/v1';
import CardShell from '../system/card-shell.vue';
import SourceBadge from '../system/source-badge.vue';

type LoggingOutputFormat = 'json' | 'text';
type LoggingRotationMode = 'both' | 'size' | 'time';
type LoggingTimeRotation = 'daily' | 'hourly';

type LoggingFileRetentionSettingsView = {
  maxDays: SettingField<number>;
  maxTotalSizeMb: SettingField<number>;
};

type LoggingFileRotationSettingsView = {
  maxFiles: SettingField<number>;
  mode: SettingField<LoggingRotationMode>;
  sizeMb: SettingField<number>;
  time: SettingField<LoggingTimeRotation>;
};

type LoggingFileOutputSettingsView = {
  dir: SettingField<string>;
  enabled: SettingField<boolean>;
  retention: LoggingFileRetentionSettingsView;
  rotation: LoggingFileRotationSettingsView;
};

type LoggingOutputSettingsView = {
  file: LoggingFileOutputSettingsView;
  format: SettingField<LoggingOutputFormat>;
  includeSpanFields: SettingField<boolean>;
};

type PatchLoggingFileRotationRequest = Partial<{
  maxFiles: number;
  mode: LoggingRotationMode;
  sizeMb: number;
  time: LoggingTimeRotation;
}>;

type PatchLoggingFileRetentionRequest = Partial<{
  maxDays: number;
  maxTotalSizeMb: number;
}>;

type PatchLoggingFileOutputRequest = Partial<{
  dir: string;
  enabled: boolean;
  retention: PatchLoggingFileRetentionRequest;
  rotation: PatchLoggingFileRotationRequest;
}>;

type PatchLoggingOutputSettingsRequest = Partial<{
  file: PatchLoggingFileOutputRequest;
  format: LoggingOutputFormat;
  includeSpanFields: boolean;
}>;

const props = withDefaults(
  defineProps<{
    autoLoad?: boolean;
    initialView?: LoggingOutputSettingsView | null;
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

const view = ref<LoggingOutputSettingsView | null>(null);

const loaded = reactive({
  format: 'text' as LoggingOutputFormat,
  includeSpanFields: false,
  fileEnabled: false,
  dir: '',
  rotationMode: 'time' as LoggingRotationMode,
  rotationTime: 'daily' as LoggingTimeRotation,
  rotationSizeMb: 100,
  rotationMaxFiles: 10,
  retentionMaxDays: 7,
  retentionMaxTotalSizeMb: 0,
});

const draft = reactive({ ...loaded });

function applyView(v: LoggingOutputSettingsView) {
  view.value = v;
  loaded.format = v.format.value;
  loaded.includeSpanFields = v.includeSpanFields.value;
  loaded.fileEnabled = v.file.enabled.value;
  loaded.dir = v.file.dir.value;
  loaded.rotationMode = v.file.rotation.mode.value;
  loaded.rotationTime = v.file.rotation.time.value;
  loaded.rotationSizeMb = v.file.rotation.sizeMb.value;
  loaded.rotationMaxFiles = v.file.rotation.maxFiles.value;
  loaded.retentionMaxDays = v.file.retention.maxDays.value;
  loaded.retentionMaxTotalSizeMb = v.file.retention.maxTotalSizeMb.value;

  Object.assign(draft, loaded);
  result.value = null;
}

const dirty = computed(() => {
  return (
    draft.format !== loaded.format ||
    draft.includeSpanFields !== loaded.includeSpanFields ||
    draft.fileEnabled !== loaded.fileEnabled ||
    draft.dir !== loaded.dir ||
    draft.rotationMode !== loaded.rotationMode ||
    draft.rotationTime !== loaded.rotationTime ||
    draft.rotationSizeMb !== loaded.rotationSizeMb ||
    draft.rotationMaxFiles !== loaded.rotationMaxFiles ||
    draft.retentionMaxDays !== loaded.retentionMaxDays ||
    draft.retentionMaxTotalSizeMb !== loaded.retentionMaxTotalSizeMb
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
    const v = await request<LoggingOutputSettingsView>(
      'GET',
      '/system/settings/logging_output',
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
  const patch: PatchLoggingOutputSettingsRequest = {};

  if (!v.format.envOverridden && draft.format !== loaded.format) {
    patch.format = draft.format;
  }
  if (
    !v.includeSpanFields.envOverridden &&
    draft.includeSpanFields !== loaded.includeSpanFields
  ) {
    patch.includeSpanFields = draft.includeSpanFields;
  }

  const filePatch: PatchLoggingFileOutputRequest = {};
  const file = v.file;

  if (!file.enabled.envOverridden && draft.fileEnabled !== loaded.fileEnabled) {
    filePatch.enabled = draft.fileEnabled;
  }
  if (!file.dir.envOverridden && draft.dir !== loaded.dir) {
    filePatch.dir = draft.dir;
  }

  const rotationPatch: PatchLoggingFileRotationRequest = {};
  const rot = file.rotation;
  if (!rot.mode.envOverridden && draft.rotationMode !== loaded.rotationMode) {
    rotationPatch.mode = draft.rotationMode;
  }
  if (!rot.time.envOverridden && draft.rotationTime !== loaded.rotationTime) {
    rotationPatch.time = draft.rotationTime;
  }
  if (!rot.sizeMb.envOverridden && draft.rotationSizeMb !== loaded.rotationSizeMb) {
    rotationPatch.sizeMb = draft.rotationSizeMb;
  }
  if (
    !rot.maxFiles.envOverridden &&
    draft.rotationMaxFiles !== loaded.rotationMaxFiles
  ) {
    rotationPatch.maxFiles = draft.rotationMaxFiles;
  }
  if (Object.keys(rotationPatch).length > 0) {
    filePatch.rotation = rotationPatch;
  }

  const retentionPatch: PatchLoggingFileRetentionRequest = {};
  const ret = file.retention;
  if (!ret.maxDays.envOverridden && draft.retentionMaxDays !== loaded.retentionMaxDays) {
    retentionPatch.maxDays = draft.retentionMaxDays;
  }
  if (
    !ret.maxTotalSizeMb.envOverridden &&
    draft.retentionMaxTotalSizeMb !== loaded.retentionMaxTotalSizeMb
  ) {
    retentionPatch.maxTotalSizeMb = draft.retentionMaxTotalSizeMb;
  }
  if (Object.keys(retentionPatch).length > 0) {
    filePatch.retention = retentionPatch;
  }

  if (Object.keys(filePatch).length > 0) {
    patch.file = filePatch;
  }

  if (Object.keys(patch).length === 0) return;

  loading.value = true;
  error.value = '';
  try {
    const r = await request<ApplySystemSettingsResult>(
      'PATCH',
      '/system/settings/logging_output',
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

const formatItems = [
  { label: 'TEXT', value: 'text' },
  { label: 'JSON', value: 'json' },
];
const rotationModeItems = [
  {
    label: $t('preferences.system.loggingOutput.rotationMode.time'),
    value: 'time',
  },
  {
    label: $t('preferences.system.loggingOutput.rotationMode.size'),
    value: 'size',
  },
  {
    label: $t('preferences.system.loggingOutput.rotationMode.both'),
    value: 'both',
  },
];
const timeRotationItems = [
  {
    label: $t('preferences.system.loggingOutput.timeRotation.hourly'),
    value: 'hourly',
  },
  {
    label: $t('preferences.system.loggingOutput.timeRotation.daily'),
    value: 'daily',
  },
];

if (props.initialView) {
  applyView(props.initialView);
}
if (props.autoLoad && !props.initialView) {
  reload();
}
</script>

<template>
  <CardShell
    :title="$t('preferences.system.loggingOutput.title')"
    :description="$t('preferences.system.loggingOutput.desc')"
    :loading="loading"
    :dirty="dirty"
    :error="error"
    :result="result"
    @reload="reload"
    @reset="reset"
    @apply="apply"
  >
    <template v-if="view">
      <SelectItem
        v-model="draft.format"
        :disabled="fieldDisabled(view.format)"
        :items="formatItems"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingOutput.format') }}
          <SourceBadge :field="view.format" />
        </span>
      </SelectItem>

      <SwitchItem
        v-model="draft.includeSpanFields"
        :disabled="fieldDisabled(view.includeSpanFields)"
        :tip="$t('preferences.system.loggingOutput.includeSpanFieldsTip')"
      >
        <span class="flex items-center gap-2">
          {{ $t('preferences.system.loggingOutput.includeSpanFields') }}
          <SourceBadge :field="view.includeSpanFields" />
        </span>
      </SwitchItem>

      <div class="bg-muted/20 mt-3 rounded-md border p-3">
        <div class="text-muted-foreground mb-2 text-xs font-medium">
          {{ $t('preferences.system.loggingOutput.fileTitle') }}
        </div>

        <SwitchItem
          v-model="draft.fileEnabled"
          :disabled="fieldDisabled(view.file.enabled)"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.fileEnabled') }}
            <SourceBadge :field="view.file.enabled" />
          </span>
        </SwitchItem>

        <InputItem
          v-model="draft.dir"
          :disabled="fieldDisabled(view.file.dir)"
          :placeholder="$t('preferences.system.loggingOutput.dirPlaceholder')"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.dir') }}
            <SourceBadge :field="view.file.dir" />
          </span>
        </InputItem>

        <SelectItem
          v-model="draft.rotationMode"
          :disabled="fieldDisabled(view.file.rotation.mode)"
          :items="rotationModeItems"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.rotationModeTitle') }}
            <SourceBadge :field="view.file.rotation.mode" />
          </span>
        </SelectItem>

        <SelectItem
          v-model="draft.rotationTime"
          :disabled="fieldDisabled(view.file.rotation.time)"
          :items="timeRotationItems"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.timeRotationTitle') }}
            <SourceBadge :field="view.file.rotation.time" />
          </span>
        </SelectItem>

        <NumberFieldItem
          v-model="draft.rotationSizeMb"
          :disabled="fieldDisabled(view.file.rotation.sizeMb)"
          :min="1"
          :step="1"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.rotationSizeMb') }}
            <SourceBadge :field="view.file.rotation.sizeMb" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.rotationMaxFiles"
          :disabled="fieldDisabled(view.file.rotation.maxFiles)"
          :min="1"
          :step="1"
          class="px-0"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.rotationMaxFiles') }}
            <SourceBadge :field="view.file.rotation.maxFiles" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.retentionMaxDays"
          :disabled="fieldDisabled(view.file.retention.maxDays)"
          :min="0"
          :step="1"
          class="px-0"
          :tip="$t('preferences.system.loggingOutput.retentionMaxDaysTip')"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.retentionMaxDays') }}
            <SourceBadge :field="view.file.retention.maxDays" />
          </span>
        </NumberFieldItem>

        <NumberFieldItem
          v-model="draft.retentionMaxTotalSizeMb"
          :disabled="fieldDisabled(view.file.retention.maxTotalSizeMb)"
          :min="0"
          :step="10"
          class="px-0"
          :tip="$t('preferences.system.loggingOutput.retentionMaxTotalSizeMbTip')"
        >
          <span class="flex items-center gap-2">
            {{ $t('preferences.system.loggingOutput.retentionMaxTotalSizeMb') }}
            <SourceBadge :field="view.file.retention.maxTotalSizeMb" />
          </span>
        </NumberFieldItem>
      </div>
    </template>
  </CardShell>
</template>

