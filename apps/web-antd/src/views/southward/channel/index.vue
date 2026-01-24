<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { ChannelInfo, IdType, Recordable } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { useRouter } from 'vue-router';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CommonStatus, EntityType } from '@vben/types';

import { Button, message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeChannelStatus,
  createChannel,
  deleteChannel,
  fetchChannelPage,
  updateChannel,
} from '#/api';

import ConfigViewer from './modules/config-viewer.vue';
import ChannelForm from './modules/form.vue';
import { searchFormSchema, useColumns } from './modules/schemas';
import SubDeviceModal from './modules/sub-device-manager.vue';

const { handleRequest } = useRequestHandler();
const router = useRouter();

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: true,
  schema: searchFormSchema,
  // 控制表单是否显示折叠按钮
  showCollapseButton: true,
  // 按下回车时是否提交表单
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<ChannelInfo> = {
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
        return await fetchChannelPage({
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

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: ChannelForm,
});

const [ConfigViewerModal, configViewerModalApi] = useVbenModal({
  connectedComponent: ConfigViewer,
});

const [SubDeviceModalRef, deviceModalApi] = useVbenModal({
  connectedComponent: SubDeviceModal,
});

function onActionClick({ code, row }: OnActionClickParams<ChannelInfo>) {
  switch (code) {
    case 'configView': {
      handleConfigView(row);
      break;
    }
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'edit': {
      handleEdit(row);
      break;
    }
    case 'observability': {
      router.push(`/southward/channel/${row.id}/observability`);
      break;
    }
    case 'subDevice': {
      handleSubDevice(row);
      break;
    }
    default: {
      break;
    }
  }
}

const handleCreate = () => {
  formDrawerApi
    .setData({
      type: FormOpenType.CREATE,
    })
    .setState({
      title: $t('common.createWithName', {
        name: $t('page.southward.title'),
      }),
    })
    .open();
};

const handleConfigView = (row: ChannelInfo) => {
  configViewerModalApi.setData(row.driverConfig).open();
};

const handleEdit = (row: ChannelInfo) => {
  formDrawerApi
    .setData({
      type: FormOpenType.EDIT,
      id: row.id,
    })
    .setState({
      title: $t('common.editWithName', {
        name: row.name,
      }),
    })
    .open();
};

const handleDelete = async (row: ChannelInfo) => {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.CHANNEL.toLowerCase()}`),
      name: row.name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteChannel(row.id),
        (_) => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.name }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const toggleStatus = async (row: ChannelInfo) => {
  const status =
    row.status === CommonStatus.ENABLED
      ? CommonStatus.DISABLED
      : CommonStatus.ENABLED;
  await handleRequest(
    () => changeChannelStatus(row.id, status),
    async (_) => {
      message.success($t('common.action.changeStatusSuccess'));
      await gridApi.query();
    },
  );
};

const handleSubDevice = async (row: ChannelInfo) => {
  deviceModalApi
    .setData({
      channelId: row.id,
      driverId: row.driverId,
      channelName: row.name,
    })
    .setState({
      title: `${row.name} - ${$t('page.southward.channel.subDevice')}`,
    })
    .open();
};

const handleFormSubmit = async (
  type: FormOpenType,
  id: IdType,
  values: Recordable<any>,
) => {
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createChannel(values as ChannelInfo),
        async (_) => {
          formDrawerApi.close();
          message.success($t('common.action.createSuccess'));
          await gridApi.query();
        },
      )
    : handleRequest(
        () =>
          updateChannel({
            id,
            ...values,
          } as ChannelInfo),
        async (_) => {
          formDrawerApi.close();
          message.success($t('common.action.updateSuccess'));
          await gridApi.query();
        },
      ));
};
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #status="{ row }">
        <Switch
          :checked="row.status === CommonStatus.ENABLED"
          @update:checked="toggleStatus(row)"
        />
      </template>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleCreate">
          <span>{{
            `${$t('common.createWithName', { name: $t('page.southward.title') })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <FormDrawer @submit="handleFormSubmit" />
    <ConfigViewerModal />
    <SubDeviceModalRef />
  </Page>
</template>
