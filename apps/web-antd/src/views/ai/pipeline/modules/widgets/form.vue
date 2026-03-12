<script lang="ts" setup>
import type {
  AiAlgorithmInfo,
  AiModelInfo,
  AiPipelineInfo,
  AiPipelineValidationReport,
  Recordable,
} from '@vben/types';

import { computed, nextTick, ref } from 'vue';

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
  fetchAiAlgorithms,
  fetchAiModels,
  fetchAiPipeline,
  updateAiPipeline,
  validateAiPipeline,
} from '#/api';

import { samplingTypeOptions, validateStageOrder } from '../schemas';
import AlarmRuleCard from './alarm-rule-card.vue';
import StageCard from './stage-card.vue';

defineOptions({ name: 'PipelineEditorForm' });

const emit = defineEmits<{
  saved: [];
}>();

interface FormOpenData {
  type: FormOpenType;
  id?: number;
}

function createDefaultInferenceStage(): Recordable<any> {
  return {
    confidenceThreshold: 0.5,
    enablePreprocess: false,
    modelId: '',
    nmsIouThreshold: undefined,
    type: 'inference',
  };
}

function createDefaultAlarmRule(): Recordable<any> {
  return {
    condition: { class: '', minConfidence: 0.5 },
    conditionType: 'class_detected',
    cooldownSecs: 60,
    name: '',
    severity: 'warning',
  };
}

function normalizeSampling(
  value: Recordable<any> | undefined,
): Recordable<any> {
  return value?.type ? { ...value } : { type: 'every_frame' };
}

function normalizeStage(stage: Recordable<any>): Recordable<any> {
  if (stage.type === 'frame_transform' || stage.type === 'result_processor') {
    return {
      config: stage.config ?? {},
      moduleId: stage.module_id ?? stage.moduleId ?? '',
      type: stage.type,
    };
  }

  if (stage.type === 'tracker') {
    const tracker = stage.algorithm;
    const isDeepSort =
      tracker &&
      typeof tracker === 'object' &&
      'deep_sort' in tracker &&
      tracker.deep_sort;

    return {
      algorithm: isDeepSort ? 'deep_sort' : 'sort',
      maxAge: Number(stage.max_age ?? stage.maxAge ?? 100),
      reidModelId: isDeepSort ? (tracker.deep_sort?.reid_model_id ?? '') : '',
      type: 'tracker',
    };
  }

  const inputSize = Array.isArray(stage.input_size) ? stage.input_size : [];
  return {
    confidenceThreshold: Number(
      stage.confidence_threshold ?? stage.confidenceThreshold ?? 0.5,
    ),
    enablePreprocess: Boolean(stage.preprocess ?? stage.enablePreprocess),
    inputHeight: inputSize[1] ?? stage.inputHeight,
    inputWidth: inputSize[0] ?? stage.inputWidth,
    modelId: String(stage.model_id ?? stage.modelId ?? ''),
    nmsIouThreshold: stage.nms_iou_threshold ?? stage.nmsIouThreshold,
    postprocessOverride: stage.postprocess ?? stage.postprocessOverride,
    preprocessOverride: stage.preprocess
      ? {
          channelOrder: stage.preprocess.channel_order ?? 'rgb',
          normalization: stage.preprocess.normalization,
          padValue: stage.preprocess.pad_value,
          resizeMode: stage.preprocess.resize_mode ?? 'letterbox',
        }
      : stage.preprocessOverride,
    type: 'inference',
  };
}

function pointsFromZone(
  zone: Array<[number, number] | Recordable<any>> | undefined,
): Array<Recordable<any>> {
  return (zone ?? []).map((point) => {
    if (Array.isArray(point)) {
      return { x: Number(point[0] ?? 0), y: Number(point[1] ?? 0) };
    }

    return {
      x: Number(point.x ?? 0),
      y: Number(point.y ?? 0),
    };
  });
}

