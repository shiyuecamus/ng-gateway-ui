<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { AiModelInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteAiModel,
  fetchAiModelPage,
  loadAiModel,
  unloadAiModel,
} from '#/api';

import { searchFormSchema, useColumns } from './modules/schemas';
import InstallAiModel from './modules/widgets/install.vue';

defineOptions({ name: 'AiModelPage' });

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AiModelInfo> = {
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
        return await fetchAiModelPage({
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

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [InstallModelModal, installModelModalApi] = useVbenModal({
  connectedComponent: InstallAiModel,
});

function onActionClick({ code, row }: OnActionClickParams<AiModelInfo>) {
  switch (code) {
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'load': {
      handleLoad(row);
      break;
    }
    case 'unload': {
      handleUnload(row);
      break;
    }
    default: {
      break;
    }
  }
}

function handleInstall() {
  installModelModalApi.open();
}

async function handleLoad(row: AiModelInfo) {
  await handleRequest(
    () => loadAiModel(row.id),
    async () => {
      message.success(
        $t('page.ai.model.messages.loadSuccess', { name: row.name }),
      );
      await gridApi.query();
    },
  );
}

async function handleUnload(row: AiModelInfo) {
  await handleRequest(
    () => unloadAiModel(row.id),
    async () => {
      message.success(
        $t('page.ai.model.messages.unloadSuccess', { name: row.name }),
      );
      await gridApi.query();
    },
  );
}

function handleDelete(row: AiModelInfo) {
  confirm({
    content: $t('page.ai.model.messages.deleteConfirm', { name: row.name }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiModel(row.id),
        async () => {
          message.success(
            $t('page.ai.model.messages.deleteSuccess', { name: row.name }),
          );
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleInstall">
          <span>{{ $t('page.ai.model.actions.upload') }}</span>
        </Button>
      </template>
    </Grid>
    <InstallModelModal @success="gridApi.reload()" />
  </Page>
</template>
