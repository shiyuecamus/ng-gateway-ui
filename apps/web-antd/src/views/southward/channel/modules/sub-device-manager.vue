<script lang="ts" setup>
import type { DeviceInfo, IdType, Recordable } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { nextTick, ref } from 'vue';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CommonStatus, EntityType } from '@vben/types';

import { Button, Dropdown, Menu, message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteDevice,
  changeDeviceStatus,
  clearDeviceByChannel,
  createDevice,
  deleteDevice,
  fetchDevicePage,
  updateDevice,
} from '#/api';
import {
  importChannelDevicesCommit,
  importChannelDevicesPointsCommit,
  importChannelDevicesPointsPreview,
  importChannelDevicesPreview,
} from '#/api/core/channel';
import { useImportFlow } from '#/shared/composables/use-import-flow';

import ActionManager from './action-manager.vue';
import PointManager from './point-manager.vue';
import { deviceSearchFormSchema } from './schemas/search-form';
import { useDeviceColumns } from './schemas/table-columns';
import SubDeviceForm from './sub-device-form.vue';

type ImportType = 'device' | 'device-points';

defineOptions({ name: 'SubDeviceModal' });

const { handleRequest } = useRequestHandler();

/**
 * Current import type for the toolbar upload button.
 *
 * This ref is updated when the user selects an item from the upload
 * dropdown menu, and is consumed by the importConfig.importMethod
 * callback to decide which API should be called.
 */
const currentImportType = ref<ImportType>('device');

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: SubDeviceForm,
});

const [Modal, modalApi] = useVbenModal({
  class: 'w-4/5',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    await gridApi.query();
  },
});

const gridOptions: VxeGridProps<DeviceInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'deviceName',
  },
  columns: useDeviceColumns(onActionClick),
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
        const { channelId } = modalApi.getData<{ channelId: IdType }>();
        return await fetchDevicePage({
          page: page.currentPage,
          pageSize: page.pageSize,
          channelId,
          ...formValues,
        });
      },
    },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
    zoom: true,
    export: false,
    import: false,
  },
  importConfig: {
    types: ['xlsx'],
    remote: true,
    importMethod: async ({ file }) => {
      const { channelId } = modalApi.getData<{ channelId: IdType }>();

      const isDevicePointsImport = currentImportType.value === 'device-points';

      const { runImport } = useImportFlow({
        previewRequest: async (f: File) =>
          isDevicePointsImport
            ? importChannelDevicesPointsPreview(channelId, f)
            : importChannelDevicesPreview(channelId, f),
        commitRequest: async (f: File) =>
          isDevicePointsImport
            ? importChannelDevicesPointsCommit(channelId, f)
            : importChannelDevicesCommit(channelId, f),
      });

      await runImport(file as File, {
        title: isDevicePointsImport
          ? ($t('page.southward.channel.importDevicePoints') as string)
          : ($t('page.southward.device.importTitle') as string),
        allowCommitWithErrors: true,
        onDone: async () => {
          await gridApi.query();
        },
      });
    },
  },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    collapsed: true,
    schema: deviceSearchFormSchema,
    showCollapseButton: true,
    submitOnEnter: false,
  },
  gridOptions,
});

/**
 * Handle opening import dialog with specific import type.
 *
 * This function updates the import type ref and then calls the
 * underlying VXE Grid instance to open its built-in import window.
 */
const handleOpenImport = async (type: ImportType) => {
  currentImportType.value = type;

  if (gridApi.grid?.openImport) {
    try {
      await gridApi.grid.openImport();
    } catch (error) {
      console.error('Failed to open import dialog:', error);
    }
  }
};

const [PointModal, pointModalApi] = useVbenModal({
  connectedComponent: PointManager,
});

const [ActionModal, actionModalApi] = useVbenModal({
  connectedComponent: ActionManager,
});