function normalizeAlarmRule(rule: Recordable<any>): Recordable<any> {
  const condition = (rule.condition ?? {}) as Recordable<any>;
  const conditionType = String(condition.type ?? 'class_detected');
  const shared = {
    cooldownSecs: Number(rule.cooldown_secs ?? rule.cooldownSecs ?? 60),
    minDurationSecs:
      rule.min_duration_secs ?? rule.minDurationSecs ?? undefined,
    name: rule.name ?? '',
    severity: rule.severity ?? 'warning',
  };

  if (conditionType === 'anomaly_detected') {
    return {
      ...shared,
      condition: { minScore: Number(condition.min_score ?? 0.5) },
      conditionType,
    };
  }

  if (conditionType === 'count_exceeds') {
    return {
      ...shared,
      condition: {
        class: condition.class ?? '',
        threshold: Number(condition.threshold ?? 1),
      },
      conditionType,
    };
  }

  if (conditionType === 'custom_wasm') {
    return {
      ...shared,
      condition: {
        config: condition.config ?? {},
        moduleId: condition.module_id ?? condition.moduleId ?? '',
      },
      conditionType,
    };
  }

  if (conditionType === 'line_crossing') {
    const line = Array.isArray(condition.line) ? condition.line : [];
    return {
      ...shared,
      condition: {
        class: condition.class ?? '',
        direction: condition.direction ?? 'any',
        endX: Number(line[1]?.[0] ?? 1),
        endY: Number(line[1]?.[1] ?? 1),
        startX: Number(line[0]?.[0] ?? 0),
        startY: Number(line[0]?.[1] ?? 0),
      },
      conditionType,
    };
  }

  if (conditionType === 'zone_dwell') {
    return {
      ...shared,
      condition: {
        class: condition.class ?? '',
        cooldownMs: Number(condition.cooldown_ms ?? 0),
        dwellTimeoutMs: Number(condition.dwell_timeout_ms ?? 60_000),
        zone: pointsFromZone(condition.zone),
      },
      conditionType,
    };
  }

  if (conditionType === 'zone_intrusion') {
    return {
      ...shared,
      condition: {
        class: condition.class ?? '',
        zone: pointsFromZone(condition.zone),
      },
      conditionType,
    };
  }

  return {
    ...shared,
    condition: {
      class: condition.class ?? '',
      minConfidence: Number(condition.min_confidence ?? 0.5),
    },
    conditionType: 'class_detected',
  };
}

function toApiStage(stage: Recordable<any>): Recordable<any> {
  if (stage.type === 'frame_transform' || stage.type === 'result_processor') {
    return {
      config: stage.config ?? {},
      module_id: stage.moduleId,
      type: stage.type,
    };
  }

  if (stage.type === 'tracker') {
    return {
      algorithm:
        stage.algorithm === 'deep_sort' && stage.reidModelId
          ? { deep_sort: { reid_model_id: stage.reidModelId } }
          : 'sort',
      max_age: Number(stage.maxAge ?? 100),
      type: 'tracker',
    };
  }

  return {
    confidence_threshold: Number(stage.confidenceThreshold ?? 0.5),
    input_size:
      stage.inputWidth && stage.inputHeight
        ? [Number(stage.inputWidth), Number(stage.inputHeight)]
        : undefined,
    model_id: stage.modelId,
    nms_iou_threshold:
      stage.nmsIouThreshold === undefined || stage.nmsIouThreshold === null
        ? undefined
        : Number(stage.nmsIouThreshold),
    postprocess: stage.postprocessOverride ?? undefined,
    preprocess: stage.enablePreprocess
      ? {
          channel_order: stage.preprocessOverride?.channelOrder ?? 'rgb',
          normalization: stage.preprocessOverride?.normalization,
          pad_value: stage.preprocessOverride?.padValue,
          resize_mode: stage.preprocessOverride?.resizeMode ?? 'letterbox',
        }
      : undefined,
    type: 'inference',
  };
}

function zoneToPairs(zone: Array<Recordable<any>> | undefined): number[][] {
  return (zone ?? []).map((point) => [
    Number(point.x ?? 0),
    Number(point.y ?? 0),
  ]);
}

