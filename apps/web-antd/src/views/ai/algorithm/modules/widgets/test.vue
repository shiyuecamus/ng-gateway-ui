<script lang="ts" setup>
import type { AiAlgorithmInfo, AiAlgorithmTestResult } from '@vben/types';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  FormItem,
  Input,
  InputNumber,
  Result,
  Space,
} from 'ant-design-vue';

import { testAiAlgorithm } from '#/api';

defineOptions({ name: 'TestAiAlgorithm' });

interface ModalData {
  algorithm: AiAlgorithmInfo;
}

const loading = ref(false);
const algorithm = ref<AiAlgorithmInfo | null>(null);
const frameWidth = ref(1280);
const frameHeight = ref(720);
const configText = ref('{}');
const parseError = ref<null | string>(null);
const result = ref<AiAlgorithmTestResult | null>(null);

const [Modal, modalApi] = useVbenModal({
  class: 'w-2/3',
  destroyOnClose: true,
  fullscreenButton: false,
  showConfirmButton: false,
  showCancelButton: false,
  onCancel() {
    modalApi.close();
  },
  onOpened() {
    const data = modalApi.getData<ModalData>();
    algorithm.value = data.algorithm;
    frameWidth.value = 1280;
    frameHeight.value = 720;
    configText.value = '{}';
    parseError.value = null;
    result.value = null;
  },
});

async function handleRun() {
  if (!algorithm.value) return;

  parseError.value = null;

  let config: Record<string, unknown> | undefined;
  try {
    const parsed = configText.value.trim();
    config = parsed ? (JSON.parse(parsed) as Record<string, unknown>) : {};
  } catch (error) {
    parseError.value =
      error instanceof Error
        ? error.message
        : $t('page.ai.algorithm.messages.invalidJson');
    return;
  }

  loading.value = true;
  try {
    result.value = await testAiAlgorithm(algorithm.value.id, {
      config,
      frameHeight: frameHeight.value,
      frameWidth: frameWidth.value,
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Modal>
    <div class="space-y-4 p-2">
      <Card v-if="algorithm" size="small">
        <Descriptions :column="2" size="small" bordered>
          <Descriptions.Item :label="$t('page.ai.algorithm.name')">
            {{ algorithm.name }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.ai.algorithm.version')">
            {{ algorithm.version }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.ai.algorithm.moduleType')">
            {{ algorithm.moduleType }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.ai.model.fileSize')">
            {{ algorithm.size }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" :title="$t('page.ai.algorithm.test.title')">
        <Form layout="vertical" :colon="false">
          <div class="grid grid-cols-2 gap-3">
            <FormItem :label="$t('page.ai.algorithm.test.frameWidth')">
              <InputNumber v-model:value="frameWidth" :min="1" class="w-full" />
            </FormItem>
            <FormItem :label="$t('page.ai.algorithm.test.frameHeight')">
              <InputNumber
                v-model:value="frameHeight"
                :min="1"
                class="w-full"
              />
            </FormItem>
          </div>
          <FormItem :label="$t('page.ai.algorithm.test.configJson')">
            <Input.TextArea
              v-model:value="configText"
              :rows="8"
              placeholder="{}"
            />
          </FormItem>
        </Form>

        <Alert
          v-if="parseError"
          class="mt-3"
          type="error"
          show-icon
          :message="parseError"
        />
      </Card>

      <Card
        v-if="result"
        size="small"
        :title="$t('page.ai.algorithm.test.result')"
      >
        <Result
          :status="result.success ? 'success' : 'error'"
          :title="
            result.success
              ? $t('page.ai.algorithm.actions.test')
              : $t('page.ai.algorithm.messages.testFailed')
          "
          :sub-title="`${result.executionTimeMs} ms`"
        />
        <pre class="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs">{{
          JSON.stringify(result, null, 2)
        }}</pre>
      </Card>

      <div class="flex justify-end">
        <Space>
          <Button @click="modalApi.close()">{{ $t('common.cancel') }}</Button>
          <Button type="primary" :loading="loading" @click="handleRun">
            {{ $t('page.ai.algorithm.actions.test') }}
          </Button>
        </Space>
      </div>
    </div>
  </Modal>
</template>
