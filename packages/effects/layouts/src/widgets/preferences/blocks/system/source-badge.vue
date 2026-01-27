<script setup lang="ts">
import type { SettingField, SettingValueSource } from './types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import { VbenTooltip } from '@vben-core/shadcn-ui';

const props = defineProps<{
  field: SettingField<any>;
}>();

const sourceLabel = computed(() => {
  const s: SettingValueSource = props.field.source;
  switch (s) {
    case 'default': {
      return $t('preferences.system.meta.sourceDefault');
    }
    case 'env': {
      return $t('preferences.system.meta.sourceEnv');
    }
    case 'file': {
      return $t('preferences.system.meta.sourceFile');
    }
    default: {
      return s;
    }
  }
});

const sourceClass = computed(() => {
  const s: SettingValueSource = props.field.source;
  switch (s) {
    case 'env': {
      return 'bg-orange-100 text-orange-800';
    }
    case 'file': {
      return 'bg-blue-100 text-blue-800';
    }
    default: {
      return 'bg-zinc-100 text-zinc-800';
    }
  }
});
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <span
      class="rounded px-1.5 py-0.5 text-[10px] font-medium"
      :class="sourceClass"
    >
      {{ sourceLabel }}
    </span>

    <VbenTooltip v-if="field.envOverridden" side="bottom">
      <template #trigger>
        <span
          class="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-800"
        >
          {{ $t('preferences.system.meta.envLocked') }}
        </span>
      </template>
      <div class="max-w-[320px] space-y-1 text-xs">
        <div class="font-medium">
          {{ $t('preferences.system.meta.envLockedTipTitle') }}
        </div>
        <div class="break-all font-mono text-[11px] opacity-80">
          {{ field.envKey || '-' }}
        </div>
      </div>
    </VbenTooltip>
  </span>
</template>