function toApiAlarmRule(rule: Recordable<any>): Recordable<any> {
  const base = {
    cooldown_secs: Number(rule.cooldownSecs ?? 60),
    min_duration_secs:
      rule.minDurationSecs === undefined || rule.minDurationSecs === null
        ? undefined
        : Number(rule.minDurationSecs),
    name: rule.name,
    severity: rule.severity,
  };

  if (rule.conditionType === 'anomaly_detected') {
    return {
      ...base,
      condition: {
        min_score: Number(rule.condition?.minScore ?? 0.5),
        type: 'anomaly_detected',
      },
    };
  }

  if (rule.conditionType === 'count_exceeds') {
    return {
      ...base,
      condition: {
        class: rule.condition?.class || undefined,
        threshold: Number(rule.condition?.threshold ?? 1),
        type: 'count_exceeds',
      },
    };
  }

  if (rule.conditionType === 'custom_wasm') {
    return {
      ...base,
      condition: {
        config: rule.condition?.config ?? {},
        module_id: rule.condition?.moduleId,
        type: 'custom_wasm',
      },
    };
  }

  if (rule.conditionType === 'line_crossing') {
    return {
      ...base,
      condition: {
        class: rule.condition?.class || undefined,
        direction: rule.condition?.direction ?? 'any',
        line: [
          [
            Number(rule.condition?.startX ?? 0),
            Number(rule.condition?.startY ?? 0),
          ],
          [
            Number(rule.condition?.endX ?? 1),
            Number(rule.condition?.endY ?? 1),
          ],
        ],
        type: 'line_crossing',
      },
    };
  }

  if (rule.conditionType === 'zone_dwell') {
    return {
      ...base,
      condition: {
        class: rule.condition?.class || undefined,
        cooldown_ms: Number(rule.condition?.cooldownMs ?? 0),
        dwell_timeout_ms: Number(rule.condition?.dwellTimeoutMs ?? 60_000),
        type: 'zone_dwell',
        zone: zoneToPairs(rule.condition?.zone),
      },
    };
  }

  if (rule.conditionType === 'zone_intrusion') {
    return {
      ...base,
      condition: {
        class: rule.condition?.class || undefined,
        type: 'zone_intrusion',
        zone: zoneToPairs(rule.condition?.zone),
      },
    };
  }

  return {
    ...base,
    condition: {
      class: rule.condition?.class ?? '',
      min_confidence: Number(rule.condition?.minConfidence ?? 0.5),
      type: 'class_detected',
    },
  };
}

const type = ref(FormOpenType.CREATE);
const pipelineId = ref<number | undefined>();
const loading = ref(false);
const saving = ref(false);

const pipelineKey = ref('');
const pipelineName = ref('');
const sampling = ref<Recordable<any>>({ type: 'every_frame' });
const roiRegions = ref<Recordable<any>[]>([]);
const stages = ref<Recordable<any>[]>([createDefaultInferenceStage()]);
const alarmRules = ref<Recordable<any>[]>([]);
const annotation = ref<Recordable<any>>({
  draw_bboxes: true,
  draw_confidence: true,
  draw_labels: true,
  draw_segmentation: true,
  draw_track_ids: true,
  font_scale: 0.6,
  jpeg_quality: 75,
  line_thickness: 2,
  segmentation_alpha: 0.4,
});
const revision = ref(0);

const models = ref<Array<{ label: string; value: string }>>([]);
const algorithms = ref<Array<{ label: string; value: string }>>([]);
const validationResult = ref<AiPipelineValidationReport | null>(null);

const isEdit = computed(() => type.value === FormOpenType.EDIT);

const stageErrors = computed(() => validateStageOrder(stages.value));

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
  pipelineId.value = data.id;
  validationResult.value = null;

  loading.value = true;
  try {
    const [modelList, algoList] = await Promise.all([
      fetchAiModels(),
      fetchAiAlgorithms(),
    ]);
    models.value = (modelList ?? []).map((model: AiModelInfo) => ({
      label: `${model.name} (${model.version})`,
      value: String(model.id),
    }));
    algorithms.value = (algoList ?? []).map((algorithm: AiAlgorithmInfo) => ({
      label: `${algorithm.name} (${algorithm.version})`,
      value: String(algorithm.id),
    }));

    if (data.type === FormOpenType.EDIT && data.id) {
      const pipeline: AiPipelineInfo = await fetchAiPipeline(data.id);
      pipelineKey.value = pipeline.key;
      pipelineName.value = pipeline.name;
      sampling.value = normalizeSampling(pipeline.sampling);
      roiRegions.value = pipeline.roiRegions ?? [];
      stages.value = (pipeline.stages ?? []).map((stage: Recordable<any>) =>
        normalizeStage(stage.config ?? stage),
      );
      alarmRules.value = (pipeline.alarmRules ?? []).map(
        (rule: Recordable<any>) => normalizeAlarmRule(rule),
      );
      annotation.value = pipeline.annotation ?? annotation.value;
      revision.value = pipeline.revision ?? 0;
    } else {
      pipelineKey.value = '';
      pipelineName.value = '';
      sampling.value = { type: 'every_frame' };
      roiRegions.value = [];
      stages.value = [createDefaultInferenceStage()];
      alarmRules.value = [];
      revision.value = 0;
      annotation.value = {
        draw_bboxes: true,
        draw_confidence: true,
        draw_labels: true,
        draw_segmentation: true,
        draw_track_ids: true,
        font_scale: 0.6,
        jpeg_quality: 75,
        line_thickness: 2,
        segmentation_alpha: 0.4,
      };
    }
  } catch (error) {
    console.error('Failed to init pipeline editor:', error);
  } finally {
    loading.value = false;
  }
}

