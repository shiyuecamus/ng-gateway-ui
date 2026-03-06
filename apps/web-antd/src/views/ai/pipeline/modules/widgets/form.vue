<script lang="ts" setup>
import type {
  AiAlgorithmInfo,
  AiModelInfo,
  AiPipelineConfig,
  AiPipelineValidationReport,
  Recordable,
} from '@vben/types';

import { computed, nextTick, ref, watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Divider,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Select,
  Switch,
} from 'ant-design-vue';
import draggable from 'vuedraggable';

import {
  createAiPipeline,
  deleteAiPipeline,
  fetchAiAlgorithms,
  fetchAiModels,
  fetchAiPipeline,
  makeDefaultAiPipelineConfig,
  updateAiPipeline,
  validateAiPipeline,
} from '#/api';

import {
  samplingTypeOptions,
  validateStageOrder,
} from '../schemas';

import AlarmRuleCard from './alarm-rule-card.vue';
import StageCard from './stage-card.vue';

defineOptions({ name: 'PipelineEditorForm' });

interface FormOpenData {
  type: FormOpenType;
  channelId?: number;
}

const emit = defineEmits<{
  saved: [];
}>();

const type = ref(FormOpenType.CREATE);
const channelId = ref<number | undefined>();
const loading = ref(false);
const saving = ref(false);

const config = ref<AiPipelineConfig>({
  id: '',
  name: '',
  sampling: { type: 'every_frame' },
  roiRegions: [],
  stages: [{ type: 'inference', modelId: '', confidenceThreshold: 0.5 }],
  alarmRules: [],
  annotation: {
    drawBboxes: true,
    drawLabels: true,
    drawConfidence: true,
    drawTrackIds: true,
    drawSegmentation: true,
    segmentationAlpha: 0.4,
    lineThickness: 2,
    fontScale: 0.6,
    jpegQuality: 75,
  },
});

const models = ref<Array<{ label: string; value: string }>>([]);
const algorithms = ref<Array<{ label: string; value: string }>>([]);
const validationResult = ref<AiPipelineValidationReport | null>(null);

const isEdit = computed(() => type.value === FormOpenType.EDIT);

const stageErrors = computed(() => {
  return validateStageOrder(config.value.stages ?? []);
});

