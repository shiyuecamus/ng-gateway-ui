<script lang="ts" setup>
import type { AiPipelineValidationReport } from '@vben/types';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

defineOptions({ name: 'AiPipelineValidationModal' });

const report = ref<AiPipelineValidationReport>({
  valid: true,
  errors: [],
  warnings: [],
});

const statusText = computed(() =>
  report.value.valid
    ? $t('page.ai.pipeline.validation.pass')
    : $t('page.ai.pipeline.validation.fail'),
);

const [Modal, modalApi] = useVbenModal({
  class: 'w-1/2',
  destroyOnClose: true,
  showConfirmButton: false,
  onCancel() {
    modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) {
      return;
    }
    await nextTick();
    report.value = modalApi.getData<AiPipelineValidationReport>();
  },
});
</script>

<template>
  <Modal :title="$t('page.ai.pipeline.validation.title')">
    <div class="space-y-4">
      <p>
        <b>{{ $t('page.ai.pipeline.validation.valid') }}:</b>
        {{ statusText }}
      </p>
      <div>
        <p class="mb-2">
          <b>{{ $t('page.ai.pipeline.validation.errors') }}</b>
        </p>
        <ul class="list-disc pl-5">
          <li v-for="item in report.errors" :key="item">{{ item }}</li>
          <li v-if="report.errors.length === 0">
            {{ $t('page.ai.pipeline.validation.none') }}
          </li>
        </ul>
      </div>
      <div>
        <p class="mb-2">
          <b>{{ $t('page.ai.pipeline.validation.warnings') }}</b>
        </p>
        <ul class="list-disc pl-5">
          <li v-for="item in report.warnings" :key="item">{{ item }}</li>
          <li v-if="report.warnings.length === 0">
            {{ $t('page.ai.pipeline.validation.none') }}
          </li>
        </ul>
      </div>
    </div>
  </Modal>
</template>
