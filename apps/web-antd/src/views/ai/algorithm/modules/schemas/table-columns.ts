import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiAlgorithmInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
import { formatBytes } from '@vben/utils';

export function useColumns(
  onActionClick: OnActionClickFn<AiAlgorithmInfo>,
): VxeTableGridOptions<AiAlgorithmInfo>['columns'] {
  return [
    { field: 'name', title: $t('page.ai.algorithm.name'), minWidth: 160 },
    { field: 'version', title: $t('page.ai.algorithm.version'), width: 100 },
    {
      field: 'moduleType',
      title: $t('page.ai.algorithm.moduleType'),
      width: 150,
    },
    {
      field: 'size',
      title: $t('page.ai.algorithm.fileSize'),
      width: 120,
      formatter: ({ row }) => formatBytes(row.size as number),
    },
    {
      field: 'createdAt',
      formatter: 'formatDateTime',
      title: $t('common.baseInfo.createdAt'),
      width: 170,
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
      width: 160,
    },
  ];
}
