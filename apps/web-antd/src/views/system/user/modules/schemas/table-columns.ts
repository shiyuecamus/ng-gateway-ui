import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { UserInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

/**
 * Table columns configuration for tenant package list
 */
export function useColumns(
  onActionClick: OnActionClickFn<UserInfo>,
): VxeTableGridOptions<UserInfo>['columns'] {
  return [
    {
      field: 'username',
      title: $t('page.system.user.username'),
    },
    {
      field: 'nickname',
      title: $t('page.system.user.nickname'),
    },
    {
      field: 'email',
      title: $t('page.system.user.email'),
    },
    {
      field: 'phone',
      title: $t('page.system.user.phone'),
    },
    {
      field: 'status',
      title: $t('common.status.title'),
      slots: { default: 'status' },
    },
    {
      field: 'createdAt',
      formatter: 'formatDateTime',
      title: $t('common.baseInfo.createdAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [
          {
            code: 'resetPassword',
            icon: 'lucide:key',
            tooltip: $t('page.system.user.resetPassword'),
          },
          {
            code: 'assignRole',
            icon: 'lucide:users',
            tooltip: $t('page.system.user.assignRole'),
          },
          {
            code: 'edit',
            icon: 'lucide:edit',
            tooltip: $t('common.edit'),
          },
          {
            code: 'delete',
            icon: 'lucide:trash-2',
            tooltip: $t('common.delete'),
            danger: true,
          },
        ],
      },
      field: 'operation',
      fixed: 'right',
      headerAlign: 'center',
      showOverflow: false,
      title: $t('common.actions'),
      width: 200,
    },
  ];
}
