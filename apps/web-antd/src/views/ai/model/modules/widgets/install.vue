<script lang="ts" setup>
import type { AiModelInstallRequest, AiModelProbeInfo } from '@vben/types';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { formatBytes } from '@vben/utils';

import {
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
import { installAiModel } from '#/api';

import { useFormSchema } from '../schemas';

defineOptions({ name: 'InstallAiModel' });

const emit = defineEmits<{
  success: [];
}>();

const currentTab = ref(0);
const uploadedFile = ref<File | null>(null);
const probeInfo = ref<AiModelProbeInfo | null>(null);
const installing = ref(false);
const installProgress = ref(0);
const installSuccess = ref(false);
const metadata = ref<AiModelInstallRequest>({
  labels: [],
  name: '',
  task: undefined,
  version: '1.0.0',
});
const labelsText = ref('');

function inferNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

function syncMetadataFromProbe(file: File, probe: AiModelProbeInfo) {
  metadata.value = {
    labels: probe.labels ?? [],
    name: inferNameFromFile(file),
    task: probe.inferredTask,
    version: '1.0.0',
  };
  labelsText.value = (probe.labels ?? []).join(', ');
}

function buildInstallMetadata(): AiModelInstallRequest {
  const labels = labelsText.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    labels: labels.length > 0 ? labels : undefined,
    name: metadata.value.name?.trim() || undefined,
    task: metadata.value.task,
    version: metadata.value.version?.trim() || undefined,
  };
}

async function handlePreviewUpload(options: any) {
  const { file } = options as { file: File };
  uploadedFile.value = file;
  probeInfo.value = null;
  try {
    const { probeAiModel } = await import('#/api');
    await probeAiModel({
      file,
      onProgress: (p) => {
        options.onProgress?.(p);
      },
      onSuccess: (data, f) => {
        probeInfo.value = data as AiModelProbeInfo;
        syncMetadataFromProbe(file, data as AiModelProbeInfo);
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
      message.warning($t('page.ai.model.messages.fileRequired'));
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
    message.warning($t('page.ai.model.messages.basicRequired'));
    currentTab.value = 1;
    return;
  }
  installing.value = true;
  installProgress.value = 0;
  try {
    await installAiModel({
      file: uploadedFile.value,
      metadata: buildInstallMetadata(),
      onProgress: (p) => {
        installProgress.value = Math.round(p.percent);
      },
      onSuccess: () => {
        installProgress.value = 100;
        installSuccess.value = true;
        message.success(
          $t('page.ai.model.messages.uploadSuccess', {
            name: uploadedFile.value?.name ?? '',
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
  title: $t('page.ai.model.upload.title'),
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
      <Step :title="$t('page.ai.model.upload.pickFile')" />
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
            <Descriptions.Item :label="$t('page.ai.common.format')">
              <Tag color="blue">{{ probeInfo?.format }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.model.task')">
              <Tag color="orange">{{ probeInfo?.inferredTask ?? '-' }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.model.fileSize')">
              <Tag color="cyan">{{ formatBytes(probeInfo?.size ?? 0) }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.ai.common.checksum')" :span="2">
              {{ probeInfo?.checksum ?? '-' }}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card :title="$t('page.ai.model.upload.title')">
          <Form layout="vertical" :colon="false" size="small">
            <div class="grid grid-cols-2 gap-3">
              <FormItem :label="$t('page.ai.model.upload.name')" required>
                <Input v-model:value="metadata.name" />
              </FormItem>
              <FormItem :label="$t('page.ai.model.upload.version')">
                <Input v-model:value="metadata.version" />
              </FormItem>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormItem :label="$t('page.ai.model.upload.task')">
                <Select
                  v-model:value="metadata.task"
                  :options="[
                    { label: 'object_detection', value: 'object_detection' },
                    { label: 'classification', value: 'classification' },
                    { label: 'segmentation', value: 'segmentation' },
                    { label: 'ocr', value: 'ocr' },
                    { label: 'anomaly_detection', value: 'anomaly_detection' },
                    { label: 'custom', value: 'custom' },
                  ]"
                />
              </FormItem>
              <FormItem :label="$t('page.ai.model.upload.labels')">
                <Input
                  v-model:value="labelsText"
                  :placeholder="$t('page.ai.model.upload.labelsPlaceholder')"
                />
              </FormItem>
            </div>
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
            {{ $t('page.ai.model.upload.title') }}
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
            :title="
              $t('page.ai.model.messages.uploadSuccess', {
                name: uploadedFile?.name ?? '',
              })
            "
            :sub-title="probeInfo?.format ?? uploadedFile?.name"
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
