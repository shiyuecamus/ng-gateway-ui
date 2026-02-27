<script lang="ts" setup>
import type { PipelineEditorAlarmRule } from '../schemas';

import { $t } from '@vben/locales';
import { Button, Card, Input, InputNumber, Select } from 'ant-design-vue';

defineOptions({ name: 'AiPipelineAlarmRuleCard' });

defineProps<{
  rule: PipelineEditorAlarmRule;
  index: number;
  algorithmOptions: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  remove: [];
  addZonePoint: [];
  removeZonePoint: [pointIndex: number];
  addRuleEntry: [];
  removeRuleEntry: [entryIndex: number];
}>();
</script>

<template>
  <Card size="small">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span>{{ $t('page.ai.pipeline.ruleTitle', { index: index + 1 }) }}</span>
        <Button danger type="link" @click="emit('remove')">
          {{ $t('common.delete') }}
        </Button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.rule.name') }}</div>
          <Input v-model:value="rule.name" :placeholder="$t('page.ai.pipeline.editor.rule.name')" />
        </div>
        <div>
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.rule.severity') }}</div>
          <Select
            v-model:value="rule.severity"
            :options="[
              { label: 'info', value: 'info' },
              { label: 'warning', value: 'warning' },
              { label: 'critical', value: 'critical' },
            ]"
          />
        </div>
        <div>
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.rule.cooldownSecs') }}</div>
          <InputNumber v-model:value="rule.cooldownSecs" :min="0" class="w-full" />
        </div>
        <div>
          <div class="mb-1">{{ $t('page.ai.pipeline.editor.rule.conditionType') }}</div>
          <Select
            v-model:value="rule.conditionType"
            :options="[
              { label: 'class_detected', value: 'class_detected' },
              { label: 'count_exceeds', value: 'count_exceeds' },
              { label: 'zone_intrusion', value: 'zone_intrusion' },
              { label: 'line_crossing', value: 'line_crossing' },
              { label: 'anomaly_detected', value: 'anomaly_detected' },
              { label: 'custom_wasm', value: 'custom_wasm' },
            ]"
          />
        </div>
        <Input
          v-if="
            rule.conditionType === 'class_detected' ||
            rule.conditionType === 'count_exceeds' ||
            rule.conditionType === 'zone_intrusion' ||
            rule.conditionType === 'line_crossing'
          "
          v-model:value="rule.className"
          :placeholder="$t('page.ai.pipeline.editor.rule.classOptional')"
        />
        <InputNumber
          v-if="rule.conditionType === 'class_detected'"
          v-model:value="rule.minConfidence"
          :min="0"
          :max="1"
          :step="0.01"
        />
        <InputNumber
          v-if="rule.conditionType === 'count_exceeds'"
          v-model:value="rule.threshold"
          :min="1"
        />
        <InputNumber
          v-if="rule.conditionType === 'anomaly_detected'"
          v-model:value="rule.minScore"
          :min="0"
          :max="1"
          :step="0.01"
        />

        <template v-if="rule.conditionType === 'zone_intrusion'">
          <Button class="col-span-3" type="dashed" @click="emit('addZonePoint')">
            {{ $t('page.ai.pipeline.editor.actions.addPoint') }}
          </Button>
          <div
            v-for="(point, pi) in rule.zonePoints"
            :key="pi"
            class="col-span-3 grid grid-cols-3 gap-2"
          >
            <InputNumber v-model:value="point.x" :min="0" :max="1" :step="0.01" />
            <InputNumber v-model:value="point.y" :min="0" :max="1" :step="0.01" />
            <Button danger type="link" @click="emit('removeZonePoint', pi)">
              {{ $t('common.delete') }}
            </Button>
          </div>
        </template>

        <template v-if="rule.conditionType === 'line_crossing'">
          <InputNumber v-model:value="rule.lineStart.x" :min="0" :max="1" :step="0.01" />
          <InputNumber v-model:value="rule.lineStart.y" :min="0" :max="1" :step="0.01" />
          <InputNumber v-model:value="rule.lineEnd.x" :min="0" :max="1" :step="0.01" />
          <InputNumber v-model:value="rule.lineEnd.y" :min="0" :max="1" :step="0.01" />
        </template>

        <template v-if="rule.conditionType === 'custom_wasm'">
          <Select
            v-model:value="rule.customModuleId"
            :options="algorithmOptions"
            show-search
            :placeholder="$t('page.ai.pipeline.editor.rule.moduleId')"
          />
          <Button class="col-span-3" type="dashed" @click="emit('addRuleEntry')">
            {{ $t('page.ai.pipeline.editor.actions.addConfigEntry') }}
          </Button>
          <div
            v-for="(entry, ei) in rule.customConfigEntries"
            :key="ei"
            class="col-span-3 grid grid-cols-4 gap-2"
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
            <Button danger type="link" @click="emit('removeRuleEntry', ei)">
              {{ $t('common.delete') }}
            </Button>
          </div>
        </template>
      </div>
    </div>
  </Card>
</template>
