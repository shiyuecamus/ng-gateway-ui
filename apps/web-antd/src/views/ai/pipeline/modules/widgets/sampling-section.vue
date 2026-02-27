<script lang="ts" setup>
import type { PipelineEditorFormValues } from '../schemas';

import { $t } from '@vben/locales';
import { Card, InputNumber, Select } from 'ant-design-vue';

defineOptions({ name: 'AiPipelineSamplingSection' });

defineProps<{
  formState: PipelineEditorFormValues;
}>();
</script>

<template>
  <Card :title="$t('page.ai.pipeline.editor.sections.sampling')">
    <div class="grid grid-cols-3 gap-2">
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.sampling.type') }}</div>
        <Select
          v-model:value="formState.samplingType"
          :options="[
            { label: 'every_frame', value: 'every_frame' },
            { label: 'fixed_interval', value: 'fixed_interval' },
            { label: 'target_fps', value: 'target_fps' },
            { label: 'key_frame_only', value: 'key_frame_only' },
          ]"
        />
      </div>
      <div v-if="formState.samplingType === 'fixed_interval'">
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.sampling.everyNFrames') }}</div>
        <InputNumber v-model:value="formState.everyNFrames" :min="1" class="w-full" />
      </div>
      <div v-if="formState.samplingType === 'target_fps'">
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.sampling.fps') }}</div>
        <InputNumber v-model:value="formState.fps" :min="0.1" :step="0.1" class="w-full" />
      </div>
    </div>
  </Card>
</template>
