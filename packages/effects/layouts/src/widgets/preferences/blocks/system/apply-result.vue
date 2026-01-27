<script setup lang="ts">
import type { ApplySystemSettingsResult } from './types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

const props = defineProps<{
  result: ApplySystemSettingsResult;
}>();

const impactText = computed(() => {
  const i = props.result.impact;
  switch (i.type) {
    case 'hot_apply': {
      return $t('preferences.system.applyResult.impactHotApply');
    }
    case 'restart_component': {
      const comps = (i.components || []).join(', ');
      return comps
        ? `${$t('preferences.system.applyResult.impactRestartComponent')}: ${comps}`
        : $t('preferences.system.applyResult.impactRestartComponent');
    }
    case 'restart_process': {
      return $t('preferences.system.applyResult.impactRestartProcess');
    }
    default: {
      return String((i as any)?.type ?? '');
    }
  }
});
</script>

<template>
  <div class="bg-muted/30 space-y-2 rounded-md border p-3 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">
        {{
          result.applied
            ? $t('preferences.system.applyResult.applied')
            : $t('preferences.system.applyResult.noop')
        }}
      </span>
      <span
        v-if="!result.persisted"
        class="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
      >
        {{ $t('preferences.system.applyResult.notPersisted') }}
      </span>
      <span
        v-else
        class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
      >
        {{ $t('preferences.system.applyResult.persisted') }}
      </span>
    </div>

    <div class="text-muted-foreground text-xs">
      {{ impactText }}
    </div>

    <div
      v-if="result.persistenceWarning"
      class="rounded bg-red-50 p-2 text-xs text-red-800"
    >
      {{ result.persistenceWarning }}
    </div>

    <div
      v-if="result.runtimeWarning"
      class="rounded bg-amber-50 p-2 text-xs text-amber-900"
    >
      {{ result.runtimeWarning }}
    </div>

    <div
      v-if="result.blockedByEnv?.length"
      class="rounded bg-amber-50 p-2 text-xs text-amber-900"
    >
      <div class="font-medium">
        {{ $t('preferences.system.applyResult.blockedByEnv') }}
      </div>
      <div class="mt-1 break-words font-mono text-[11px] opacity-80">
        {{ result.blockedByEnv.join(', ') }}
      </div>
    </div>
  </div>
</template>
