<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { IdType, Recordable, UserInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { h } from 'vue';

import {
  confirm,
  Page,
  prompt,
  useAlertContext,
  useVbenDrawer,
} from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CommonStatus, EntityType } from '@vben/types';

import { Button, Input, message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeUserStatus,
  createUser,
  deleteUser,
  fetchUserPage,
  resetUserPassword,
  updateUser,
} from '#/api';

import UserForm from './modules/form.vue';
import { searchFormSchema, useColumns } from './modules/schemas';

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

const gridOptions: VxeGridProps<UserInfo> = {
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
        return await fetchUserPage({
          page: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  toolbarConfig: {
    custom: true,
    export: true,
    import: true,
    refresh: true,
    zoom: true,
  },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: UserForm,
});

function onActionClick({ code, row }: OnActionClickParams<UserInfo>) {
  switch (code) {
    case 'assignRole': {
      handleAssignRole(row);
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
    case 'resetPassword': {
      handleResetPassword(row);
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
        name: $t('page.system.user.title'),
      }),
    })
    .open();
};

const handleEdit = (row: UserInfo) => {
  formDrawerApi
    .setData({
      type: FormOpenType.EDIT,
      id: row.id,
    })
    .setState({
      title: $t('common.editWithName', {
        name: row.username,
      }),
    })
    .open();
};

const handleResetPassword = (row: UserInfo) => {
  prompt({
    component: () => {
      // 获取弹窗上下文。注意：只能在setup或者函数式组件中调用
      const { doConfirm } = useAlertContext();
      return h(Input, {
        onKeydown(e: KeyboardEvent) {
          if (e.key === 'Enter') {
            e.preventDefault();
            // 调用弹窗提供的确认方法
            doConfirm();
          }
        },
        placeholder: $t('ui.placeholder.inputWithName', {
          name: $t('page.system.user.newPassword'),
        }),
      });
    },
    icon: 'question',
    modelPropName: 'value',
    content: '',
    title: $t('page.system.user.resetPassword'),
  }).then(async (val) => {
    if (val) {
      await handleRequest(
        () => resetUserPassword(row.id, val),
        (_) => {
          message.success($t('common.action.resetSuccess'));
        },
      );
    }
  });
};

const handleAssignRole = (_row: UserInfo) => {};

const handleDelete = async (row: UserInfo) => {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.USER.toLowerCase()}`),
      name: row.username,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteUser(row.id),
        (_) => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.username }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const toggleStatus = async (row: UserInfo) => {
  const status =
    row.status === CommonStatus.ENABLED
      ? CommonStatus.DISABLED
      : CommonStatus.ENABLED;
  await handleRequest(
    () => changeUserStatus(row.id, status),
    async (_) => {
      message.success($t('common.action.changeStatusSuccess'));
      await gridApi.query();
    },
  );
};

const handleFormSubmit = async (
  type: FormOpenType,
  id: IdType,
  values: Recordable<any>,
) => {
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createUser(values as UserInfo),
        (_) => {
          message.success($t('common.action.createSuccess'));
        },
      )
    : handleRequest(
        () =>
          updateUser({
            id,
            ...values,
          } as UserInfo),
        (_) => {
          message.success($t('common.action.updateSuccess'));
        },
      ));
  await gridApi.query();
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
            `${$t('common.createWithName', { name: $t('page.system.user.title') })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <FormDrawer @submit="handleFormSubmit" />
  </Page>
</template>
