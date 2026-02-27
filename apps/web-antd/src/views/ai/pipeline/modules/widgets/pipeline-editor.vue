<script lang="ts" setup>
import type {
  AiAlgorithmInfo,
  AiModelInfo,
  AiPipelineSummary,
  ChannelInfo,
} from '@vben/types';
import type {
  ConfigEntry,
  PipelineEditorFormValues,
  PipelineEditorMode,
  PipelineEditorStage,
  PipelineEditorSubmitPayload,
} from '../schemas';

import { nextTick, reactive, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Step,
  Steps,
  message,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  fetchAiAlgorithms,
  fetchAiModels,
  fetchChannelList,
} from '#/api';
import {
  buildDefaultEditorValues,
  usePipelineAnnotationFormSchema,
  usePipelineBaseFormSchema,
  usePipelineRoiFormSchema,
  usePipelineRulesFormSchema,
  usePipelineSamplingFormSchema,
  usePipelineStagesFormSchema,
  mapEditorValuesToPayload,
  mapSummaryToEditorValues,
} from '../schemas';
import AlarmRuleCard from './alarm-rule-card.vue';
import AnnotationSection from './annotation-section.vue';
import RoiSection from './roi-section.vue';
import SamplingSection from './sampling-section.vue';
import StageCard from './stage-card.vue';

defineOptions({ name: 'AiPipelineEditor' });

const emit = defineEmits<{ submit: [payload: PipelineEditorSubmitPayload] }>();
const { handleRequest } = useRequestHandler();
const loading = ref(false);
const mode = ref<PipelineEditorMode>('create');
const channels = ref<ChannelInfo[]>([]);
const models = ref<AiModelInfo[]>([]);
const algorithms = ref<AiAlgorithmInfo[]>([]);
const channelLoadFailed = ref(false);
const currentStep = ref(0);
const formState = reactive<PipelineEditorFormValues>(buildDefaultEditorValues());

const [BaseForm, baseFormApi] = useVbenForm({
  schema: usePipelineBaseFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    show: false,
  },
  handleSubmit: (values) => {
    formState.channelId = Number(values.channelId);
    formState.id = String(values.id ?? '');
    formState.name = String(values.name ?? '');
    currentStep.value = 1;
  },
});

const [RoiForm] = useVbenForm({
  schema: usePipelineRoiFormSchema(),
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 0;
  },
  handleSubmit: () => {
    currentStep.value = 2;
  },
});

const [SamplingForm] = useVbenForm({
  schema: usePipelineSamplingFormSchema(),
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 1;
  },
  handleSubmit: () => {
    currentStep.value = 3;
  },
});

const [StagesForm] = useVbenForm({
  schema: usePipelineStagesFormSchema(),
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 2;
  },
  handleSubmit: () => {
    currentStep.value = 4;
  },
});

const [RulesForm] = useVbenForm({
  schema: usePipelineRulesFormSchema(),
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 3;
  },
  handleSubmit: () => {
    currentStep.value = 5;
  },
});