function onActionClick({ code, row }: OnActionClickParams<DeviceInfo>) {
  switch (code) {
    case 'actionManagement': {
      handleActionManagement(row);
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
    case 'pointManagement': {
      handlePointManagement(row);
      break;
    }
    default: {
      break;
    }
  }
}

const handleCreate = () => {
  const { channelId, driverId } = modalApi.getData<{
    channelId: IdType;
    driverId: IdType;
  }>();

  formDrawerApi
    .setData({
      type: FormOpenType.CREATE,
      channelId,
      driverId,
    })
    .setState({
      title: $t('common.createWithName', {
        name: $t('page.southward.device.title'),
      }),
    })
    .open();
};

const handleEdit = (row: DeviceInfo) => {
  const { channelId, driverId } = modalApi.getData<{
    channelId: IdType;
    driverId: IdType;
  }>();

  formDrawerApi
    .setData({
      type: FormOpenType.EDIT,
      id: row.id,
      channelId,
      driverId,
    })
    .setState({
      title: $t('common.editWithName', { name: row.deviceName }),
    })
    .open();
};

const handlePointManagement = (row: DeviceInfo) => {
  const { driverId } = modalApi.getData<{ driverId: IdType }>();
  pointModalApi
    .setData({
      deviceId: row.id,
      driverId,
      deviceName: row.deviceName,
    })
    .setState({
      title: `${row.deviceName} - ${$t('page.southward.point.title')}`,
    })
    .open();
};

const handleActionManagement = (row: DeviceInfo) => {
  const { driverId } = modalApi.getData<{ driverId: IdType }>();
  actionModalApi
    .setData({
      deviceId: row.id,
      driverId,
      deviceName: row.deviceName,
    })
    .setState({
      title: `${row.deviceName} - ${$t('page.southward.action.title')}`,
    })
    .open();
};

const handleDelete = async (row: DeviceInfo) => {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.DEVICE.toLowerCase()}`),
      name: row.deviceName,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteDevice(row.id),
        async () => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.deviceName }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const handleBatchDelete = async () => {
  const records = gridApi.getCheckboxRecords() as DeviceInfo[];
  if (records.length === 0) {
    message.warning($t('common.action.selectData') as string);
    return;
  }

  confirm({
    content: $t('common.action.deviceBatchDeleteConfirm', {
      count: records.length,
    }) as string,
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      const ids = records.map((item) => item.id) as IdType[];
      await handleRequest(
        () => batchDeleteDevice(ids),
        async () => {
          message.success($t('common.action.deleteSuccess') as string);
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const handleClear = async () => {
  const { channelId, channelName } = modalApi.getData<{
    channelId: IdType;
    channelName?: string;
    driverId: IdType;
  }>();
  confirm({
    content: $t('common.action.deviceClearConfirm', {
      name: channelName ?? channelId,
    }) as string,
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => clearDeviceByChannel(channelId),
        async () => {
          message.success($t('common.action.deleteSuccess') as string);
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const toggleStatus = async (row: DeviceInfo) => {
  const status =
    row.status === CommonStatus.ENABLED
      ? CommonStatus.DISABLED
      : CommonStatus.ENABLED;
  await handleRequest(
    () => changeDeviceStatus(row.id, status),
    async () => {
      message.success($t('common.action.changeStatusSuccess') as string);
      await gridApi.query();
    },
  );
};

const handleFormSubmit = async (
  type: FormOpenType,
  id: IdType,
  values: Recordable<any>,
) => {
  const payload = { ...values } as DeviceInfo;
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createDevice(payload),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.createSuccess') as string);
          await gridApi.query();
        },
      )
    : handleRequest(
        () => updateDevice({ ...(payload as any), id } as any),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.updateSuccess') as string);
          await gridApi.query();
        },
      ));
};
</script>

<template>
  <Modal>
    <Page auto-content-height>
      <Grid>
        <template #status="{ row }">
          <Switch
            :checked="row.status === CommonStatus.ENABLED"
            @update:checked="toggleStatus(row)"
          />
        </template>
        <template #toolbar-tools>
          <Dropdown trigger="click">
            <!-- Keep spacing visually close to built-in VXE toolbar buttons -->
            <Button shape="circle">
              <i class="vxe-icon-upload"></i>
            </Button>
            <template #overlay>
              <Menu @click="({ key }) => handleOpenImport(key as ImportType)">
                <Menu.Item key="device">
                  <template #icon>
                    <i class="vxe-icon-upload"></i>
                  </template>
                  {{ $t('page.southward.device.importTitle') }}
                </Menu.Item>
                <Menu.Item key="device-points">
                  <template #icon>
                    <i class="vxe-icon-upload"></i>
                  </template>
                  {{ $t('page.southward.channel.importDevicePoints') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </template>
        <template #toolbar-actions>
          <Button class="mr-2" type="primary" @click="handleCreate">
            <span>{{
              `${$t('common.createWithName', { name: $t('page.southward.device.title') })}`
            }}</span>
          </Button>
          <Button class="mr-2" danger @click="handleBatchDelete">
            <span>{{ $t('common.batchDelete') }}</span>
          </Button>
          <Button danger @click="handleClear">
            <span>{{ $t('common.clear') }}</span>
          </Button>
        </template>
      </Grid>
    </Page>
    <FormDrawer @submit="handleFormSubmit" />
    <PointModal />
    <ActionModal />
  </Modal>
</template>

<style scoped>
/* Adjust toolbar tools spacing only for this page's grid.
 * Keep the right margin as default and slightly reduce the left margin
 * so that the custom Dropdown and built-in VXE toolbar tools look balanced.
 */
:deep(.vxe-toolbar .vxe-tools--operate) {
  margin-left: 0.35rem;
}
</style>
