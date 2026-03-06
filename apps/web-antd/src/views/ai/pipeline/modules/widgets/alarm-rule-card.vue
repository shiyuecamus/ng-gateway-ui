<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import {
  Button,
  Card,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  Tooltip,
} from 'ant-design-vue';

import {
  alarmConditionTypeOptions,
  directionOptions,
  severityOptions,
} from '../schemas';

defineOptions({ name: 'AlarmRuleCard' });

const props = defineProps<{
  rule: Recordable<any>;
  index: number;
  algorithms: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  'update:rule': [value: Recordable<any>];
  remove: [];
}>();

const ruleTitle = computed(() => {
  const name = props.rule.name || `Rule #${props.index + 1}`;
  const typeOpt = alarmConditionTypeOptions.find((o) => o.value === props.rule.conditionType);
  const typeName = typeOpt ? (typeof typeOpt.label === 'function' ? typeOpt.label() : typeOpt.label) : '';
  return typeName ? `${name} (${typeName})` : name;
});

function update(field: string, value: any) {
  emit('update:rule', { ...props.rule, [field]: value });
}

function updateCondition(field: string, value: any) {
  emit('update:rule', {
    ...props.rule,
    condition: { ...props.rule.condition, [field]: value },
  });
}
</script>

<template>
  <Card
    size="small"
    class="alarm-rule-card mb-3 border border-solid border-orange-200 transition-shadow hover:shadow-md"
  >
    <template #title>
      <span class="text-sm font-medium">{{ ruleTitle }}</span>
    </template>
    <template #extra>
      <Tooltip :title="$t('common.delete')">
        <Button size="small" type="text" danger @click="emit('remove')">×</Button>
      </Tooltip>
    </template>

    <Form layout="vertical" :colon="false" size="small">
      <div class="grid grid-cols-2 gap-3">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.name')" required>
          <Input
            :value="rule.name"
            @change="(e: any) => update('name', e.target.value)"
          />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.rule.severity')">
          <Select
            :value="rule.severity ?? 'warning'"
            :options="severityOptions"
            @change="(v: any) => update('severity', v)"
            class="w-full"
          />
        </FormItem>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.conditionType')" required>
          <Select
            :value="rule.conditionType"
            :options="alarmConditionTypeOptions.map((o) => ({ label: typeof o.label === 'function' ? o.label() : o.label, value: o.value }))"
            @change="(v: any) => update('conditionType', v)"
            class="w-full"
          />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.rule.cooldownSecs')">
          <InputNumber
            :value="rule.cooldownSecs ?? 60"
            :min="0"
            @change="(v: any) => update('cooldownSecs', v)"
            class="w-full"
          />
        </FormItem>
      </div>

      <!-- class_detected -->
      <template v-if="rule.conditionType === 'class_detected'">
        <div class="grid grid-cols-2 gap-3">
          <FormItem :label="$t('page.ai.pipeline.editor.rule.class')" required>
            <Input :value="rule.condition?.class" @change="(e: any) => updateCondition('class', e.target.value)" />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.rule.minConfidence')">
            <InputNumber :value="rule.condition?.minConfidence ?? 0.5" :min="0" :max="1" :step="0.05" @change="(v: any) => updateCondition('minConfidence', v)" class="w-full" />
          </FormItem>
        </div>
      </template>

      <!-- count_exceeds -->
      <template v-if="rule.conditionType === 'count_exceeds'">
        <div class="grid grid-cols-2 gap-3">
          <FormItem :label="$t('page.ai.pipeline.editor.rule.classOptional')">
            <Input :value="rule.condition?.class" @change="(e: any) => updateCondition('class', e.target.value)" />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.rule.threshold')" required>
            <InputNumber :value="rule.condition?.threshold ?? 5" :min="1" @change="(v: any) => updateCondition('threshold', v)" class="w-full" />
          </FormItem>
        </div>
      </template>

      <!-- zone_intrusion -->
      <template v-if="rule.conditionType === 'zone_intrusion'">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.classOptional')">
          <Input :value="rule.condition?.class" @change="(e: any) => updateCondition('class', e.target.value)" />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.rule.zoneJson')" required>
          <Input.TextArea
            :value="typeof rule.condition?.zone === 'string' ? rule.condition.zone : JSON.stringify(rule.condition?.zone ?? [], null, 2)"
            :rows="3"
            placeholder='[{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.9,"y":0.9},{"x":0.1,"y":0.9}]'
            @change="(e: any) => { try { updateCondition('zone', JSON.parse(e.target.value)); } catch {} }"
          />
        </FormItem>
      </template>

      <!-- line_crossing -->
      <template v-if="rule.conditionType === 'line_crossing'">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.classOptional')">
          <Input :value="rule.condition?.class" @change="(e: any) => updateCondition('class', e.target.value)" />
        </FormItem>
        <div class="grid grid-cols-4 gap-3">
          <FormItem :label="$t('page.ai.pipeline.editor.rule.lineStartX')">
            <InputNumber :value="rule.condition?.startX ?? 0" :min="0" :max="1" :step="0.01" @change="(v: any) => updateCondition('startX', v)" class="w-full" />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.rule.lineStartY')">
            <InputNumber :value="rule.condition?.startY ?? 0" :min="0" :max="1" :step="0.01" @change="(v: any) => updateCondition('startY', v)" class="w-full" />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.rule.lineEndX')">
            <InputNumber :value="rule.condition?.endX ?? 1" :min="0" :max="1" :step="0.01" @change="(v: any) => updateCondition('endX', v)" class="w-full" />
          </FormItem>
          <FormItem :label="$t('page.ai.pipeline.editor.rule.lineEndY')">
            <InputNumber :value="rule.condition?.endY ?? 1" :min="0" :max="1" :step="0.01" @change="(v: any) => updateCondition('endY', v)" class="w-full" />
          </FormItem>
        </div>
        <FormItem :label="$t('page.ai.pipeline.editor.rule.direction')">
          <Select :value="rule.condition?.direction ?? 'any'" :options="directionOptions" @change="(v: any) => updateCondition('direction', v)" class="w-full" />
        </FormItem>
      </template>

      <!-- anomaly_detected -->
      <template v-if="rule.conditionType === 'anomaly_detected'">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.minScore')">
          <InputNumber :value="rule.condition?.minScore ?? 0.5" :min="0" :max="1" :step="0.05" @change="(v: any) => updateCondition('minScore', v)" class="w-full" />
        </FormItem>
      </template>

      <!-- custom_wasm -->
      <template v-if="rule.conditionType === 'custom_wasm'">
        <FormItem :label="$t('page.ai.pipeline.editor.rule.moduleId')" required>
          <Select :value="rule.condition?.moduleId" :options="algorithms" show-search allow-clear @change="(v: any) => updateCondition('moduleId', v)" class="w-full" />
        </FormItem>
        <FormItem :label="$t('page.ai.pipeline.editor.rule.configJson')">
          <Input.TextArea
            :value="typeof rule.condition?.config === 'string' ? rule.condition.config : JSON.stringify(rule.condition?.config ?? {}, null, 2)"
            :rows="3"
            @change="(e: any) => { try { updateCondition('config', JSON.parse(e.target.value)); } catch {} }"
          />
        </FormItem>
      </template>
    </Form>
  </Card>
</template>

<style scoped>
.alarm-rule-card :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0 12px;
}
.alarm-rule-card :deep(.ant-card-body) {
  padding: 12px;
}
</style>