function addStage() {
  stages.value = [...stages.value, createDefaultInferenceStage()];
}

function removeStage(index: number) {
  const nextStages = [...stages.value];
  nextStages.splice(index, 1);
  stages.value = nextStages;
}

function updateStage(index: number, stage: Recordable<any>) {
  const nextStages = [...stages.value];
  nextStages[index] = stage;
  stages.value = nextStages;
}

function moveStage(index: number, delta: number) {
  const nextStages = [...stages.value];
  const target = index + delta;
  if (target < 0 || target >= nextStages.length) return;
  [nextStages[index]!, nextStages[target]!] = [
    nextStages[target]!,
    nextStages[index]!,
  ];
  stages.value = nextStages;

  const check = validateStageOrder(nextStages);
  if (!check.valid) {
    [nextStages[index]!, nextStages[target]!] = [
      nextStages[target]!,
      nextStages[index]!,
    ];
    stages.value = nextStages;
    message.warning(check.errors[0] ?? 'Invalid stage order');
  }
}

function onDragEnd() {
  const check = validateStageOrder(stages.value);
  if (!check.valid) {
    message.warning(check.errors[0] ?? 'Invalid stage order');
  }
}

function addAlarmRule() {
  alarmRules.value = [...alarmRules.value, createDefaultAlarmRule()];
}

function removeAlarmRule(index: number) {
  const nextRules = [...alarmRules.value];
  nextRules.splice(index, 1);
  alarmRules.value = nextRules;
}

function updateAlarmRule(index: number, rule: Recordable<any>) {
  const nextRules = [...alarmRules.value];
  nextRules[index] = rule;
  alarmRules.value = nextRules;
}

function updateAnnotation(field: string, value: any) {
  annotation.value = { ...annotation.value, [field]: value };
}

function updateSampling(field: string, value: any) {
  sampling.value = { ...sampling.value, [field]: value };
}

async function handleValidate() {
  if (!pipelineId.value) {
    message.warning($t('page.ai.pipeline.messages.saveBeforeValidate'));
    return;
  }
  try {
    validationResult.value = await validateAiPipeline(pipelineId.value);
    if (validationResult.value.valid) {
      message.success($t('page.ai.pipeline.validation.pass'));
    }
  } catch {
    message.error($t('page.ai.pipeline.validation.fail'));
  }
}

async function handleSave() {
  if (!pipelineKey.value) {
    message.warning($t('page.ai.pipeline.messages.keyRequired'));
    return;
  }
  if (!pipelineName.value) {
    message.warning($t('page.ai.pipeline.messages.nameRequired'));
    return;
  }

  const check = validateStageOrder(stages.value);
  if (!check.valid) {
    message.error(check.errors.join('\n'));
    return;
  }

  saving.value = true;
  try {
    const payload = {
      alarmRules: alarmRules.value.map((rule) => toApiAlarmRule(rule)),
      annotation: annotation.value,
      key: pipelineKey.value.trim(),
      name: pipelineName.value.trim(),
      revision: revision.value,
      roiRegions: roiRegions.value,
      sampling: normalizeSampling(sampling.value),
      stages: stages.value.map((stage) => toApiStage(stage)),
    };

    await (isEdit.value && pipelineId.value
      ? updateAiPipeline({ id: pipelineId.value, ...payload })
      : createAiPipeline(payload));
    message.success(
      isEdit.value
        ? $t('common.action.updateSuccess')
        : $t('common.action.createSuccess'),
    );
    modalApi.close();
    emit('saved');
  } catch (error: any) {
    message.error(error?.message ?? $t('page.ai.pipeline.messages.saveFailed'));
  } finally {
    saving.value = false;
  }
}

