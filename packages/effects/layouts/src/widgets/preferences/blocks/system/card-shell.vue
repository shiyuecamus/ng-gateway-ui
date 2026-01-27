<script setup lang="ts">
import type { ApplySystemSettingsResult } from './types';

import { $t } from '@vben/locales';

import { VbenButton } from '@vben-core/shadcn-ui';

import ApplyResult from './apply-result.vue';

withDefaults(
  defineProps<{
    description?: string;
    dirty?: boolean;
    disableApply?: boolean;
    error?: string;
    loading?: boolean;
    result?: ApplySystemSettingsResult | null;
    title: string;
  }>(),
  {
    description: '',
    loading: false,
    dirty: false,
    error: '',
    result: null,
    disableApply: false,
  },
);

const emit = defineEmits<{
  (e: 'reload'): void;
  (e: 'reset'): void;
  (e: 'apply'): void;
}>();
</script>

<template>
  <div class="bg-background rounded-lg border p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <div class="font-medium">{{ title }}</div>
          <span
            v-if="dirty"
            class="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
          >
            {{ $t('preferences.system.meta.unsaved') }}
          </span>
          <span
            v-if="loading"
            class="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800"
          >
            {{ $t('common.loading') }}
          </span>
        </div>
        <div v-if="description" class="text-muted-foreground mt-1 text-xs">
          {{ description }}
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <VbenButton
          size="sm"
          variant="ghost"
          :disabled="loading"
          @click="emit('reload')"
        >
          {{ $t('common.refresh') }}
        </VbenButton>
        <VbenButton
          size="sm"
          variant="outline"
          :disabled="loading || !dirty"
          @click="emit('reset')"
        >
          {{ $t('preferences.system.meta.reset') }}
        </VbenButton>
        <VbenButton
          size="sm"
          :disabled="loading || disableApply || !dirty"
          @click="emit('apply')"
        >
          {{ $t('preferences.system.meta.apply') }}
        </VbenButton>
      </div>
    </div>

    <div
      v-if="error"
      class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
    >
      {{ error }}
    </div>

    <div v-if="result" class="mt-3">
      <ApplyResult :result="result" />
    </div>

    <div class="mt-3 space-y-1">
      <slot></slot>
    </div>
  </div>
</template>
