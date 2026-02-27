import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiModelInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export function useColumns(
  onActionClick: OnActionClickFn<AiModelInfo>,
): VxeTableGridOptions<AiModelInfo>['columns'] {
  return [
    { field: 'id', title: 'ID', minWidth: 180 },
    { field: 'name', title: $t('page.ai.model.name'), minWidth: 160 },
    { field: 'version', title: $t('page.ai.model.version'), width: 120 },
    { field: 'task', title: $t('page.ai.model.task'), minWidth: 160 },
    { field: 'fileSize', title: $t('page.ai.model.fileSize'), width: 150 },
    {
      field: 'loaded',
      title: $t('page.ai.model.loaded'),
      width: 120,
      slots: { default: 'loaded' },
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
            code: 'load',
            icon: 'lucide:play',
            tooltip: $t('page.ai.model.actions.load'),
          },
          {
            code: 'unload',
            icon: 'lucide:square',
            tooltip: $t('page.ai.model.actions.unload'),
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
      width: 160,
    },
  ];
}
