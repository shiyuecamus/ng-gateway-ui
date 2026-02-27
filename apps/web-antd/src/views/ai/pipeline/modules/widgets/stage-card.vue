<script lang="ts" setup>
import type { PipelineEditorStage } from '../schemas';

import { $t } from '@vben/locales';
import { Button, Card, Input, InputNumber, Select, Switch } from 'ant-design-vue';

defineOptions({ name: 'AiPipelineStageCard' });

defineProps<{
  stage: PipelineEditorStage;
  index: number;
  modelOptions: Array<{ label: string; value: string }>;
  algorithmOptions: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  remove: [];
  addConfigEntry: [];
  removeConfigEntry: [entryIndex: number];
}>();
</script>

<template>
  <Card size="small">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span>{{ $t('page.ai.pipeline.stageTitle', { index: index + 1 }) }}</span>
        <Button danger type="link" @click="emit('remove')">
          {{ $t('common.delete') }}
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.type') }}</div>
          <Select
            v-model:value="stage.type"
            :options="[
              { label: 'inference', value: 'inference' },
              { label: 'frame_transform', value: 'frame_transform' },
              { label: 'tracker', value: 'tracker' },
              { label: 'result_processor', value: 'result_processor' },
            ]"
          />
        </div>
        <div v-if="stage.type === 'frame_transform' || stage.type === 'result_processor'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.moduleId') }}</div>
          <Select
            v-model:value="stage.moduleId"
            :options="algorithmOptions"
            show-search
            :placeholder="$t('page.ai.pipeline.editor.stage.moduleId')"
          />
        </div>
        <div v-if="stage.type === 'inference'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.modelId') }}</div>
          <Select
            v-model:value="stage.modelId"
            :options="modelOptions"
            show-search
            :placeholder="$t('page.ai.pipeline.editor.stage.modelId')"
          />
        </div>
        <div v-if="stage.type === 'inference'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.confidenceThreshold') }}</div>
          <InputNumber
            v-model:value="stage.confidenceThreshold"
            :min="0"
            :max="1"
            :step="0.01"
            class="w-full"
          />
        </div>
        <div v-if="stage.type === 'inference'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.nmsIouThreshold') }}</div>
          <InputNumber
            v-model:value="stage.nmsIouThreshold"
            :min="0"
            :max="1"
            :step="0.01"
            class="w-full"
          />
        </div>
        <div v-if="stage.type === 'inference'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.inputWidth') }}</div>
          <InputNumber
            v-model:value="stage.inputWidth"
            :min="1"
            :placeholder="$t('page.ai.pipeline.editor.stage.inputWidth')"
            class="w-full"
          />
        </div>
        <div v-if="stage.type === 'inference'">
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.inputHeight') }}</div>
          <InputNumber
            v-model:value="stage.inputHeight"
            :min="1"
            :placeholder="$t('page.ai.pipeline.editor.stage.inputHeight')"
            class="w-full"
          />
        </div>

        <div
          v-if="stage.type === 'inference'"
          class="col-span-2 flex items-center justify-between rounded border px-2 py-1"
        >
          <span>{{ $t('page.ai.pipeline.editor.stage.enablePreprocess') }}</span>
          <Switch v-model:checked="stage.preprocessEnabled" />
        </div>
        <template v-if="stage.type === 'inference' && stage.preprocessEnabled">
          <Select
            v-model:value="stage.preprocess.resizeMode"
            :allow-clear="true"
            :options="[
              { label: 'letterbox', value: 'letterbox' },
              { label: 'center_crop', value: 'center_crop' },
              { label: 'direct_resize', value: 'direct_resize' },
            ]"
          />
          <Select
            v-model:value="stage.preprocess.channelOrder"
            :allow-clear="true"
            :options="[
              { label: 'rgb', value: 'rgb' },
              { label: 'bgr', value: 'bgr' },
            ]"
          />
          <InputNumber v-model:value="stage.preprocess.padValue" :min="0" :max="255" />
          <Select
            v-model:value="stage.preprocess.normalizationPreset"
            :allow-clear="true"
            :options="[
              { label: 'yolo', value: 'yolo' },
              { label: 'imagenet', value: 'imagenet' },
              { label: 'symmetric', value: 'symmetric' },
              { label: 'custom', value: 'custom' },
            ]"
          />
        </template>
        <template
          v-if="
            stage.type === 'inference' &&
            stage.preprocessEnabled &&
            stage.preprocess.normalizationPreset === 'custom'
          "
        >
          <InputNumber v-model:value="stage.preprocess.meanR" :step="0.01" />
          <InputNumber v-model:value="stage.preprocess.meanG" :step="0.01" />
          <InputNumber v-model:value="stage.preprocess.meanB" :step="0.01" />
          <InputNumber v-model:value="stage.preprocess.stdR" :step="0.01" />
          <InputNumber v-model:value="stage.preprocess.stdG" :step="0.01" />
          <InputNumber v-model:value="stage.preprocess.stdB" :step="0.01" />
        </template>

        <div
          v-if="stage.type === 'inference'"
          class="col-span-2 flex items-center justify-between rounded border px-2 py-1"
        >
          <span>{{ $t('page.ai.pipeline.editor.stage.enablePostprocess') }}</span>
          <Switch v-model:checked="stage.postprocessEnabled" />
        </div>
        <template v-if="stage.type === 'inference' && stage.postprocessEnabled">
          <Select
            v-model:value="stage.postprocess.type"
            :allow-clear="true"
            :options="[
              { label: 'yolov8_detection', value: 'yolov8_detection' },
              { label: 'yolov5_detection', value: 'yolov5_detection' },
              { label: 'classification', value: 'classification' },
              { label: 'segmentation', value: 'segmentation' },
              { label: 'yolov8_pose', value: 'yolov8_pose' },
              { label: 'anomaly_detection', value: 'anomaly_detection' },
              { label: 'passthrough', value: 'passthrough' },
            ]"
          />
          <Select
            v-model:value="stage.postprocess.nmsVariant"
            :allow-clear="true"
            :options="[
              { label: 'classic', value: 'classic' },
              { label: 'soft', value: 'soft' },
              { label: 'diou', value: 'diou' },
            ]"
          />
          <InputNumber v-model:value="stage.postprocess.topK" :min="1" />
          <InputNumber v-model:value="stage.postprocess.maxDetections" :min="1" />
          <InputNumber v-model:value="stage.postprocess.numKeypoints" :min="1" />
          <InputNumber
            v-model:value="stage.postprocess.anomalyThreshold"
            :min="0"
            :max="1"
            :step="0.01"
          />
          <div class="col-span-2 flex items-center justify-between rounded border px-2 py-1">
            <span>{{ $t('page.ai.pipeline.editor.stage.applySoftmax') }}</span>
            <Switch v-model:checked="stage.postprocess.applySoftmax" />
          </div>
          <InputNumber
            v-if="stage.postprocess.nmsVariant === 'soft'"
            v-model:value="stage.postprocess.softNmsSigma"
            :min="0"
            :step="0.01"
          />
          <InputNumber
            v-model:value="stage.postprocess.detectionParallelThreshold"
            :min="1"
            :placeholder="'detectionParallelThreshold'"
          />
          <InputNumber
            v-model:value="stage.postprocess.nmsPrescreenMultiplier"
            :min="1"
            :placeholder="'nmsPrescreenMultiplier'"
          />
          <InputNumber
            v-model:value="stage.postprocess.classificationSmallClassFastPath"
            :min="1"
            :placeholder="'classificationSmallClassFastPath'"
          />
          <InputNumber
            v-model:value="stage.postprocess.segmentationParallelMinPixels"
            :min="1"
            :placeholder="'segmentationParallelMinPixels'"
          />
        </template>

        <template v-if="stage.type === 'tracker'">
          <div>
            <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.algorithm') }}</div>
            <Select
              v-model:value="stage.algorithm"
              :options="[
                { label: 'sort', value: 'sort' },
                { label: 'deep_sort', value: 'deep_sort' },
              ]"
            />
          </div>
          <div v-if="stage.algorithm === 'deep_sort'">
            <div class="mb-1">{{ $t('page.ai.pipeline.editor.stage.reidModelId') }}</div>
            <Select
              v-model:value="stage.reidModelId"
              :options="modelOptions"
              show-search
              :placeholder="$t('page.ai.pipeline.editor.stage.reidModelId')"
            />
          </div>
        </template>

        <div
          v-if="stage.type === 'frame_transform' || stage.type === 'result_processor'"
          class="col-span-2 space-y-2"
        >
          <div class="flex items-center justify-between">
            <span>{{ $t('page.ai.pipeline.editor.stage.configEntries') }}</span>
            <Button size="small" type="dashed" @click="emit('addConfigEntry')">
              {{ $t('page.ai.pipeline.editor.actions.addConfigEntry') }}
            </Button>
          </div>
          <div
            v-for="(entry, ei) in stage.configEntries"
            :key="ei"
            class="grid grid-cols-4 gap-2"
          >
            <Input v-model:value="entry.key" :placeholder="$t('page.ai.pipeline.editor.config.key')" />
            <Input v-model:value="entry.value" :placeholder="$t('page.ai.pipeline.editor.config.value')" />
            <Select
              v-model:value="entry.valueType"
              :options="[
                { label: 'string', value: 'string' },
                { label: 'number', value: 'number' },
                { label: 'boolean', value: 'boolean' },
              ]"
            />
            <Button danger type="link" @click="emit('removeConfigEntry', ei)">
              {{ $t('common.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>
