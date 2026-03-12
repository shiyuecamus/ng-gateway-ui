<script lang="ts" setup>
import type {
  AiAlgorithmInstallRequest,
  AiAlgorithmProbeInfo,
} from '@vben/types';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { formatBytes } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  FormItem,
  Input,
  message,
  Progress,
  Result,
  Select,
  Step,
  Steps,
  Tag,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { installAiAlgorithm } from '#/api';

import { useFormSchema } from '../schemas';

defineOptions({ name: 'InstallAiAlgorithm' });

const emit = defineEmits<{
  success: [];
}>();

const currentTab = ref(0);
const uploadedFile = ref<File | null>(null);
const probeInfo = ref<AiAlgorithmProbeInfo | null>(null);
const installing = ref(false);
const installProgress = ref(0);
const installSuccess = ref(false);
const metadata = ref<AiAlgorithmInstallRequest>({
  algorithmKey: '',
  description: '',
  moduleType: 'result_processor',
  name: '',
  version: '1.0.0',
});

function syncMetadataFromProbe(probe: AiAlgorithmProbeInfo) {
  metadata.value = {
    algorithmKey: probe.manifest.algorithmKey,
    configSchema: probe.manifest.configSchema,
    description: probe.manifest.description,
    moduleType: probe.manifest.moduleType as
      | 'frame_transform'
      | 'result_processor',
    name: probe.manifest.name,
    version: probe.manifest.version,
  };
}

async function handlePreviewUpload(options: any) {
  const { file } = options as { file: File };
  uploadedFile.value = file;
  probeInfo.value = null;
  try {
    const { probeAiAlgorithm } = await import('#/api');
    await probeAiAlgorithm({
      file,
      onProgress: (p) => {
        options.onProgress?.(p);
      },
      onSuccess: (data, f) => {
        probeInfo.value = data as AiAlgorithmProbeInfo;
        syncMetadataFromProbe(data as AiAlgorithmProbeInfo);
        options.onSuccess?.(data, f);
      },
      onError: (err) => {
        options.onError?.(err);
      },
    });
  } catch (error: any) {
    options.onError?.(error);
  }
}

const [FirstForm, firstFormApi] = useVbenForm({
  schema: useFormSchema(handlePreviewUpload),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    show: false,
  },
  handleSubmit: async () => {
    if (!uploadedFile.value || !probeInfo.value) {
      message.warning($t('page.ai.algorithm.messages.uploadRequired'));
      return;
    }
    currentTab.value = 1;
  },
});

function goPrevFromStep2() {
  currentTab.value = 0;
}

function goNextFromStep2() {
  currentTab.value = 2;
}

function goPrevFromStep3() {
  if (installSuccess.value) return;
  currentTab.value = 1;
}

async function handleInstallClick() {
  if (!uploadedFile.value) return;
  if (!metadata.value.name?.trim()) {
    message.warning($t('page.ai.algorithm.messages.uploadRequired'));
    currentTab.value = 1;
    return;
  }
  installing.value = true;
  installProgress.value = 0;
  try {
    await installAiAlgorithm({
      file: uploadedFile.value,
      metadata: {
        algorithmKey: metadata.value.algorithmKey?.trim() || undefined,
        configSchema: metadata.value.configSchema,
        description: metadata.value.description?.trim() || undefined,
        moduleType: metadata.value.moduleType,
        name: metadata.value.name?.trim() || undefined,
        version: metadata.value.version?.trim() || undefined,
      },
      onProgress: (p) => {
        installProgress.value = Math.round(p.percent);
      },
      onSuccess: () => {
        installProgress.value = 100;
        installSuccess.value = true;
        message.success(
          $t('page.ai.algorithm.messages.uploadSuccess', {
            name: probeInfo.value?.manifest.name ?? '',
          }),
        );
        emit('success');
      },
    });
  } finally {
    installing.value = false;
  }
}

const [Modal, modalApi] = useVbenModal({
  class: 'w-2/3',
  destroyOnClose: true,
  fullscreenButton: false,
  title: $t('page.ai.algorithm.upload.title'),
  showConfirmButton: false,
  showCancelButton: false,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    await firstFormApi.validateAndSubmitForm();
  },
});
</script>

