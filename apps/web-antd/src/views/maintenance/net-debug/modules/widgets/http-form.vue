<script lang="ts" setup>
import type { HttpRequest } from '@vben/types';

import { $t } from '@vben/locales';

import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
} from 'ant-design-vue';

defineOptions({ name: 'NetDebugHttpForm' });

const props = defineProps<{
  form: HttpRequest;
  headers: Array<{ key: string; value: string }>;
  httpMethodOptions: Array<{ label: string; value: string }>;
  running: boolean;
}>();

const emit = defineEmits<{
  (e: 'run'): void;
  (e: 'update:form', v: HttpRequest): void;
  (e: 'update:headers', v: Array<{ key: string; value: string }>): void;
}>();

function patchForm(patch: Partial<HttpRequest>) {
  emit('update:form', { ...props.form, ...patch });
}

function cloneHeaders() {
  return props.headers.map((h) => ({ ...h }));
}

function updateHeader(idx: number, patch: Partial<{ key: string; value: string }>) {
  const next = cloneHeaders();
  next[idx] = { ...next[idx], ...patch };
  emit('update:headers', next);
}

function removeHeader(idx: number) {
  const next = cloneHeaders();
  next.splice(idx, 1);
  emit('update:headers', next);
}

function addHeader() {
  const next = cloneHeaders();
  next.push({ key: '', value: '' });
  emit('update:headers', next);
}
</script>

<template>
  <Form layout="vertical">
    <div class="grid grid-cols-3 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.method')">
        <Select
          :value="props.form.method"
          :options="props.httpMethodOptions"
          @update:value="(v) => patchForm({ method: v as any })"
        />
      </Form.Item>
      <Form.Item
        class="col-span-2"
        :label="$t('page.maintenance.netDebug.url')"
      >
        <Input
          :value="props.form.url"
          @update:value="(v) => patchForm({ url: v })"
          placeholder="https://example.com/api/health"
        />
      </Form.Item>
    </div>

    <Form.Item :label="$t('page.maintenance.netDebug.headers')">
      <div class="flex flex-col gap-2">
        <div
          v-for="(h, idx) in headers"
          :key="idx"
          class="grid grid-cols-12 gap-2"
        >
          <Input
            :value="h.key"
            @update:value="(v) => updateHeader(idx, { key: v })"
            class="col-span-5"
            placeholder="Header"
          />
          <Input
            :value="h.value"
            @update:value="(v) => updateHeader(idx, { value: v })"
            class="col-span-6"
            placeholder="Value"
          />
          <Button
            class="col-span-1"
            danger
            type="text"
            @click="removeHeader(idx)"
          >
            ×
          </Button>
        </div>
        <Button
          type="dashed"
          class="w-full"
          @click="addHeader"
        >
          {{ $t('page.maintenance.netDebug.addHeader') }}
        </Button>
      </div>
    </Form.Item>

    <Form.Item :label="$t('page.maintenance.netDebug.body')">
      <Input.TextArea
        :value="props.form.body"
        @update:value="(v) => patchForm({ body: v })"
        :auto-size="{ minRows: 3, maxRows: 8 }"
        placeholder="(optional)"
      />
    </Form.Item>

    <div class="grid grid-cols-2 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.timeoutMs')">
        <InputNumber
          :value="props.form.timeoutMs"
          @update:value="(v) => patchForm({ timeoutMs: v as any })"
          class="w-full"
          :min="200"
          :max="120000"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.maxResponseBytes')">
        <InputNumber
          :value="props.form.maxResponseBytes"
          @update:value="(v) => patchForm({ maxResponseBytes: v as any })"
          class="w-full"
          :min="1024"
          :max="2 * 1024 * 1024"
        />
      </Form.Item>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <Form.Item :label="$t('page.maintenance.netDebug.followRedirects')">
        <Switch
          :checked="props.form.followRedirects"
          @update:checked="(v) => patchForm({ followRedirects: v })"
        />
      </Form.Item>
      <Form.Item :label="$t('page.maintenance.netDebug.insecureTls')">
        <Switch
          :checked="props.form.insecureTls"
          @update:checked="(v) => patchForm({ insecureTls: v })"
        />
      </Form.Item>
    </div>

    <Button
      type="primary"
      class="w-full"
      :disabled="props.running || !props.form.url?.trim()"
      @click="emit('run')"
    >
      {{ $t('page.maintenance.netDebug.run') }}
    </Button>
  </Form>
</template>
