<script lang="ts" setup>
import type {
  AiAlgorithmInfo,
} from '@vben/types';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { OnActionClickParams } from '#/adapter/vxe-table';

import { ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { Button, Input, Modal, Upload, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteAiAlgorithm,
  fetchAiAlgorithms,
  testAiAlgorithm,
  uploadAiAlgorithm,
} from '#/api';
import {
  useAlgorithmTestFormSchema,
  useAlgorithmUploadFormSchema,
  useColumns,
} from './modules/schemas';

defineOptions({ name: 'AiAlgorithmPage' });

const { handleRequest } = useRequestHandler();
const gridOptions: VxeGridProps<AiAlgorithmInfo> = {
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    ajax: {
      query: async () => await fetchAiAlgorithms(),
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

type AlgorithmGridApi = { query: () => Promise<unknown> };
const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (options: any) => readonly [any, AlgorithmGridApi]
)({ gridOptions });
const uploadVisible = ref(false);
const uploadFile = ref<File | null>(null);
const testVisible = ref(false);
const currentAlgorithmId = ref('');
const testResult = ref('');

const [UploadForm, uploadFormApi] = useVbenForm({
  schema: useAlgorithmUploadFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleSubmit: async () => {
    await submitUpload();
  },
});

const [TestForm, testFormApi] = useVbenForm({
  schema: useAlgorithmTestFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleSubmit: async () => {
    await submitTest();
  },
});

function onActionClick({ code, row }: OnActionClickParams<AiAlgorithmInfo>) {
  switch (code) {
    case 'delete': {
      void onDelete(row);
      break;
    }
    case 'test': {
      currentAlgorithmId.value = row.id;
      testResult.value = '';
      testVisible.value = true;
      break;
    }
    default:
      break;
  }
}

function openUpload() {
  uploadFormApi.resetForm({
    values: {
      name: '',
      description: '',
      version: '1.0.0',
      moduleType: 'result_processor',
      file: '',
    },
  });
  uploadFile.value = null;
  uploadVisible.value = true;
}

async function submitUpload() {
  const values = await uploadFormApi.submitForm();
  if (!values || !uploadFile.value) return;
  await handleRequest(
    () =>
      uploadAiAlgorithm(uploadFile.value as File, {
        name: String(values.name).trim(),
        description: String(values.description ?? '').trim(),
        version: String(values.version).trim(),
        moduleType: values.moduleType,
      }),
    async () => {
      uploadVisible.value = false;
      message.success(
        $t('page.ai.algorithm.messages.uploadSuccess', { name: String(values.name) }),
      );
      await gridApi.query();
    },
  );
}

async function onDelete(row: AiAlgorithmInfo) {
  confirm({
    content: $t('page.ai.algorithm.messages.deleteConfirm', { name: row.name }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiAlgorithm(row.id),
        async () => {
          message.success($t('page.ai.algorithm.messages.deleteSuccess', { name: row.name }));
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}

async function submitTest() {
  if (!currentAlgorithmId.value) return;
  const values = await testFormApi.submitForm();
  if (!values) return;
  await handleRequest(
    () =>
      testAiAlgorithm(currentAlgorithmId.value, {
        frameWidth: Number(values.frameWidth),
        frameHeight: Number(values.frameHeight),
        config: {},
      }),
    (result) => {
      testResult.value = JSON.stringify(result, null, 2);
    },
  );
}

function onAlgorithmFileBeforeUpload(file: File) {
  uploadFile.value = file;
  uploadFormApi.setValues({ file: file.name });
  return false;
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button type="primary" @click="openUpload">
          {{ $t('page.ai.algorithm.actions.upload') }}
        </Button>
      </template>
    </Grid>

    <Modal
      :open="uploadVisible"
      :title="$t('page.ai.algorithm.upload.title')"
      :footer="null"
      @cancel="uploadVisible = false"
    >
      <UploadForm>
        <template #file>
          <Upload :before-upload="onAlgorithmFileBeforeUpload" :max-count="1">
            <Button>{{ $t('page.ai.algorithm.upload.pickFile') }}</Button>
          </Upload>
          <div v-if="uploadFile" class="mt-1 text-xs text-gray-500">{{ uploadFile.name }}</div>
        </template>
      </UploadForm>
    </Modal>

    <Modal
      :open="testVisible"
      :title="$t('page.ai.algorithm.test.title')"
      :footer="null"
      @cancel="testVisible = false"
    >
      <div class="space-y-3">
        <TestForm />
        <div>
          <div class="mb-1">{{ $t('page.ai.algorithm.test.result') }}</div>
          <Input.TextArea :value="testResult" :rows="8" readonly />
        </div>
      </div>
    </Modal>
  </Page>
</template>
