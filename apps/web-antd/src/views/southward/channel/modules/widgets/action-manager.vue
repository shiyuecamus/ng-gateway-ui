<script lang="ts" setup>
import type { ActionInfo, IdType } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { nextTick } from 'vue';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { EntityType } from '@vben/types';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteAction,
  clearActionByDevice,
  createAction,
  deleteAction,
  fetchActionPage,
  updateAction,
} from '#/api/core';
import { importActionCommit, importActionPreview } from '#/api/core/device';
import { useImportFlow } from '#/shared/composables/use-import-flow';

import ActionForm from './action-form.vue';
import { actionSearchFormSchema } from '../schemas/search-form';
import { useActionColumns } from '../schemas/table-columns';

defineOptions({ name: 'ActionManager' });

const { handleRequest } = useRequestHandler();

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: ActionForm,
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

const gridOptions: VxeGridProps<ActionInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  columns: useActionColumns(onActionClick),
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
        const { deviceId } = modalApi.getData<{ deviceId: IdType }>();
        return await fetchActionPage({
          page: page.currentPage,
          pageSize: page.pageSize,
          deviceId,
          ...formValues,
        });
      },
    },
  },
  toolbarConfig: {
    custom: true,
    export: false,
    import: true,
    refresh: true,
    zoom: true,
  },
  importConfig: {
    types: ['xlsx'],
    remote: true,
    importMethod: async ({ file }) => {
      const { deviceId } = modalApi.getData<{ deviceId: IdType }>();
      const { runImport } = useImportFlow({
        previewRequest: async (f: File) => importActionPreview(deviceId, f),
        commitRequest: async (f: File) => importActionCommit(deviceId, f),
      });
      await runImport(file as File, {
        title: $t('page.southward.action.importTitle') as string,
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
    schema: actionSearchFormSchema,
    showCollapseButton: true,
    submitOnEnter: false,
  },
  gridOptions,
});

function onActionClick({ code, row }: OnActionClickParams<ActionInfo>) {
  switch (code) {
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'edit': {
      handleEdit(row);
      break;
    }
    default: {
      break;
    }
  }
}

const handleCreate = () => {
  const { deviceId, driverId, deviceName } = modalApi.getData<{
    deviceId: IdType;
    deviceName: string;
    driverId: IdType;
  }>();

  formDrawerApi
    .setData({
      type: FormOpenType.CREATE,
      deviceId,
      driverId,
    })
    .setState({
      title: $t('common.createWithName', {
        name: `${deviceName} ${$t('page.southward.action.title')}`,
      }),
    })
    .open();
};

const handleEdit = (row: ActionInfo) => {
  const { deviceId, driverId } = modalApi.getData<{
    deviceId: IdType;
    driverId: IdType;
  }>();

  formDrawerApi
    .setData({
      type: FormOpenType.EDIT,
      id: row.id,
      deviceId,
      driverId,
    })
    .setState({
      title: $t('common.editWithName', { name: row.name }),
    })
    .open();
};

const handleDelete = async (row: ActionInfo) => {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.ACTION.toLowerCase()}`),
      name: row.name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteAction(row.id),
        async () => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.name }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const handleBatchDelete = async () => {
  const records = gridApi.getCheckboxRecords() as ActionInfo[];
  if (records.length === 0) {
    message.warning($t('common.action.selectData') as string);
    return;
  }
  confirm({
    content: $t('common.action.actionBatchDeleteConfirm', {
      count: records.length,
    }) as string,
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      const ids = records.map((item) => item.id) as IdType[];
      await handleRequest(
        () => batchDeleteAction(ids),
        async () => {
          message.success($t('common.action.deleteSuccess') as string);
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const handleClear = async () => {
  const { deviceId, deviceName } = modalApi.getData<{
    deviceId: IdType;
    deviceName: string;
  }>();

  confirm({
    content: $t('common.action.actionClearConfirm', {
      name: deviceName,
    }) as string,
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => clearActionByDevice(deviceId),
        async () => {
          message.success($t('common.action.deleteSuccess') as string);
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const handleFormSubmit = async (
  type: FormOpenType,
  id: IdType,
  values: ActionInfo,
) => {
  const payload = { ...values } as ActionInfo;
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createAction(payload),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.createSuccess'));
          await gridApi.query();
        },
      )
    : handleRequest(
        () => updateAction({ ...payload, id } as ActionInfo),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.updateSuccess'));
          await gridApi.query();
        },
      ));
};
</script>

<template>
  <Modal>
    <Page auto-content-height>
      <Grid>
        <template #toolbar-actions>
          <Button class="mr-2" type="primary" @click="handleCreate">
            <span>{{
              `${$t('common.createWithName', { name: $t('page.southward.action.title') })}`
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
  </Modal>
</template>

