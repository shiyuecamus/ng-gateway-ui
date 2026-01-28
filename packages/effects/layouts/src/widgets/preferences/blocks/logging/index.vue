<script setup lang="ts">
import { ref } from 'vue';

import { $t } from '@vben/locales';

import { VbenButton } from '@vben-core/shadcn-ui';

import { useV1Api } from '../../api/v1';
import LoggingCleanup from './logging-cleanup.vue';
import LoggingControl from './logging-control.vue';
import LoggingFiles from './logging-files.vue';
import LoggingOutput from './logging-output.vue';
import LoggingRuntime from './logging-runtime.vue';

const { request } = useV1Api();

const overview = ref<any | null>(null);
const overviewLoading = ref(false);
const overviewError = ref('');

async function reloadOverview() {
  overviewLoading.value = true;
  overviewError.value = '';
  try {
    overview.value = await request<any>('GET', '/system/settings');
  } catch (error: any) {
    overviewError.value = error?.message ?? String(error);
    overview.value = null;
  } finally {
    overviewLoading.value = false;
  }
}

reloadOverview();
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="overviewError"
      class="rounded-md bg-red-50 p-3 text-sm text-red-800"
    >
      <div class="font-medium">
        {{ $t('preferences.system.meta.overviewLoadFailed') }}
      </div>
      <div class="mt-1 break-words font-mono text-xs opacity-80">
        {{ overviewError }}
      </div>
      <div class="mt-3 flex justify-end">
        <VbenButton
          size="sm"
          :disabled="overviewLoading"
          @click="reloadOverview"
        >
          {{ $t('common.refresh') }}
        </VbenButton>
      </div>
    </div>

    <div>
      <div class="mb-2">
        <div class="text-muted-foreground text-xs">
          {{ $t('preferences.system.logging.desc') }}
          <span
            v-if="overviewLoading"
            class="ml-2 font-mono text-[11px] opacity-70"
          >
            ({{ $t('common.loading') }})
          </span>
        </div>
      </div>

      <div
        v-if="overview"
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fit, minmax(420px, 1fr))"
      >
        <LoggingRuntime
          :initial-view="overview.loggingRuntime"
          :auto-load="false"
        />
        <LoggingControl :initial-view="overview.loggingControl" :auto-load="false" />
        <LoggingFiles />
        <LoggingOutput
          class="col-span-full"
          :initial-view="overview.loggingOutput"
          :auto-load="false"
        />
        <LoggingCleanup
          :initial-view="overview.loggingCleanup"
          :auto-load="false"
        />
      </div>
    </div>
  </div>
</template>

