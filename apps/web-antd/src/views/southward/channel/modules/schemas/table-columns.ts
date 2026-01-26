import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type {
  ActionInfo,
  ChannelInfo,
  DeviceInfo,
  PointInfo,
} from '@vben/types';

import type { DeviceObservabilityRow } from './types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
import { CollectionType } from '@vben/types';

import {
  accessModeOptions,
  collectionTypeOptions,
  dataPointTypeOptions,
  dataTypeOptions,
  reportTypeOptions,
} from './options';

type ActionParameter = ActionInfo['inputs'][number];

/**
 * Table columns configuration for tenant package list
 */
export function useChannelColumns(
  onActionClick: OnActionClickFn<ChannelInfo>,
): VxeTableGridOptions<ChannelInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.southward.channel.name'),
    },
    {
      field: 'driverType',
      title: $t('page.southward.channel.driverType'),
    },
    {
      field: 'collectionType',
      title: $t('page.southward.channel.collectionType.title'),
      cellRender: {
        name: 'CellTag',
        options: collectionTypeOptions(),
      },
    },
    {
      field: 'period',
      title: $t('page.southward.channel.period'),
      formatter: ({ row }) => {
        return row.period ? `${(row.period / 1000).toFixed(1)}s` : '-';
      },
    },
    {
      field: 'reportType',
      title: $t('page.southward.channel.reportType.title'),
      cellRender: {
        name: 'CellTag',
        options: reportTypeOptions(),
      },
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
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [
          {
            code: 'configView',
            icon: 'mdi:eye-outline',
            tooltip: $t('page.southward.channel.configView'),
          },
          {
            code: 'logLevel',
            icon: 'mdi:math-log',
            tooltip: $t('page.southward.channel.logLevel'),
          },
          {
            code: 'subDevice',
            icon: 'mdi:devices',
            tooltip: $t('page.southward.channel.subDevice'),
          },
          {
            code: 'observability',
            icon: 'mdi:chart-line',
            tooltip: $t('page.southward.channel.observability.title'),
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

export function useDeviceColumns(
  onActionClick: OnActionClickFn<DeviceInfo>,
): VxeTableGridOptions<DeviceInfo>['columns'] {
  return [
    {
      field: 'deviceName',
      title: $t('page.southward.device.name'),
      type: 'checkbox',
    },
    { field: 'deviceType', title: $t('page.southward.device.type') },
    {
      field: 'status',
      title: $t('common.status.title'),
      slots: { default: 'status' },
    },
    {
      align: 'right',
      cellRender: {
        attrs: { nameField: 'deviceName', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          {
            code: 'pointManagement',
            icon: 'lucide:database',
            tooltip: $t('page.southward.device.pointManagement'),
          },
          {
            code: 'actionManagement',
            icon: 'lucide:activity',
            tooltip: $t('page.southward.device.actionManagement'),
          },
          { code: 'edit', icon: 'lucide:edit', tooltip: $t('common.edit') },
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

export function usePointColumns(
  onActionClick: OnActionClickFn<PointInfo>,
): VxeTableGridOptions<PointInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.southward.point.name'),
      type: 'checkbox',
    },
    { field: 'key', title: $t('page.southward.point.key') },
    {
      field: 'type',
      title: $t('page.southward.point.type'),
      cellRender: {
        name: 'CellTag',
        options: dataPointTypeOptions(),
      },
    },
    {
      field: 'dataType',
      title: $t('page.southward.point.dataType'),
      cellRender: {
        name: 'CellTag',
        options: dataTypeOptions(),
      },
    },
    {
      field: 'accessMode',
      title: $t('page.southward.point.accessMode'),
      cellRender: {
        name: 'CellTag',
        options: accessModeOptions(),
      },
    },
    {
      align: 'right',
      cellRender: {
        attrs: { nameField: 'name', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'edit', icon: 'lucide:edit', tooltip: $t('common.edit') },
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

export function useActionColumns(
  onActionClick: OnActionClickFn<ActionInfo>,
): VxeTableGridOptions<ActionInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.southward.action.name'),
      type: 'checkbox',
    },
    { field: 'command', title: $t('page.southward.action.command') },
    {
      field: 'inputs',
      title: $t('page.southward.action.parameter.count'),
      formatter: ({ row }) => row.inputs?.length ?? 0,
    },
    {
      align: 'right',
      cellRender: {
        attrs: { nameField: 'name', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'edit', icon: 'lucide:edit', tooltip: $t('common.edit') },
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

export function useActionParameterColumns(
  onActionClick: OnActionClickFn<ActionParameter>,
): VxeTableGridOptions<ActionParameter>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.southward.action.parameter.name'),
    },
    {
      field: 'key',
      title: $t('page.southward.action.parameter.key'),
    },
    {
      field: 'dataType',
      title: $t('page.southward.action.parameter.dataType'),
      cellRender: {
        name: 'CellTag',
        options: dataTypeOptions(),
      },
    },
    {
      field: 'required',
      title: $t('page.southward.action.parameter.required'),
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: $t('common.yes'), value: true },
          { color: 'error', label: $t('common.no'), value: false },
        ],
      },
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
          { code: 'edit', icon: 'lucide:edit', tooltip: $t('common.edit') },
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

export function useDeviceObservabilityColumns(): VxeTableGridOptions<DeviceObservabilityRow>['columns'] {
  return useDeviceObservabilityColumnsByType();
}

export function useDeviceObservabilityColumnsByType(
  collectionType: ChannelInfo['collectionType'] = (CollectionType as any)
    .Collection,
): VxeTableGridOptions<DeviceObservabilityRow>['columns'] {
  const isReport = collectionType === (CollectionType as any).Report;

  type Columns = NonNullable<
    VxeTableGridOptions<DeviceObservabilityRow>['columns']
  >;

  const base = [
    {
      field: 'deviceName',
      title: $t('page.southward.channel.observability.table.device'),
      minWidth: 180,
    },
    {
      field: 'deviceType',
      title: $t('page.southward.channel.observability.table.type'),
      minWidth: 140,
    },
  ] as Columns;

  const collectionCols = [
    {
      field: 'collectSuccessTotal',
      title: $t('page.southward.channel.observability.table.ok'),
      width: 90,
    },
    {
      field: 'collectFailTotal',
      title: $t('page.southward.channel.observability.table.fail'),
      width: 90,
    },
    {
      field: 'collectTimeoutTotal',
      title: $t('page.southward.channel.observability.table.timeout'),
      width: 100,
    },
    {
      field: 'avgCollectLatencyMs',
      title: $t('page.southward.channel.observability.table.avgLatencyMs'),
      width: 140,
      formatter: ({ row }) => Number(row.avgCollectLatencyMs ?? 0).toFixed(1),
    },
    {
      field: 'lastCollectLatencyMs',
      title: $t('page.southward.channel.observability.table.lastLatencyMs'),
      width: 140,
      formatter: ({ row }) => Number(row.lastCollectLatencyMs ?? 0).toFixed(1),
    },
  ] as Columns;

  const reportCols = [
    {
      field: 'reportSuccessTotal',
      title: $t('page.southward.channel.observability.table.reportOk'),
      width: 110,
    },
    {
      field: 'reportDroppedTotal',
      title: $t('page.southward.channel.observability.table.reportDropped'),
      width: 110,
    },
    {
      field: 'reportFailTotal',
      title: $t('page.southward.channel.observability.table.reportFail'),
      width: 110,
    },
    {
      field: 'lastReportMs',
      title: $t('page.southward.channel.observability.table.lastReport'),
      width: 170,
      formatter: ({ row }) =>
        row.lastReportMs ? new Date(row.lastReportMs).toLocaleString() : '-',
    },
  ] as Columns;

  const tail = [
    {
      field: 'lastActivityMs',
      title: $t('page.southward.channel.observability.table.lastActivity'),
      width: 170,
      formatter: ({ row }) =>
        row.lastActivityMs
          ? new Date(row.lastActivityMs).toLocaleString()
          : '-',
    },
  ] as Columns;

  return [...base, ...(isReport ? reportCols : collectionCols), ...tail];
}
