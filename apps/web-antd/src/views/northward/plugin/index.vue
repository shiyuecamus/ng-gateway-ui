<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { PluginInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { EntityType } from '@vben/types';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchPluginPage, uninstallPlugin } from '#/api';

import InstallPlugin from './modules/widgets/install.vue';
import { searchFormSchema, useColumns } from './modules/schemas/index';

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<PluginInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  columns: useColumns(onActionClick),
  exportConfig: {},
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
        return await fetchPluginPage({
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

const [InstallPluginModal, installPluginModalApi] = useVbenModal({
  connectedComponent: InstallPlugin,
});

function onActionClick({ code, row }: OnActionClickParams<PluginInfo>) {
  switch (code) {
    case 'uninstall': {
      handleUninstall(row);
      break;
    }
    default: {
      break;
    }
  }
}

const handleInstall = () => {
  installPluginModalApi.open();
};

const handleUninstall = async (row: PluginInfo) => {
  confirm({
    content: $t('page.northward.plugin.uninstallTips'),
    icon: 'warning',
    title: $t('common.action.uninstallConfirm', {
      entityType: $t(`entity.${EntityType.PLUGIN.toLowerCase()}`),
      name: row.name,
    }),
  })
    .then(async () => {
      await handleRequest(
        () => uninstallPlugin(row.id),
        (_) => {
          message.success(
            $t('common.action.uninstallSuccessWithName', { name: row.name }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleInstall">
          <span>{{
            `${$t('common.installWithName', { name: $t('page.northward.plugin.title') })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <InstallPluginModal @success="gridApi.reload()" />
  </Page>
</template>