const draggableStages = computed({
  get: () => stages.value,
  set: (value) => {
    stages.value = value;
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
            <FormItem label="Key" required>
              <Input
                v-model:value="pipelineKey"
                :disabled="isEdit"
                placeholder="e.g. yolov8_person"
              />
            </FormItem>
            <FormItem :label="$t('page.ai.pipeline.name')" required>
              <Input
                v-model:value="pipelineName"
                placeholder="e.g. Person Detection Pipeline"
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- Sampling -->
      <Card
        size="small"
        :title="$t('page.ai.pipeline.editor.sections.sampling')"
      >
        <Form layout="vertical" :colon="false" size="small">
          <FormItem :label="$t('page.ai.pipeline.editor.sampling.type')">
            <Select
              :value="sampling?.type ?? 'every_frame'"
              :options="samplingTypeOptions"
              @change="(v: any) => updateSampling('type', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem
            v-if="sampling?.type === 'fixed_interval'"
            :label="$t('page.ai.pipeline.editor.sampling.everyNFrames')"
          >
            <InputNumber
              :value="sampling?.every_n_frames ?? 5"
              :min="1"
              @change="(v: any) => updateSampling('every_n_frames', v)"
              class="w-full"
            />
          </FormItem>
          <FormItem
            v-if="sampling?.type === 'target_fps'"
            :label="$t('page.ai.pipeline.editor.sampling.fps')"
          >
            <InputNumber
              :value="sampling?.fps ?? 5"
              :min="0.1"
              :step="0.5"
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
          v-if="draggableStages.length === 0"
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
          v-for="(rule, idx) in alarmRules"
          :key="idx"
          :rule="rule"
          :index="idx"
          :algorithms="algorithms"
          @update:rule="(v) => updateAlarmRule(idx, v)"
          @remove="removeAlarmRule(idx)"
        />

        <Empty
          v-if="alarmRules.length === 0"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="$t('common.noData')"
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
              <FormItem
                :label="$t('page.ai.pipeline.editor.annotation.drawBboxes')"
              >
                <Switch
                  :checked="annotation?.draw_bboxes ?? true"
                  @change="(v: any) => updateAnnotation('draw_bboxes', v)"
                />
              </FormItem>
              <FormItem
                :label="$t('page.ai.pipeline.editor.annotation.drawLabels')"
              >
                <Switch
                  :checked="annotation?.draw_labels ?? true"
                  @change="(v: any) => updateAnnotation('draw_labels', v)"
                />
              </FormItem>
              <FormItem
                :label="$t('page.ai.pipeline.editor.annotation.drawConfidence')"
              >
                <Switch
                  :checked="annotation?.draw_confidence ?? true"
                  @change="(v: any) => updateAnnotation('draw_confidence', v)"
                />
              </FormItem>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormItem
                :label="$t('page.ai.pipeline.editor.annotation.jpegQuality')"
              >
                <InputNumber
                  :value="annotation?.jpeg_quality ?? 75"
                  :min="1"
                  :max="100"
                  @change="(v: any) => updateAnnotation('jpeg_quality', v)"
                  class="w-full"
                />
              </FormItem>
              <FormItem
                :label="$t('page.ai.pipeline.editor.annotation.lineThickness')"
              >
                <InputNumber
                  :value="annotation?.line_thickness ?? 2"
                  :min="1"
                  :max="10"
                  @change="(v: any) => updateAnnotation('line_thickness', v)"
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
            <li v-for="(err, i) in validationResult.errors" :key="i">
              {{ err }}
            </li>
          </ul>
          <template v-if="validationResult.warnings.length > 0">
            <Divider class="my-2" />
            <ul class="list-inside list-disc text-sm text-orange-500">
              <li v-for="(warn, i) in validationResult.warnings" :key="i">
                {{ warn }}
              </li>
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
        <Button @click="handleValidate" :disabled="!isEdit">
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