<template>
  <Modal>
    <Steps :current="currentTab" class="steps">
      <Step :title="$t('page.ai.algorithm.upload.pickFile')" />
      <Step :title="$t('page.ai.common.preview')" />
      <Step :title="$t('common.install')" />
    </Steps>
    <div class="p-4">
      <Card v-show="currentTab === 0">
        <FirstForm />
      </Card>

      <div v-show="currentTab === 1" class="space-y-4">
        <Card>
          <Descriptions :column="2" size="middle" :bordered="true">
            <Descriptions.Item :label="$t('page.ai.algorithm.name')">
              <Tag color="volcano">{{ probeInfo?.manifest.name }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.algorithm.moduleType')">
              <Tag color="orange">{{ probeInfo?.manifest.moduleType }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.algorithm.version')">
              <Tag color="cyan">{{ probeInfo?.manifest.version }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.algorithm.fileSize')">
              <Tag color="magenta">{{ formatBytes(probeInfo?.size ?? 0) }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              :label="$t('page.ai.algorithm.upload.algorithmKey')"
            >
              <Tag color="purple">{{ probeInfo?.manifest.algorithmKey }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              :label="$t('page.ai.algorithm.upload.sdkApiVersion')"
            >
              <Tag color="blue">{{ probeInfo?.manifest.sdkApiVersion }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              :label="$t('page.ai.algorithm.checksum')"
              :span="2"
            >
              {{ probeInfo?.checksum ?? '-' }}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card :title="$t('page.ai.algorithm.upload.title')">
          <Alert
            class="mb-4"
            type="info"
            show-icon
            :message="$t('page.ai.algorithm.messages.metadataHint')"
          />
          <Form layout="vertical" :colon="false" size="small">
            <div class="grid grid-cols-2 gap-3">
              <FormItem
                :label="$t('page.ai.algorithm.upload.algorithmKey')"
                required
              >
                <Input v-model:value="metadata.algorithmKey" />
              </FormItem>
              <FormItem :label="$t('page.ai.algorithm.upload.name')" required>
                <Input v-model:value="metadata.name" />
              </FormItem>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormItem :label="$t('page.ai.algorithm.upload.version')">
                <Input v-model:value="metadata.version" />
              </FormItem>
              <FormItem :label="$t('page.ai.algorithm.upload.moduleType')">
                <Select
                  v-model:value="metadata.moduleType"
                  :options="[
                    { label: 'frame_transform', value: 'frame_transform' },
                    { label: 'result_processor', value: 'result_processor' },
                  ]"
                />
              </FormItem>
            </div>
            <FormItem :label="$t('page.ai.algorithm.upload.description')">
              <Input.TextArea v-model:value="metadata.description" :rows="4" />
            </FormItem>
          </Form>
        </Card>
        <div class="flex w-full items-center justify-end gap-3 pb-4">
          <Button @click="goPrevFromStep2">{{ $t('common.previous') }}</Button>
          <Button type="primary" @click="goNextFromStep2">
            {{ $t('common.next') }}
          </Button>
        </div>
      </div>

      <div v-show="currentTab === 2" class="space-y-4">
        <Card v-if="!installSuccess">
          <div class="mb-4 text-base font-medium">
            {{ $t('page.ai.algorithm.upload.title') }}
          </div>
          <Progress
            :percent="installProgress"
            :status="
              installSuccess ? 'success' : installing ? 'active' : 'normal'
            "
          />
        </Card>
        <Card v-else>
          <Result
            status="success"
            :title="$t('common.action.installSuccess')"
            :sub-title="probeInfo?.manifest.name"
          />
        </Card>
        <div
          v-if="!installSuccess"
          class="flex w-full items-center justify-end gap-3 pb-4"
        >
          <Button :disabled="installing" @click="goPrevFromStep3">
            {{ $t('common.previous') }}
          </Button>
          <Button
            type="primary"
            :loading="installing"
            @click="handleInstallClick"
          >
            {{ $t('common.install') }}
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>