const [Modal, modalApi] = useVbenDrawer({
  class: 'w-full md:w-[720px]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

async function init() {
  const data = modalApi.getData<FormOpenData>();
  type.value = data.type;
  channelId.value = data.channelId;
  validationResult.value = null;

  loading.value = true;
  try {
    const [modelList, algoList] = await Promise.all([
      fetchAiModels(),
      fetchAiAlgorithms(),
    ]);
    models.value = (modelList ?? []).map((m: AiModelInfo) => ({
      label: `${m.name} (${m.version})`,
      value: m.id,
    }));
    algorithms.value = (algoList ?? []).map((a: AiAlgorithmInfo) => ({
      label: `${a.name} (${a.version})`,
      value: a.id,
    }));

    if (data.type === FormOpenType.EDIT && data.channelId) {
      const pipeline = await fetchAiPipeline(data.channelId);
      config.value = { ...pipeline.config };
      channelId.value = pipeline.channelId;
    } else {
      config.value = await makeDefaultAiPipelineConfig('', '');
    }
  } catch (err) {
    console.error('Failed to init pipeline editor:', err);
  } finally {
    loading.value = false;
  }
}

function addStage() {
  const stages = [...(config.value.stages ?? [])];
  stages.push({ type: 'inference', modelId: '', confidenceThreshold: 0.5 });
  config.value = { ...config.value, stages };
}

function removeStage(index: number) {
  const stages = [...(config.value.stages ?? [])];
  stages.splice(index, 1);
  config.value = { ...config.value, stages };
}

function updateStage(index: number, stage: Recordable<any>) {
  const stages = [...(config.value.stages ?? [])];
  stages[index] = stage;
  config.value = { ...config.value, stages };
}

function moveStage(index: number, delta: number) {
  const stages = [...(config.value.stages ?? [])];
  const target = index + delta;
  if (target < 0 || target >= stages.length) return;
  [stages[index]!, stages[target]!] = [stages[target]!, stages[index]!];
  config.value = { ...config.value, stages };

  const check = validateStageOrder(stages);
  if (!check.valid) {
    [stages[index]!, stages[target]!] = [stages[target]!, stages[index]!];
    config.value = { ...config.value, stages };
    message.warning(check.errors[0] ?? 'Invalid stage order');
  }
}

function onDragEnd() {
  const check = validateStageOrder(config.value.stages ?? []);
  if (!check.valid) {
    message.warning(check.errors[0] ?? 'Invalid stage order');
  }
}

function addAlarmRule() {
  const rules = [...(config.value.alarmRules ?? [])];
  rules.push({
    name: '',
    severity: 'warning',
    conditionType: 'class_detected',
    cooldownSecs: 60,
    condition: {},
  });
  config.value = { ...config.value, alarmRules: rules };
}

function removeAlarmRule(index: number) {
  const rules = [...(config.value.alarmRules ?? [])];
  rules.splice(index, 1);
  config.value = { ...config.value, alarmRules: rules };
}

function updateAlarmRule(index: number, rule: Recordable<any>) {
  const rules = [...(config.value.alarmRules ?? [])];
  rules[index] = rule;
  config.value = { ...config.value, alarmRules: rules };
}

function updateAnnotation(field: string, value: any) {
  config.value = {
    ...config.value,
    annotation: { ...config.value.annotation, [field]: value },
  };
}

function updateSampling(field: string, value: any) {
  config.value = {
    ...config.value,
    sampling: { ...config.value.sampling, [field]: value },
  };
}

async function handleValidate() {
  if (!channelId.value) {
    message.warning($t('page.ai.pipeline.validation.channelRequired'));
    return;
  }
  try {
    validationResult.value = await validateAiPipeline(channelId.value);
    if (validationResult.value.valid) {
      message.success($t('page.ai.pipeline.validation.pass'));
    }
  } catch {
    message.error($t('page.ai.pipeline.validation.fail'));
  }
}

async function handleSave() {
  if (!channelId.value) {
    message.warning($t('page.ai.pipeline.validation.channelRequired'));
    return;
  }
  if (!config.value.id) {
    message.warning($t('page.ai.pipeline.validation.idRequired'));
    return;
  }
  if (!config.value.name) {
    message.warning($t('page.ai.pipeline.validation.nameRequired'));
    return;
  }

  const check = validateStageOrder(config.value.stages ?? []);
  if (!check.valid) {
    message.error(check.errors.join('\n'));
    return;
  }

  saving.value = true;
  try {
    const payload = { channelId: channelId.value, config: config.value };
    if (isEdit.value) {
      await updateAiPipeline(payload);
    } else {
      await createAiPipeline(payload);
    }
    message.success(
      isEdit.value
        ? $t('common.action.updateSuccess')
        : $t('common.action.createSuccess'),
    );
    modalApi.close();
    emit('saved');
  } catch (err: any) {
    message.error(err?.message ?? 'Save failed');
  } finally {
    saving.value = false;
  }
}

const draggableStages = computed({
  get: () => config.value.stages ?? [],
  set: (val) => {
    config.value = { ...config.value, stages: val };
  },
});
</script>

<template>
  <Modal>
    <div class="space-y-4 p-2">
      <!-- Base info -->
      <Card size="small" :title="$t('page.ai.pipeline.editor.sections.base')">
        <Form layout="vertical" :colon="false" size="small">
          <div class="grid grid-cols-2 gap-3">
            <FormItem :label="$t('page.ai.pipeline.id')" required>
              <Input
                v-model:value="config.id"
                :disabled="isEdit"
                placeholder="e.g. yolov8_person"
              />
            </FormItem>
            <FormItem :label="$t('page.ai.pipeline.name')" required>
              <Input v-model:value="config.name" placeholder="e.g. Person Detection Pipeline" />
            </FormItem>
          </div>
          <FormItem :label="$t('page.ai.pipeline.channelId')" required>
            <InputNumber
              v-model:value="channelId"
              :disabled="isEdit"
              :min="1"
              :placeholder="$t('page.ai.pipeline.editor.placeholders.channel')"
              class="w-full"
            />
          </FormItem>
        </Form>
      </Card>

      <!-- Sampling -->
      <Card size="small" :title="$t('page.ai.pipeline.editor.sections.sampling')">
        <Form layout="vertical" :colon="false" size="small">
          <FormItem :label="$t('page.ai.pipeline.editor.sampling.type')">
            <Select
              :value="config.sampling?.type ?? 'every_frame'"
              :options="samplingTypeOptions"
              @change="(v: any) => updateSampling('type', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem
            v-if="config.sampling?.type === 'fixed_interval'"
            :label="$t('page.ai.pipeline.editor.sampling.everyNFrames')"
          >
            <InputNumber
              :value="config.sampling?.everyNFrames ?? 5"
              :min="1"
              @change="(v: any) => updateSampling('everyNFrames', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem
            v-if="config.sampling?.type === 'target_fps'"
            :label="$t('page.ai.pipeline.editor.sampling.fps')"
          >
            <InputNumber
              :value="config.sampling?.fps ?? 5"
              :min="0.1" :step="0.5"
              @change="(v: any) => updateSampling('fps', v)"
              class="w-full"
            />
          </FormItem>
        </Form>
      </Card>

      <!-- Stages (draggable) -->
      <Card size="small">
        <template #title>
          <div class="flex items-center justify-between">
            <span>{{ $t('page.ai.pipeline.editor.sections.stages') }}</span>
            <Button size="small" type="primary" ghost @click="addStage">
              + {{ $t('page.ai.pipeline.editor.actions.addStage') }}
            </Button>
          </div>
        </template>

        <Alert
          v-if="!stageErrors.valid"
          type="error"
          :message="stageErrors.errors.join('; ')"
          show-icon
          class="mb-3"
        />

        <draggable
          v-model="draggableStages"
          item-key="__drag_idx"
          handle=".drag-handle"
          ghost-class="stage-ghost"
          :animation="200"
          @end="onDragEnd"
        >
          <template #item="{ element, index }">
            <StageCard
              :key="index"
              :stage="element"
              :index="index"
              :total="draggableStages.length"
              :models="models"
              :algorithms="algorithms"
              @update:stage="(v) => updateStage(index, v)"
              @remove="removeStage(index)"
              @move-up="moveStage(index, -1)"
              @move-down="moveStage(index, 1)"
            />
          </template>
        </draggable>

        <Empty
          v-if="!draggableStages.length"
          :description="$t('page.ai.pipeline.validation.stageRequired')"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
        />
      </Card>

      <!-- Alarm Rules -->
      <Card size="small">
        <template #title>
          <div class="flex items-center justify-between">
            <span>{{ $t('page.ai.pipeline.editor.sections.alarmRules') }}</span>
            <Button size="small" type="primary" ghost @click="addAlarmRule">
              + {{ $t('page.ai.pipeline.editor.actions.addRule') }}
            </Button>
          </div>
        </template>

        <AlarmRuleCard
          v-for="(rule, idx) in config.alarmRules ?? []"
          :key="idx"
          :rule="rule"
          :index="idx"
          :algorithms="algorithms"
          @update:rule="(v) => updateAlarmRule(idx, v)"
          @remove="removeAlarmRule(idx)"
        />

        <Empty
          v-if="!(config.alarmRules ?? []).length"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="No alarm rules configured"
        />
      </Card>

      <!-- Annotation -->
      <Collapse>
        <CollapsePanel
          key="annotation"
          :header="$t('page.ai.pipeline.editor.sections.annotation')"
        >
          <Form layout="vertical" :colon="false" size="small">
            <div class="grid grid-cols-3 gap-3">
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.drawBboxes')">
                <Switch
                  :checked="config.annotation?.drawBboxes ?? true"
                  @change="(v: any) => updateAnnotation('drawBboxes', v)"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.drawLabels')">
                <Switch
                  :checked="config.annotation?.drawLabels ?? true"
                  @change="(v: any) => updateAnnotation('drawLabels', v)"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.drawConfidence')">
                <Switch
                  :checked="config.annotation?.drawConfidence ?? true"
                  @change="(v: any) => updateAnnotation('drawConfidence', v)"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.drawTrackIds')">
                <Switch
                  :checked="config.annotation?.drawTrackIds ?? true"
                  @change="(v: any) => updateAnnotation('drawTrackIds', v)"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.drawSegmentation')">
                <Switch
                  :checked="config.annotation?.drawSegmentation ?? true"
                  @change="(v: any) => updateAnnotation('drawSegmentation', v)"
                />
              </FormItem>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.segmentationAlpha')">
                <InputNumber
                  :value="config.annotation?.segmentationAlpha ?? 0.4"
                  :min="0" :max="1" :step="0.1"
                  @change="(v: any) => updateAnnotation('segmentationAlpha', v)"
                  class="w-full"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.lineThickness')">
                <InputNumber
                  :value="config.annotation?.lineThickness ?? 2"
                  :min="1" :max="10"
                  @change="(v: any) => updateAnnotation('lineThickness', v)"
                  class="w-full"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.fontScale')">
                <InputNumber
                  :value="config.annotation?.fontScale ?? 0.6"
                  :min="0.1" :max="3" :step="0.1"
                  @change="(v: any) => updateAnnotation('fontScale', v)"
                  class="w-full"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.jpegQuality')">
                <InputNumber
                  :value="config.annotation?.jpegQuality ?? 75"
                  :min="1" :max="100"
                  @change="(v: any) => updateAnnotation('jpegQuality', v)"
                  class="w-full"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.pipeline.editor.annotation.maxOutputDimension')">
                <InputNumber
                  :value="config.annotation?.maxOutputDimension"
                  :min="0"
                  @change="(v: any) => updateAnnotation('maxOutputDimension', v)"
                  class="w-full"
                />
              </FormItem>
            </div>
          </Form>
        </CollapsePanel>
      </Collapse>

      <!-- Validation result -->
      <Alert
        v-if="validationResult && !validationResult.valid"
        type="error"
        show-icon
        :message="$t('page.ai.pipeline.validation.fail')"
      >
        <template #description>
          <ul class="list-inside list-disc text-sm">
            <li v-for="(err, i) in validationResult.errors" :key="i">{{ err }}</li>
          </ul>
          <template v-if="validationResult.warnings.length">
            <Divider class="my-2" />
            <ul class="list-inside list-disc text-sm text-orange-500">
              <li v-for="(warn, i) in validationResult.warnings" :key="i">{{ warn }}</li>
            </ul>
          </template>
        </template>
      </Alert>
      <Alert
        v-if="validationResult?.valid"
        type="success"
        show-icon
        :message="$t('page.ai.pipeline.validation.pass')"
      />

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-2">
        <Button @click="handleValidate" :disabled="!channelId">
          {{ $t('page.ai.pipeline.actions.validate') }}
        </Button>
        <Button type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? $t('common.save') : $t('common.create') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style>
.stage-ghost {
  opacity: 0.4;
  background: #e6f4ff;
  border: 2px dashed #1890ff;
  border-radius: 8px;
}
</style>
