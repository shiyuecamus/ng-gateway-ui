<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import {
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  Switch,
  Tooltip,
} from 'ant-design-vue';

import { stageTypeOptions, trackerAlgorithmOptions } from '../schemas';

defineOptions({ name: 'StageCard' });

const props = defineProps<{
  algorithms: Array<{ label: string; value: number | string }>;
  index: number;
  models: Array<{ label: string; value: number | string }>;
  stage: Recordable<any>;
  total: number;
}>();

const emit = defineEmits<{
  moveDown: [];
  moveUp: [];
  remove: [];
  'update:stage': [value: Recordable<any>];
}>();

function resolveOptionLabel(
  option: undefined | { label: (() => string) | string },
  fallback: string,
) {
  if (!option) return fallback;
  return typeof option.label === 'function' ? option.label() : option.label;
}

const stageTitle = computed(() => {
  const typeOpt = stageTypeOptions.find((o) => o.value === props.stage.type);
  const typeName = resolveOptionLabel(typeOpt, props.stage.type);
  return `${$t('page.ai.pipeline.stageTitle', { index: props.index + 1 })} — ${typeName}`;
});

function update(field: string, value: any) {
  emit('update:stage', { ...props.stage, [field]: value });
}
</script>

<template>
  <Card
    size="small"
    class="stage-card mb-3 border border-solid border-gray-200 transition-shadow hover:shadow-md"
  >
    <template #title>
      <div class="flex items-center gap-2">
        <span class="drag-handle cursor-grab text-gray-400 hover:text-gray-600">
          ⠿
        </span>
        <span class="text-sm font-medium">{{ stageTitle }}</span>
      </div>
    </template>
    <template #extra>
      <div class="flex items-center gap-1">
        <Tooltip title="Move up" v-if="index > 0">
          <Button size="small" type="text" @click="emit('moveUp')">↑</Button>
        </Tooltip>
        <Tooltip title="Move down" v-if="index < total - 1">
          <Button size="small" type="text" @click="emit('moveDown')">↓</Button>
        </Tooltip>
        <Tooltip :title="$t('common.delete')">
          <Button size="small" type="text" danger @click="emit('remove')">
            ×
          </Button>
        </Tooltip>
      </div>
    </template>

    <Form layout="vertical" :colon="false" size="small">
      <FormItem :label="$t('page.ai.pipeline.editor.stage.type')">
        <Select
          :value="stage.type"
          :options="
            stageTypeOptions.map((o) => ({
              label: typeof o.label === 'function' ? o.label() : o.label,
              value: o.value,
            }))
          "
          @change="(v: any) => update('type', v)"
          class="w-full"
        />
      </FormItem>

      <!-- Inference stage fields -->
      <template v-if="stage.type === 'inference'">
        <FormItem :label="$t('page.ai.pipeline.editor.stage.modelId')" required>
          <Select
            :value="stage.modelId"
            :options="models"
            show-search
            allow-clear
            @change="(v: any) => update('modelId', v)"
            class="w-full"
          />
        </FormItem>
        <div class="grid grid-cols-2 gap-3">
          <FormItem
            :label="$t('page.ai.pipeline.editor.stage.confidenceThreshold')"
          >
            <InputNumber
              :value="stage.confidenceThreshold ?? 0.5"
              :min="0"
              :max="1"
              :step="0.05"
              @change="(v: any) => update('confidenceThreshold', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem
            :label="$t('page.ai.pipeline.editor.stage.nmsIouThreshold')"
          >
            <InputNumber
              :value="stage.nmsIouThreshold"
              :min="0"
              :max="1"
              :step="0.05"
              @change="(v: any) => update('nmsIouThreshold', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.stage.inputWidth')">
            <InputNumber
              :value="stage.inputWidth"
              :min="1"
              @change="(v: any) => update('inputWidth', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.stage.inputHeight')">
            <InputNumber
              :value="stage.inputHeight"
              :min="1"
              @change="(v: any) => update('inputHeight', v)"
              class="w-full"
            />
          </FormItem>
        </div>
        <Collapse ghost>
          <CollapsePanel
            key="preprocess"
            :header="$t('page.ai.pipeline.editor.stage.enablePreprocess')"
          >
            <Switch
              :checked="!!stage.enablePreprocess"
              @change="(v: any) => update('enablePreprocess', v)"
            />
            <template v-if="stage.enablePreprocess">
              <FormItem
                :label="$t('page.ai.pipeline.editor.stage.resizeMode')"
                class="mt-2"
              >
                <Select
                  :value="stage.preprocessOverride?.resizeMode ?? 'letterbox'"
                  :options="[
                    { label: 'Letterbox', value: 'letterbox' },
                    { label: 'Direct Resize', value: 'direct_resize' },
                    { label: 'Center Crop', value: 'center_crop' },
                  ]"
                  @change="
                    (v: any) =>
                      update('preprocessOverride', {
                        ...stage.preprocessOverride,
                        resizeMode: v,
                      })
                  "
                  class="w-full"
                />
              </FormItem>
              <FormItem
                :label="$t('page.ai.pipeline.editor.stage.channelOrder')"
              >
                <Select
                  :value="stage.preprocessOverride?.channelOrder ?? 'rgb'"
                  :options="[
                    { label: 'RGB', value: 'rgb' },
                    { label: 'BGR', value: 'bgr' },
                  ]"
                  @change="
                    (v: any) =>
                      update('preprocessOverride', {
                        ...stage.preprocessOverride,
                        channelOrder: v,
                      })
                  "
                  class="w-full"
                />
              </FormItem>
            </template>
          </CollapsePanel>
        </Collapse>
      </template>

      <!-- Tracker stage fields -->
      <template v-if="stage.type === 'tracker'">
        <FormItem :label="$t('page.ai.pipeline.editor.stage.algorithm')">
          <Select
            :value="stage.algorithm ?? 'sort'"
            :options="
              trackerAlgorithmOptions.map((o) => ({
                label: typeof o.label === 'function' ? o.label() : o.label,
                value: o.value,
              }))
            "
            @change="(v: any) => update('algorithm', v)"
            class="w-full"
          />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.stage.maxAge')">
          <InputNumber
            :value="stage.maxAge ?? 30"
            :min="1"
            @change="(v: any) => update('maxAge', v)"
            class="w-full"
          />
        </FormItem>
        <FormItem
          v-if="stage.algorithm === 'deep_sort'"
          :label="$t('page.ai.pipeline.editor.stage.reidModelId')"
        >
          <Select
            :value="stage.reidModelId"
            :options="models"
            show-search
            allow-clear
            @change="(v: any) => update('reidModelId', v)"
            class="w-full"
          />
        </FormItem>
      </template>

      <!-- FrameTransform stage fields -->
      <template v-if="stage.type === 'frame_transform'">
        <FormItem
          :label="$t('page.ai.pipeline.editor.stage.moduleId')"
          required
        >
          <Select
            :value="stage.moduleId"
            :options="algorithms.filter((a) => a.value)"
            show-search
            allow-clear
            @change="(v: any) => update('moduleId', v)"
            class="w-full"
          />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.stage.configJson')">
          <Input.TextArea
            :value="
              typeof stage.config === 'string'
                ? stage.config
                : JSON.stringify(stage.config ?? {}, null, 2)
            "
            :rows="3"
            @change="
              (e: any) => {
                try {
                  update('config', JSON.parse(e.target.value));
                } catch {}
              }
            "
          />
        </FormItem>
      </template>

      <!-- ResultProcessor stage fields -->
      <template v-if="stage.type === 'result_processor'">
        <FormItem
          :label="$t('page.ai.pipeline.editor.stage.moduleId')"
          required
        >
          <Select
            :value="stage.moduleId"
            :options="algorithms.filter((a) => a.value)"
            show-search
            allow-clear
            @change="(v: any) => update('moduleId', v)"
            class="w-full"
          />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.stage.configJson')">
          <Input.TextArea
            :value="
              typeof stage.config === 'string'
                ? stage.config
                : JSON.stringify(stage.config ?? {}, null, 2)
            "
            :rows="3"
            @change="
              (e: any) => {
                try {
                  update('config', JSON.parse(e.target.value));
                } catch {}
              }
            "
          />
        </FormItem>
      </template>
    </Form>
  </Card>
</template>

<style scoped>
.stage-card :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0 12px;
}
.stage-card :deep(.ant-card-body) {
  padding: 12px;
}
.stage-ghost {
  opacity: 0.4;
  background: #e6f4ff;
  border: 2px dashed #1890ff;
}
</style>
