<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { AiPipelineInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteAiPipeline,
  fetchAiPipelinePage,
  validateAiPipeline,
} from '#/api';

import { searchFormSchema, useColumns } from './modules/schemas';
import PipelineEditorForm from './modules/widgets/form.vue';

defineOptions({ name: 'AiPipelinePage' });

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AiPipelineInfo> = {
  columns: useColumns(onActionClick),
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    response: {
      result: 'records',
      total: 'total',
      list: 'records',
    },
    ajax: {
      query: async ({ page }, formValues) => {
        return await fetchAiPipelinePage({
          page: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
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

type PipelineGridApi = {
  query: () => Promise<unknown>;
  reload: () => Promise<unknown>;
};

const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (options: any) => readonly [any, PipelineGridApi]
)({
  formOptions,
  gridOptions,
});

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: PipelineEditorForm,
});

function onActionClick({ code, row }: OnActionClickParams<AiPipelineInfo>) {
  switch (code) {
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'edit': {
      handleEdit(row);
      break;
    }
    case 'validate': {
      handleValidate(row);
      break;
    }
    default: {
      break;
    }
  }
}

function handleCreate() {
  formDrawerApi
    .setData({ type: FormOpenType.CREATE })
    .setState({
      title: $t('page.ai.pipeline.actions.create'),
    })
    .open();
}

function handleEdit(row: AiPipelineInfo) {
  formDrawerApi
    .setData({ type: FormOpenType.EDIT, id: row.id })
    .setState({
      title: `${$t('common.edit')} — ${row.name}`,
    })
    .open();
}

async function handleValidate(row: AiPipelineInfo) {
  await handleRequest(
    () => validateAiPipeline(row.id),
    (report) => {
      if (report.valid) {
        message.success($t('page.ai.pipeline.validation.pass'));
      } else {
        message.error(
          report.errors.length > 0
            ? report.errors.join('; ')
            : $t('page.ai.pipeline.validation.fail'),
        );
      }
    },
  );
}

function handleDelete(row: AiPipelineInfo) {
  confirm({
    content: $t('page.ai.pipeline.messages.deleteConfirm', {
      name: row.name,
      channelId: row.id,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiPipeline(row.id),
        async () => {
          message.success(
            $t('page.ai.pipeline.messages.deleteSuccess', {
              name: row.name,
            }),
          );
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}

async function onFormSaved() {
  await gridApi.query();
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleCreate">
          <span>{{ $t('page.ai.pipeline.actions.create') }}</span>
        </Button>
      </template>
    </Grid>
    <FormDrawer @saved="onFormSaved" />
  </Page>
</template>
