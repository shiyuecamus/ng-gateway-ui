<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { DriverInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { DriverTemplateEntity, EntityType } from '@vben/types';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  downloadDriverTemplate,
  fetchDriverPage,
  uninstallDriver,
} from '#/api';

import InstallDriver from './modules/install.vue';
import { searchFormSchema, useColumns } from './modules/schemas';
// TemplateDownload modal is deprecated by dropdown in CellOperation

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: true,
  schema: searchFormSchema,
  // 控制表单是否显示折叠按钮
  showCollapseButton: true,
  // 按下回车时是否提交表单
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<DriverInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto', // 如果设置为 auto，则必须确保存在父节点且不允许存在相邻元素，否则会出现高度闪动问题
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
        return await fetchDriverPage({
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

const [InstallDriverModal, installDriverModalApi] = useVbenModal({
  connectedComponent: InstallDriver,
});

// removed template download modal

function onActionClick({ code, row, extra }: OnActionClickParams<DriverInfo>) {
  switch (code) {
    case 'templateDownload': {
      handleTemplateDownload(row, extra?.menuKey);
      break;
    }
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
  installDriverModalApi.open();
};

async function handleTemplateDownload(row: DriverInfo, menuKey?: string) {
  const entity =
    DriverTemplateEntity[menuKey as keyof typeof DriverTemplateEntity];
  if (!entity) return;
  await downloadDriverTemplate(row.id, row.driverType, entity);
}

const handleUninstall = async (row: DriverInfo) => {
  confirm({
    content: $t('page.southward.driver.uninstallTips'),
    icon: 'warning',
    title: $t('common.action.uninstallConfirm', {
      entityType: $t(`entity.${EntityType.DRIVER.toLowerCase()}`),
      name: row.name,
    }),
  })
    .then(async () => {
      await handleRequest(
        () => uninstallDriver(row.id),
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
            `${$t('common.installWithName', { name: $t('page.southward.driver.title') })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <InstallDriverModal @success="gridApi.reload()" />
  </Page>
</template>
