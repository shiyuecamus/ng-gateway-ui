import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiPipelineSummary } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export function useColumns(
  onActionClick: OnActionClickFn<AiPipelineSummary>,
): VxeTableGridOptions<AiPipelineSummary>['columns'] {
  return [
    { field: 'channelId', title: $t('page.ai.pipeline.channelId'), width: 120 },
    { field: 'config.id', title: $t('page.ai.pipeline.id'), minWidth: 180 },
    { field: 'config.name', title: $t('page.ai.pipeline.name'), minWidth: 180 },
    {
      field: 'config.stages',
      title: $t('page.ai.pipeline.stageCount'),
      width: 130,
      slots: { default: 'stageCount' },
    },
    {
      field: 'config.alarmRules',
      title: $t('page.ai.pipeline.ruleCount'),
      width: 130,
      slots: { default: 'ruleCount' },
    },
    {
      field: 'config.annotation',
      title: $t('page.ai.pipeline.annotation'),
      width: 120,
      slots: { default: 'annotation' },
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'config.name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [
          {
            code: 'edit',
            icon: 'lucide:edit',
            tooltip: $t('common.edit'),
          },
          {
            code: 'validate',
            icon: 'mdi:check-decagram-outline',
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
