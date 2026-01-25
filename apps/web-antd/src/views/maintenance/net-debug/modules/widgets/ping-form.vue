<script lang="ts" setup>
import type { PingMode, PingRequest } from '@vben/types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import { Button, Form, Input, InputNumber, Select } from 'ant-design-vue';

defineOptions({ name: 'NetDebugPingForm' });

const props = defineProps<{
  form: PingRequest;
  running: boolean;
}>();

const emit = defineEmits<{
  (e: 'run'): void;
  (e: 'update:form', v: PingRequest): void;
}>();

const pingMode = computed<PingMode>(() => props.form.mode ?? 'icmp');

function patchForm(patch: Partial<PingRequest>) {
  emit('update:form', { ...props.form, ...patch });
}
</script>

<template>
  <Form layout="vertical">
    <Form.Item :label="$t('page.maintenance.netDebug.targetHost')">
      <Input
        :value="props.form.host"
        @update:value="(v) => patchForm({ host: v })"
        placeholder="e.g. 8.8.8.8 / example.com"
      />
    </Form.Item>

    <div class="grid grid-cols-2 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.mode')">
        <Select
          :value="props.form.mode"
          @update:value="(v) => patchForm({ mode: v as PingMode })"
          :options="[
            { label: $t('page.maintenance.netDebug.modeIcmp'), value: 'icmp' },
            { label: $t('page.maintenance.netDebug.modeTcp'), value: 'tcp' },
          ]"
        />
      </Form.Item>

      <Form.Item
        v-if="pingMode === 'tcp'"
        :label="$t('page.maintenance.netDebug.tcpPort')"
      >
        <InputNumber
          :value="props.form.tcpPort"
          @update:value="(v) => patchForm({ tcpPort: v as any })"
          class="w-full"
          :min="1"
          :max="65535"
        />
      </Form.Item>

      <Form.Item v-else label="ICMP payload (bytes)">
        <InputNumber
          :value="props.form.payloadBytes"
          @update:value="(v) => patchForm({ payloadBytes: v as any })"
          class="w-full"
          :min="8"
          :max="1024"
        />
      </Form.Item>
    </div>

    <div class="grid grid-cols-3 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.count')">
        <InputNumber
          :value="props.form.count"
          @update:value="(v) => patchForm({ count: v as any })"
          class="w-full"
          :min="1"
          :max="20"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.timeoutMs')">
        <InputNumber
          :value="props.form.timeoutMs"
          @update:value="(v) => patchForm({ timeoutMs: v as any })"
          class="w-full"
          :min="100"
          :max="30000"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.intervalMs')">
        <InputNumber
          :value="props.form.intervalMs"
          @update:value="(v) => patchForm({ intervalMs: v as any })"
          class="w-full"
          :min="0"
          :max="10000"
        />
      </Form.Item>
    </div>

    <Button
      type="primary"
      class="w-full"
      :disabled="props.running || !props.form.host?.trim()"
      @click="emit('run')"
    >
      {{ $t('page.maintenance.netDebug.run') }}
    </Button>
  </Form>
</template>
