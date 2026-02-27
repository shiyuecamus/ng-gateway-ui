<script lang="ts" setup>
import type { AiModelInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, Card, Modal, Step, Steps, Tag, Upload, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createAiModel,
  deleteAiModel,
  fetchAiModels,
  loadAiModel,
  unloadAiModel,
} from '#/api';
import {
  useColumns,
  useModelBasicFormSchema,
  useModelUploadFormSchema,
} from './modules/schemas';

defineOptions({ name: 'AiModelPage' });

const { handleRequest } = useRequestHandler();

const gridOptions: VxeGridProps<AiModelInfo> = {
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    ajax: {
      query: async () => await fetchAiModels(),
    },
  },
  toolbarConfig: {
    custom: true,
    export: false,
    import: false,
    refresh: true,
    zoom: true,
  },
};

type ModelGridApi = { query: () => Promise<unknown> };
const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (options: any) => readonly [any, ModelGridApi]
)({ gridOptions });
const uploadVisible = ref(false);
const uploading = ref(false);
const modelFile = ref<File | null>(null);
const currentStep = ref(0);

const [BasicForm, basicFormApi] = useVbenForm({
  schema: useModelBasicFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    show: false,
  },
  handleSubmit: () => {
    currentStep.value = 1;
  },
});

const [UploadForm, uploadFormApi] = useVbenForm({
  schema: useModelUploadFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  submitButtonOptions: {
    content: $t('common.confirm'),
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  handleReset: () => {
    currentStep.value = 0;
  },
  handleSubmit: async () => {
    await submitUpload();
  },
});

function onActionClick({ code, row }: OnActionClickParams<AiModelInfo>) {
  switch (code) {
    case 'load': {
      void onLoad(row);
      break;
    }
    case 'unload': {
      void onUnload(row);
      break;
    }
    case 'delete': {
      void onDelete(row);
      break;
    }
    default: {
      break;
    }
  }
}

async function onLoad(row: AiModelInfo) {
  await handleRequest(
    () => loadAiModel(row.id),
    async () => {
      message.success($t('page.ai.model.messages.loadSuccess', { name: row.name }));
      await gridApi.query();
    },
  );
}

async function onUnload(row: AiModelInfo) {
  await handleRequest(
    () => unloadAiModel(row.id),
    async () => {
      message.success($t('page.ai.model.messages.unloadSuccess', { name: row.name }));
      await gridApi.query();
    },
  );
}

async function onDelete(row: AiModelInfo) {
  confirm({
    content: $t('page.ai.model.messages.deleteConfirm', { name: row.name }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiModel(row.id),
        async () => {
          message.success($t('page.ai.model.messages.deleteSuccess', { name: row.name }));
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}

function openUpload() {
  modelFile.value = null;
  currentStep.value = 0;
  basicFormApi.resetForm({
    values: {
      id: '',
      name: '',
      version: '1.0.0',
      task: 'object_detection',
      labelsText: '',
    },
  });
  uploadFormApi.resetForm({
    values: {
      file: '',
    },
  });
  uploadVisible.value = true;
}

async function submitUpload() {
  const values = await basicFormApi.merge(uploadFormApi).submitAllForm(true);
  if (!values) return;
  if (!modelFile.value) return;
  uploading.value = true;
  const formData = new FormData();
  formData.append('file', modelFile.value);
  const labels = String(values.labelsText ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  formData.append(
    'metadata',
    JSON.stringify({
      id: String(values.id).trim(),
      name: String(values.name).trim(),
      version: String(values.version).trim(),
      task: String(values.task),
      labels,
    }),
  );
  await handleRequest(
    () => createAiModel(formData),
    async () => {
      uploadVisible.value = false;
      message.success($t('page.ai.model.messages.uploadSuccess', { name: String(values.name) }));
      await gridApi.query();
    },
    () => {},
  );
  uploading.value = false;
}

function onModelFileBeforeUpload(file: File) {
  modelFile.value = file;
  uploadFormApi.setValues({ file: file.name });
  return false;
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button type="primary" @click="openUpload">
          {{ $t('page.ai.model.actions.upload') }}
        </Button>
      </template>
      <template #loaded="{ row }">
        <Tag :color="row.loaded ? 'success' : 'default'">
          {{ row.loaded ? $t('page.ai.common.yes') : $t('page.ai.common.no') }}
        </Tag>
      </template>
    </Grid>

    <Modal
      :open="uploadVisible"
      :confirm-loading="uploading"
      :title="$t('page.ai.model.upload.title')"
      :footer="null"
      @cancel="uploadVisible = false"
    >
      <div class="space-y-4 p-2">
        <Steps :current="currentStep">
          <Step :title="$t('common.basicInfo')" />
          <Step :title="$t('page.ai.model.upload.file')" />
        </Steps>
        <Card v-show="currentStep === 0">
          <BasicForm />
        </Card>
        <Card v-show="currentStep === 1">
          <UploadForm>
            <template #file>
              <Upload :before-upload="onModelFileBeforeUpload" :max-count="1">
                <Button>{{ $t('page.ai.model.upload.pickFile') }}</Button>
              </Upload>
              <div v-if="modelFile" class="mt-1 text-xs text-gray-500">
                {{ modelFile.name }}
              </div>
            </template>
          </UploadForm>
        </Card>
      </div>
    </Modal>
  </Page>
</template>
