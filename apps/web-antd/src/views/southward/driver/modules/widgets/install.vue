<script lang="ts" setup>
import type { DriverProbeInfo } from '@vben/types';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { OsArch, OsType } from '@vben/types';
import { formatBytes, osArchColor, osTypeColor } from '@vben/utils';

import {
  Button,
  Card,
  Descriptions,
  message,
  Progress,
  Result,
  Step,
  Steps,
  Tag,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { installDriver, previewDriver } from '#/api';

import { useFormSchema } from '../schemas';

defineOptions({ name: 'InstallDriver' });

const emit = defineEmits<{
  success: [];
}>();

const currentTab = ref(0);
const uploadedFile = ref<File | null>(null);
const probeInfo = ref<DriverProbeInfo | null>(null);
const installing = ref(false);
const installProgress = ref(0);
const installSuccess = ref(false);

// 包装自定义上传以在预览成功后存储文件与探测信息
async function handlePreviewUpload(options: any) {
  const { file } = options as { file: File };
  uploadedFile.value = file;
  probeInfo.value = null;
  try {
    await previewDriver({
      file,
      onProgress: (p) => {
        options.onProgress?.(p);
      },
      onSuccess: (data, f) => {
        probeInfo.value = data as DriverProbeInfo;
        options.onSuccess?.(data, f);
        message.success($t('common.action.importSuccess'));
      },
      onError: (err) => {
        options.onError?.(err);
      },
    });
  } catch (error: any) {
    options.onError?.(error);
  }
}

// 初始化表单
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
      message.warning($t('page.southward.driver.install.uploadText'));
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
  installing.value = true;
  installProgress.value = 0;
  try {
    await installDriver({
      file: uploadedFile.value,
      onProgress: (p) => {
        installProgress.value = Math.round(p.percent);
      },
      onSuccess: () => {
        installProgress.value = 100;
        installSuccess.value = true;
        message.success($t('common.action.installSuccess'));
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
  title: '安装驱动',
  showConfirmButton: false,
  showCancelButton: false,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    await firstFormApi.validateAndSubmitForm();
  },
  onOpened: async () => {},
});

function osTypeLabel(value?: (typeof OsType)[keyof typeof OsType]) {
  switch (value) {
    case OsType.Linux: {
      return $t('page.southward.driver.osType.linux');
    }
    case OsType.MacOS: {
      return $t('page.southward.driver.osType.macos');
    }
    case OsType.Windows: {
      return $t('page.southward.driver.osType.windows');
    }
    default: {
      return $t('page.southward.driver.osType.unknown');
    }
  }
}

function osArchLabel(value: number) {
  switch (value) {
    case 0: {
      return $t('page.southward.driver.osArch.x86');
    }
    case 1: {
      return $t('page.southward.driver.osArch.arm64');
    }
    case 2: {
      return $t('page.southward.driver.osArch.arm');
    }
    default: {
      return $t('page.southward.driver.osArch.unknown');
    }
  }
}
</script>

<template>
  <Modal>
    <Steps :current="currentTab" class="steps">
      <Step :title="$t('page.southward.driver.install.step1')" />
      <Step :title="$t('page.southward.driver.install.step2')" />
      <Step :title="$t('page.southward.driver.install.step3')" />
    </Steps>
    <div class="p-4">
      <Card v-show="currentTab === 0">
        <FirstForm />
      </Card>

      <div v-show="currentTab === 1" class="space-y-4">
        <Card>
          <Descriptions :column="2" size="middle" :bordered="true">
            <Descriptions.Item :label="$t('page.southward.driver.name')">
              <Tag color="volcano">
                {{ probeInfo?.name }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.driverType')">
              <Tag color="orange">
                {{ probeInfo?.driverType }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.version')">
              <Tag color="cyan">
                {{ probeInfo?.version }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.apiVersion')">
              <Tag color="purple">
                {{ probeInfo?.apiVersion }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.sdkVersion')">
              <Tag color="pink">
                {{ probeInfo?.sdkVersion }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.osType.title')">
              <Tag :color="osTypeColor(probeInfo?.osType ?? OsType.Unknown)">
                {{ osTypeLabel(probeInfo?.osType ?? OsType.Unknown) }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.osArch.title')">
              <Tag :color="osArchColor(probeInfo?.osArch ?? OsArch.Unknown)">
                {{ osArchLabel(probeInfo?.osArch ?? OsArch.Unknown) }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="$t('page.southward.driver.size')">
              <Tag color="magenta">
                {{ formatBytes(probeInfo?.size ?? 0) }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item
              :label="$t('page.southward.driver.checksum')"
              :span="2"
            >
              {{ probeInfo?.checksum }}
            </Descriptions.Item>
            <Descriptions.Item
              :label="$t('page.southward.driver.description')"
              :span="2"
            >
              {{ probeInfo?.description || '-' }}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <div
          class="col-[-2/-1] flex w-full items-center justify-end gap-3 self-center pb-4"
        >
          <Button @click="goPrevFromStep2">{{ $t('common.previous') }}</Button>
          <Button type="primary" @click="goNextFromStep2">
            {{ $t('common.next') }}
          </Button>
        </div>
      </div>

      <div v-show="currentTab === 2" class="space-y-4">
        <Card v-if="!installSuccess">
          <div class="mb-4 text-base font-medium">
            {{
              $t('common.installWithName', {
                name: $t('page.southward.driver.title'),
              })
            }}
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
            :sub-title="probeInfo?.name"
          />
        </Card>
        <div
          v-if="!installSuccess"
          class="col-[-2/-1] flex w-full items-center justify-end gap-3 self-center pb-4"
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

<style scoped></style>

