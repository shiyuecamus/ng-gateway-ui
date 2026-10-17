import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AppInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
/**
 * Build VXE grid column definitions for northward apps.
 * @param onActionClick - Row action callback.
 */
export function useColumns(
  onActionClick: OnActionClickFn<AppInfo>,
): VxeTableGridOptions<AppInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.northward.app.name'),
    },
    {
      field: 'pluginType',
      title: $t('page.northward.app.plugin'),
    },
    {
      field: 'status',
      title: $t('common.status.title'),
      slots: { default: 'status' },
    },
    {
      field: 'connectionState',
      title: $t('ui.connectionState.title'),
      cellRender: {
        name: 'CellConnectionState',
      },
    },
    {
      field: 'configurationState',
      title: $t('page.northward.app.configuration.title'),
      slots: { default: 'configurationState' },
      width: 200,
    },
    {
      field: 'createdAt',
      formatter: 'formatDateTime',
      title: $t('common.baseInfo.createdAt'),
    },
    {
      field: 'updatedAt',
      formatter: 'formatDateTime',
      title: $t('common.baseInfo.updatedAt'),
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
            code: 'subscription',
            icon: 'mdi:bell-outline',
            tooltip: $t('page.northward.app.subscription'),
          },
          {
            code: 'logLevel',
            icon: 'mdi:math-log',
            tooltip: $t('page.northward.app.logLevel'),
          },
          {
            code: 'observability',
            icon: 'mdi:chart-line',
            tooltip: 'Observability',
          },
          {
            code: 'exportPoints',
            icon: 'lucide:download',
            tooltip: $t('page.northward.app.exportPoints.action'),
          },
          {
            code: 'certificate',
            icon: 'lucide:shield-check',
            tooltip: $t('page.northward.app.certificate.action'),
          },
          {
            code: 'edit',
            icon: 'lucide:edit',
            tooltip: $t('common.edit'),
          },
          {
            code: 'delete',
            danger: true,
            icon: 'lucide:trash-2',
            tooltip: $t('common.delete'),
          },
        ],
      },
      field: 'operation',
      fixed: 'right',
      headerAlign: 'center',
      showOverflow: false,
      title: $t('common.actions'),
      width: 260,
    },
  ];
}