const [AnnotationForm] = useVbenForm({
  schema: usePipelineAnnotationFormSchema(),
  submitButtonOptions: {
    content: mode.value === 'create' ? $t('common.create') : $t('common.save'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 4;
  },
  handleSubmit: () => {
    submitPipeline();
  },
});

const [Drawer, drawerApi] = useVbenDrawer({
  class: 'w-2/3',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    drawerApi.close();
  },
  onOpenChange: async (isOpen) => {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

function resetFormState(values: PipelineEditorFormValues) {
  Object.assign(formState, values);
}

function inRange(v: number) {
  return v >= 0 && v <= 1;
}
function newEntry(): ConfigEntry {
  return { key: '', value: '', valueType: 'string' };
}
function addStage() {
  formState.stages.push({
    type: 'inference',
    configEntries: [],
    modelId: '',
    confidenceThreshold: 0.5,
    nmsIouThreshold: 0.45,
    preprocessEnabled: false,
    preprocess: {},
    postprocessEnabled: false,
    postprocess: {},
  });
}
function removeStage(index: number) {
  formState.stages.splice(index, 1);
}
function addStageEntry(stage: PipelineEditorStage) {
  stage.configEntries.push(newEntry());
}
function removeStageEntry(stage: PipelineEditorStage, index: number) {
  stage.configEntries.splice(index, 1);
}
function addRoiRegion() {
  formState.roiRegions.push({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 });
}
function removeRoiRegion(index: number) {
  formState.roiRegions.splice(index, 1);
}
function addRule() {
  formState.alarmRules.push({
    name: '',
    severity: 'warning',
    cooldownSecs: 60,
    conditionType: 'class_detected',
    minConfidence: 0.5,
    zonePoints: [],
    lineStart: { x: 0, y: 0 },
    lineEnd: { x: 1, y: 1 },
    customConfigEntries: [],
  });
}
function removeRule(index: number) {
  formState.alarmRules.splice(index, 1);
}
function addZonePoint(ruleIndex: number) {
  formState.alarmRules[ruleIndex]?.zonePoints.push({ x: 0, y: 0 });
}
function removeZonePoint(ruleIndex: number, pointIndex: number) {
  formState.alarmRules[ruleIndex]?.zonePoints.splice(pointIndex, 1);
}
function addRuleEntry(ruleIndex: number) {
  formState.alarmRules[ruleIndex]?.customConfigEntries.push(newEntry());
}
function removeRuleEntry(ruleIndex: number, entryIndex: number) {
  formState.alarmRules[ruleIndex]?.customConfigEntries.splice(entryIndex, 1);
}

async function init() {
  loading.value = true;
  channelLoadFailed.value = false;
  const data = drawerApi.getData<{ mode: PipelineEditorMode; summary?: AiPipelineSummary }>();
  mode.value = data.mode;
  await handleRequest(
    () => fetchChannelList(),
    (result) => {
      channels.value = result;
      channelLoadFailed.value = false;
    },
    () => {
      channels.value = [];
      channelLoadFailed.value = true;
    },
  );
  await handleRequest(() => fetchAiModels(), (result) => {
    models.value = result;
  });
  await handleRequest(() => fetchAiAlgorithms(), (result) => {
    algorithms.value = result;
  });
  resetFormState(mapSummaryToEditorValues(data.summary));
  baseFormApi.setValues({
    channelId: formState.channelId,
    id: formState.id,
    name: formState.name,
  });
  currentStep.value = 0;
  loading.value = false;
}

function validate(): boolean {
  if (!formState.channelId || formState.channelId <= 0) {
    message.error($t('page.ai.pipeline.validation.channelRequired'));
    return false;
  }
  if (!formState.id.trim() || !formState.name.trim()) {
    message.error($t('page.ai.pipeline.validation.basicRequired'));
    return false;
  }
  if (formState.roiEnabled) {
    const ok =
      inRange(formState.roiXMin ?? -1) &&
      inRange(formState.roiYMin ?? -1) &&
      inRange(formState.roiXMax ?? -1) &&
      inRange(formState.roiYMax ?? -1) &&
      (formState.roiXMin ?? 0) < (formState.roiXMax ?? 0) &&
      (formState.roiYMin ?? 0) < (formState.roiYMax ?? 0);
    if (!ok) {
      message.error($t('page.ai.pipeline.validation.invalidRoi'));
      return false;
    }
  }
  for (const [idx, region] of formState.roiRegions.entries()) {
    const ok =
      inRange(region.xMin) &&
      inRange(region.yMin) &&
      inRange(region.xMax) &&
      inRange(region.yMax) &&
      region.xMin < region.xMax &&
      region.yMin < region.yMax;
    if (!ok) {
      message.error($t('page.ai.pipeline.validation.invalidRoiRegion', { index: idx + 1 }));
      return false;
    }
  }
  for (const [idx, stage] of formState.stages.entries()) {
    if (stage.type === 'inference' && !stage.modelId?.trim()) {
      message.error($t('page.ai.pipeline.validation.stageModelRequired', { index: idx + 1 }));
      return false;
    }
    if ((stage.type === 'frame_transform' || stage.type === 'result_processor') && !stage.moduleId?.trim()) {
      message.error($t('page.ai.pipeline.validation.stageModuleRequired', { index: idx + 1 }));
      return false;
    }
    if (stage.type === 'tracker' && stage.algorithm === 'deep_sort' && !stage.reidModelId?.trim()) {
      message.error($t('page.ai.pipeline.validation.reidModelRequired', { index: idx + 1 }));
      return false;
    }
    for (const entry of stage.configEntries) {
      if (!entry.key.trim()) {
        message.error($t('page.ai.pipeline.validation.stageConfigKeyRequired', { index: idx + 1 }));
        return false;
      }
    }
  }
  for (const [idx, rule] of formState.alarmRules.entries()) {
    if (!rule.name.trim()) {
      message.error($t('page.ai.pipeline.validation.ruleNameRequired', { index: idx + 1 }));
      return false;
    }
    if (rule.conditionType === 'class_detected' && !rule.className?.trim()) {
      message.error($t('page.ai.pipeline.validation.ruleClassRequired', { index: idx + 1 }));
      return false;
    }
    if (rule.conditionType === 'zone_intrusion' && rule.zonePoints.length < 3) {
      message.error($t('page.ai.pipeline.validation.zonePointsRequired', { index: idx + 1 }));
      return false;
    }
    for (const point of rule.zonePoints) {
      if (!inRange(point.x) || !inRange(point.y)) {
        message.error($t('page.ai.pipeline.validation.zonePointOutOfRange', { index: idx + 1 }));
        return false;
      }
    }
    if (
      rule.conditionType === 'line_crossing' &&
      (!inRange(rule.lineStart.x) ||
        !inRange(rule.lineStart.y) ||
        !inRange(rule.lineEnd.x) ||
        !inRange(rule.lineEnd.y))
    ) {
      message.error($t('page.ai.pipeline.validation.linePointOutOfRange', { index: idx + 1 }));
      return false;
    }
    if (rule.conditionType === 'custom_wasm' && !rule.customModuleId?.trim()) {
      message.error($t('page.ai.pipeline.validation.ruleModuleRequired', { index: idx + 1 }));
      return false;
    }
    if (rule.conditionType === 'custom_wasm') {
      for (const entry of rule.customConfigEntries) {
        if (!entry.key.trim()) {
          message.error($t('page.ai.pipeline.validation.ruleConfigKeyRequired', { index: idx + 1 }));
          return false;
        }
      }
    }
  }
  return true;
}

function submitPipeline() {
  if (!validate()) return;
  try {
    emit('submit', mapEditorValuesToPayload(formState));
  } catch {
    message.error($t('page.ai.pipeline.validation.invalidForm'));
  }
}
</script>

<template>
  <Drawer :title="mode === 'create' ? $t('page.ai.pipeline.editor.createTitle') : $t('page.ai.pipeline.editor.updateTitle')">
    <div class="space-y-4 p-4">
      <Steps :current="currentStep">
        <Step :title="$t('page.ai.pipeline.editor.sections.base')" />
        <Step :title="$t('page.ai.pipeline.editor.sections.roi')" />
        <Step :title="$t('page.ai.pipeline.editor.sections.sampling')" />
        <Step :title="$t('page.ai.pipeline.editor.sections.stages')" />
        <Step :title="$t('page.ai.pipeline.editor.sections.alarmRules')" />
        <Step :title="$t('page.ai.pipeline.editor.sections.annotation')" />
      </Steps>

      <Card v-show="currentStep === 0" :loading="loading" :title="$t('page.ai.pipeline.editor.sections.base')">
        <BaseForm>
          <template #channelId>
            <Select
              v-model:value="formState.channelId"
              class="w-full"
              :placeholder="$t('page.ai.pipeline.editor.placeholders.channel')"
              show-search
              option-filter-prop="label"
              :options="channels.map((v) => ({ value: Number(v.id), label: `${v.name} (#${v.id})` }))"
            />
            <Alert
              v-if="channelLoadFailed"
              class="mt-2"
              type="warning"
              :message="$t('page.ai.pipeline.editor.messages.channelLoadFailed')"
            />
          </template>
          <template #id>
            <Input v-model:value="formState.id" :placeholder="$t('page.ai.pipeline.id')" />
          </template>
          <template #name>
            <Input v-model:value="formState.name" :placeholder="$t('page.ai.pipeline.name')" />
          </template>
        </BaseForm>
      </Card>

      <Card v-show="currentStep === 1" :title="$t('page.ai.pipeline.editor.sections.roi')">
        <RoiSection :form-state="formState" @add-region="addRoiRegion" @remove-region="removeRoiRegion" />
        <RoiForm />
      </Card>

      <Card v-show="currentStep === 2" :title="$t('page.ai.pipeline.editor.sections.sampling')">
        <SamplingSection :form-state="formState" />
        <SamplingForm />
      </Card>

      <Card v-show="currentStep === 3" :title="$t('page.ai.pipeline.editor.sections.stages')">
        <div class="space-y-3">
          <Button type="dashed" @click="addStage">{{ $t('page.ai.pipeline.editor.actions.addStage') }}</Button>
          <StageCard
            v-for="(stage, i) in formState.stages"
            :key="i"
            :index="i"
            :stage="stage"
            :model-options="models.map((v) => ({ label: `${v.name} (${v.id})`, value: v.id }))"
            :algorithm-options="algorithms.map((v) => ({ label: `${v.name} (${v.id})`, value: v.id }))"
            @remove="removeStage(i)"
            @add-config-entry="addStageEntry(stage)"
            @remove-config-entry="removeStageEntry(stage, $event)"
          />
        </div>
        <StagesForm />
      </Card>

      <Card v-show="currentStep === 4" :title="$t('page.ai.pipeline.editor.sections.alarmRules')">
        <div class="space-y-3">
          <Button type="dashed" @click="addRule">{{ $t('page.ai.pipeline.editor.actions.addRule') }}</Button>
          <AlarmRuleCard
            v-for="(rule, i) in formState.alarmRules"
            :key="i"
            :index="i"
            :rule="rule"
            :algorithm-options="algorithms.map((v) => ({ label: `${v.name} (${v.id})`, value: v.id }))"
            @remove="removeRule(i)"
            @add-zone-point="addZonePoint(i)"
            @remove-zone-point="removeZonePoint(i, $event)"
            @add-rule-entry="addRuleEntry(i)"
            @remove-rule-entry="removeRuleEntry(i, $event)"
          />
        </div>
        <RulesForm />
      </Card>

      <Card v-show="currentStep === 5" :title="$t('page.ai.pipeline.editor.sections.annotation')">
        <AnnotationSection :form-state="formState" />
        <AnnotationForm />
      </Card>
    </div>
  </Drawer>
</template>
