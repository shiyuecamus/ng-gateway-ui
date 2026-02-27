<script lang="ts" setup>
import type { PipelineEditorFormValues } from '../schemas';

import { $t } from '@vben/locales';
import { Button, Card, InputNumber, Switch } from 'ant-design-vue';

defineOptions({ name: 'AiPipelineRoiSection' });

defineProps<{
  formState: PipelineEditorFormValues;
}>();

const emit = defineEmits<{
  addRegion: [];
  removeRegion: [index: number];
}>();
</script>

<template>
  <Card :title="$t('page.ai.pipeline.editor.sections.roi')">
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span>{{ $t('page.ai.pipeline.editor.roi.enable') }}</span>
        <Switch v-model:checked="formState.roiEnabled" />
      </div>
      <div v-if="formState.roiEnabled" class="grid grid-cols-4 gap-2">
        <div>
          <div class="mb-1">x_min</div>
          <InputNumber v-model:value="formState.roiXMin" :min="0" :max="1" :step="0.01" class="w-full" />
        </div>
        <div>
          <div class="mb-1">y_min</div>
          <InputNumber v-model:value="formState.roiYMin" :min="0" :max="1" :step="0.01" class="w-full" />
        </div>
        <div>
          <div class="mb-1">x_max</div>
          <InputNumber v-model:value="formState.roiXMax" :min="0" :max="1" :step="0.01" class="w-full" />
        </div>
        <div>
          <div class="mb-1">y_max</div>
          <InputNumber v-model:value="formState.roiYMax" :min="0" :max="1" :step="0.01" class="w-full" />
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span>{{ $t('page.ai.pipeline.editor.roi.multiRoi') }}</span>
        <Button size="small" type="dashed" @click="emit('addRegion')">
          {{ $t('page.ai.pipeline.editor.actions.addRoi') }}
        </Button>
      </div>
      <div v-for="(region, i) in formState.roiRegions" :key="i" class="grid grid-cols-5 gap-2">
        <InputNumber v-model:value="region.xMin" :min="0" :max="1" :step="0.01" class="w-full" />
        <InputNumber v-model:value="region.yMin" :min="0" :max="1" :step="0.01" class="w-full" />
        <InputNumber v-model:value="region.xMax" :min="0" :max="1" :step="0.01" class="w-full" />
        <InputNumber v-model:value="region.yMax" :min="0" :max="1" :step="0.01" class="w-full" />
        <Button danger type="link" @click="emit('removeRegion', i)">
          {{ $t('common.delete') }}
        </Button>
      </div>
    </div>
  </Card>
</template>
