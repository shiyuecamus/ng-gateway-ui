import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { AiAlarmEventInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

const severityOptions = [
  { color: 'red', label: 'Critical', value: 'critical' },
  { color: 'orange', label: 'Warning', value: 'warning' },
  { color: 'blue', label: 'Info', value: 'info' },
];

const statusOptions = [
  { color: 'red', label: 'Open', value: 'open' },
  { color: 'blue', label: 'Acked', value: 'acked' },
  { color: 'default', label: 'Closed', value: 'closed' },
];

export function useColumns(
  onActionClick: OnActionClickFn<AiAlarmEventInfo>,
): VxeTableGridOptions<AiAlarmEventInfo>['columns'] {
  return [
    { field: 'id', title: $t('page.ai.alarm.id'), width: 70 },
    { field: 'channelId', title: $t('page.ai.alarm.channelId'), width: 90 },
    { field: 'alarmType', title: $t('page.ai.alarm.alarmType'), width: 130 },
    {
      field: 'severity',
      title: $t('page.ai.alarm.severity'),
      width: 100,
      cellRender: {
        name: 'CellTag',
        options: severityOptions,
      },
    },
    {
      field: 'description',
      title: $t('page.ai.alarm.description'),
      minWidth: 200,
    },
    {
      field: 'status',
      title: $t('page.ai.alarm.status'),
      width: 100,
      cellRender: {
        name: 'CellTag',
        options: statusOptions,
      },
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
          nameField: 'description',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [
          {
            code: 'detail',
            icon: 'lucide:eye',
            tooltip: $t('common.detail'),
          },
          {
            code: 'ack',
            icon: 'lucide:check',
            tooltip: $t('page.ai.alarm.actions.ack'),
            disabled: (row: AiAlarmEventInfo) => row.status !== 'open',
          },
          {
            code: 'close',
            icon: 'lucide:x',
            tooltip: $t('page.ai.alarm.actions.close'),
            danger: true,
            disabled: (row: AiAlarmEventInfo) => row.status === 'closed',
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
