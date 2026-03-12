<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { AiAlgorithmInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteAiAlgorithm, fetchAiAlgorithmPage } from '#/api';

import { searchFormSchema, useColumns } from './modules/schemas';
import InstallAiAlgorithm from './modules/widgets/install.vue';
import TestAiAlgorithm from './modules/widgets/test.vue';

defineOptions({ name: 'AiAlgorithmPage' });

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AiAlgorithmInfo> = {
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
        return await fetchAiAlgorithmPage({
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

const [InstallAlgorithmModal, installAlgorithmModalApi] = useVbenModal({
  connectedComponent: InstallAiAlgorithm,
});

const [TestAlgorithmModal, testAlgorithmModalApi] = useVbenModal({
  connectedComponent: TestAiAlgorithm,
});

function onActionClick({ code, row }: OnActionClickParams<AiAlgorithmInfo>) {
  switch (code) {
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'test': {
      handleTest(row);
      break;
    }
    default: {
      break;
    }
  }
}

function handleInstall() {
  installAlgorithmModalApi.open();
}

async function handleTest(row: AiAlgorithmInfo) {
  testAlgorithmModalApi
    .setData({ algorithm: row })
    .setState({
      title: `${$t('page.ai.algorithm.test.title')} - ${row.name}`,
    })
    .open();
}

function handleDelete(row: AiAlgorithmInfo) {
  confirm({
    content: $t('page.ai.algorithm.messages.deleteConfirm', {
      name: row.name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAiAlgorithm(row.id),
        async () => {
          message.success(
            $t('page.ai.algorithm.messages.deleteSuccess', {
              name: row.name,
            }),
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
          <span>{{ $t('page.ai.algorithm.actions.upload') }}</span>
        </Button>
      </template>
    </Grid>
    <InstallAlgorithmModal @success="gridApi.reload()" />
    <TestAlgorithmModal />
  </Page>
</template>
