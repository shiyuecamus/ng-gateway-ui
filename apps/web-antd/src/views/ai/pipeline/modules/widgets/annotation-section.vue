<script lang="ts" setup>
import type { PipelineEditorFormValues } from '../schemas';

import { $t } from '@vben/locales';
import { Card, InputNumber, Switch } from 'ant-design-vue';

defineOptions({ name: 'AiPipelineAnnotationSection' });

defineProps<{
  formState: PipelineEditorFormValues;
}>();
</script>

<template>
  <Card :title="$t('page.ai.pipeline.editor.sections.annotation')">
    <div class="grid grid-cols-3 gap-2">
      <div class="flex items-center justify-between rounded border px-2 py-1">
        <span>{{ $t('page.ai.pipeline.editor.annotation.drawBboxes') }}</span>
        <Switch v-model:checked="formState.drawBboxes" />
      </div>
      <div class="flex items-center justify-between rounded border px-2 py-1">
        <span>{{ $t('page.ai.pipeline.editor.annotation.drawLabels') }}</span>
        <Switch v-model:checked="formState.drawLabels" />
      </div>
      <div class="flex items-center justify-between rounded border px-2 py-1">
        <span>{{ $t('page.ai.pipeline.editor.annotation.drawConfidence') }}</span>
        <Switch v-model:checked="formState.drawConfidence" />
      </div>
      <div class="flex items-center justify-between rounded border px-2 py-1">
        <span>{{ $t('page.ai.pipeline.editor.annotation.drawTrackIds') }}</span>
        <Switch v-model:checked="formState.drawTrackIds" />
      </div>
      <div class="flex items-center justify-between rounded border px-2 py-1">
        <span>{{ $t('page.ai.pipeline.editor.annotation.drawSegmentation') }}</span>
        <Switch v-model:checked="formState.drawSegmentation" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.segmentationAlpha') }}</div>
        <InputNumber v-model:value="formState.segmentationAlpha" :min="0" :max="1" :step="0.01" class="w-full" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.segmentationBackgroundClass') }}</div>
        <InputNumber v-model:value="formState.segmentationBackgroundClass" :min="0" class="w-full" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.lineThickness') }}</div>
        <InputNumber v-model:value="formState.lineThickness" :min="1" class="w-full" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.fontScale') }}</div>
        <InputNumber v-model:value="formState.fontScale" :min="0.1" :step="0.1" class="w-full" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.jpegQuality') }}</div>
        <InputNumber v-model:value="formState.jpegQuality" :min="1" :max="100" class="w-full" />
      </div>
      <div>
        <div class="mb-1">{{ $t('page.ai.pipeline.editor.annotation.maxOutputDimension') }}</div>
        <InputNumber v-model:value="formState.maxOutputDimension" :min="1" class="w-full" />
      </div>
    </div>
  </Card>
</template>
