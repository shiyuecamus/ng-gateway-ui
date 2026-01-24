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
import { formatBytesHuman } from '@vben/utils';

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
            code: 'subDevice',
            icon: 'mdi:devices',
            tooltip: $t('page.southward.channel.subDevice'),
          },
          {
            code: 'observability',
            icon: 'mdi:chart-line',
            tooltip: 'Observability',
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
  return [
    { field: 'deviceName', title: 'Device', minWidth: 180 },
    { field: 'deviceType', title: 'Type', minWidth: 140 },
    {
      field: 'bytesSent',
      title: 'Bytes Out',
      width: 140,
      formatter: ({ row }) => formatBytesHuman(row.bytesSent, { zero: '0 B' }),
    },
    {
      field: 'bytesReceived',
      title: 'Bytes In',
      width: 140,
      formatter: ({ row }) =>
        formatBytesHuman(row.bytesReceived, { zero: '0 B' }),
    },
    {
      field: 'collectSuccessTotal',
      title: 'OK',
      width: 80,
    },
    {
      field: 'collectFailTotal',
      title: 'Fail',
      width: 80,
    },
    {
      field: 'collectTimeoutTotal',
      title: 'Timeout',
      width: 90,
    },
    {
      field: 'avgCollectLatencyMs',
      title: 'Avg Lat(ms)',
      width: 120,
      formatter: ({ row }) => row.avgCollectLatencyMs.toFixed(1),
    },
    {
      field: 'lastCollectLatencyMs',
      title: 'Last Lat(ms)',
      width: 130,
      formatter: ({ row }) => row.lastCollectLatencyMs.toFixed(1),
    },
    {
      field: 'lastActivityMs',
      title: 'Last Activity',
      width: 170,
      formatter: ({ row }) =>
        row.lastActivityMs
          ? new Date(row.lastActivityMs).toLocaleString()
          : '-',
    },
  ];
}
