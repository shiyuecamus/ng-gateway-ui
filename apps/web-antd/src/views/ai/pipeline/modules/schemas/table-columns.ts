import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiPipelineInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export function useColumns(
  onActionClick: OnActionClickFn<AiPipelineInfo>,
): VxeTableGridOptions<AiPipelineInfo>['columns'] {
  return [
    { field: 'key', title: $t('page.ai.pipeline.id'), minWidth: 180 },
    { field: 'name', title: $t('page.ai.pipeline.name'), minWidth: 160 },
    {
      field: 'stages',
      title: $t('page.ai.pipeline.stageCount'),
      width: 100,
      formatter: ({ cellValue }) => (cellValue as any[])?.length ?? 0,
    },
    {
      field: 'alarmRules',
      title: $t('page.ai.pipeline.ruleCount'),
      width: 100,
      formatter: ({ cellValue }) => (cellValue as any[])?.length ?? 0,
    },
    { field: 'revision', title: $t('page.ai.pipeline.revision'), width: 90 },
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
            code: 'edit',
            icon: 'lucide:pencil',
            tooltip: $t('common.edit'),
          },
          {
            code: 'validate',
            icon: 'lucide:check-circle',
            tooltip: $t('page.ai.pipeline.actions.validate'),
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
      width: 180,
    },
  ];
}
