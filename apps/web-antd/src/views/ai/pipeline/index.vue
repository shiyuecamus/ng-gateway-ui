<script lang="ts" setup>
import type {
  AiPipelineSummary,
  AiPipelineValidationReport,
} from '@vben/types';
import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createAiPipeline,
  deleteAiPipeline,
  fetchAiPipelines,
  updateAiPipeline,
  validateAiPipeline,
} from '#/api';

import { useColumns } from './modules/schemas';
import type { PipelineEditorSubmitPayload } from './modules/schemas';
import { PipelineEditor, PipelineValidation } from './modules/widgets';

defineOptions({ name: 'AiPipelinePage' });

const { handleRequest } = useRequestHandler();

const gridOptions: VxeGridProps<AiPipelineSummary> = {
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    ajax: {
      query: async () => await fetchAiPipelines(),
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

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });

const [EditorDrawer, editorDrawerApi] = useVbenDrawer({
  connectedComponent: PipelineEditor,
});

const [ValidationModal, validationModalApi] = useVbenModal({
  connectedComponent: PipelineValidation,
});

function onActionClick({ code, row }: OnActionClickParams<AiPipelineSummary>) {
  switch (code) {
    case 'edit': {
      editorDrawerApi.setData({ mode: 'update', summary: row }).open();
      break;
    }
    case 'validate': {
      void onValidate(row.channelId);
      break;
    }
    case 'delete': {
      void onDelete(row.channelId, row.config.name);
      break;
    }
    default: {
      break;
    }
  }
}

function onCreate() {
  editorDrawerApi.setData({ mode: 'create' }).open();
}

async function onValidate(channelId: number) {
  await handleRequest(
    () => validateAiPipeline(channelId),
    (result: AiPipelineValidationReport) => {
      validationModalApi.setData(result).open();
    },
  );
}

async function onDelete(channelId: number, name: string) {
  confirm({
    content: $t('page.ai.pipeline.messages.deleteConfirm', {
      channelId,
      name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiPipeline(channelId),
        async () => {
          message.success($t('common.action.deleteSuccess'));
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}

async function onEditorSubmit(payload: PipelineEditorSubmitPayload) {
  await handleRequest(
    async () => {
      if (editorDrawerApi.getData<{ mode: 'create' | 'update' }>()?.mode === 'create') {
        return await createAiPipeline(payload);
      }
      return await updateAiPipeline(payload);
    },
    async () => {
      editorDrawerApi.close();
      await gridApi.query();
    },
  );
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="onCreate">
          {{ $t('page.ai.pipeline.actions.create') }}
        </Button>
      </template>
      <template #stageCount="{ row }">
        {{ row.config.stages?.length ?? 0 }}
      </template>
      <template #ruleCount="{ row }">
        {{ row.config.alarmRules?.length ?? 0 }}
      </template>
      <template #annotation="{ row }">
        <Tag
          :color="row.config.annotation?.drawBboxes ? 'success' : 'default'"
        >
          {{
            row.config.annotation?.drawBboxes
              ? $t('page.ai.common.enabled')
              : $t('page.ai.common.disabled')
          }}
        </Tag>
      </template>
    </Grid>
    <EditorDrawer @submit="onEditorSubmit" />
    <ValidationModal />
  </Page>
</template>
