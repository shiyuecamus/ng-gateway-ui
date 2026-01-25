<script lang="ts" setup>
import type { TcpConnectRequest } from '@vben/types';

import { $t } from '@vben/locales';

import { Button, Form, Input, InputNumber, Switch } from 'ant-design-vue';

defineOptions({ name: 'NetDebugTcpForm' });

const props = defineProps<{
  form: TcpConnectRequest;
  running: boolean;
}>();

const emit = defineEmits<{
  (e: 'run'): void;
  (e: 'update:form', v: TcpConnectRequest): void;
}>();

function patchForm(patch: Partial<TcpConnectRequest>) {
  emit('update:form', { ...props.form, ...patch });
}
</script>

<template>
  <Form layout="vertical">
    <Form.Item :label="$t('page.maintenance.netDebug.targetHost')">
      <Input
        :value="props.form.host"
        @update:value="(v) => patchForm({ host: v })"
        placeholder="e.g. 127.0.0.1 / db.local"
      />
    </Form.Item>

    <div class="grid grid-cols-2 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.port')">
        <InputNumber
          :value="props.form.port"
          @update:value="(v) => patchForm({ port: v as any })"
          class="w-full"
          :min="1"
          :max="65535"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.timeoutMs')">
        <InputNumber
          :value="props.form.timeoutMs"
          @update:value="(v) => patchForm({ timeoutMs: v as any })"
          class="w-full"
          :min="100"
          :max="60000"
        />
      </Form.Item>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.readBanner')">
        <Switch
          :checked="props.form.readBanner"
          @update:checked="(v) => patchForm({ readBanner: v === true })"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.bannerBytes')">
        <InputNumber
          :value="props.form.bannerBytes"
          @update:value="(v) => patchForm({ bannerBytes: v as any })"
          class="w-full"
          :min="1"
          :max="4096"
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
