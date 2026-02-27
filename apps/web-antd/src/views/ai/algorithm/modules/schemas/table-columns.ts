import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiAlgorithmInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export function useColumns(
  onActionClick: OnActionClickFn<AiAlgorithmInfo>,
): VxeTableGridOptions<AiAlgorithmInfo>['columns'] {
  return [
    { field: 'id', title: 'ID', minWidth: 180 },
    { field: 'name', title: $t('page.ai.algorithm.name'), minWidth: 160 },
    { field: 'version', title: $t('page.ai.algorithm.version'), width: 120 },
    {
      field: 'moduleType',
      title: $t('page.ai.algorithm.moduleType'),
      minWidth: 180,
    },
    { field: 'fileSize', title: $t('page.ai.algorithm.fileSize'), width: 150 },
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
            code: 'test',
            icon: 'lucide:flask-conical',
            tooltip: $t('page.ai.algorithm.actions.test'),
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
      width: 120,
    },
  ];
}
