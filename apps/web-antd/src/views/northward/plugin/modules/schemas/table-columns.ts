import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { PluginInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
import { PluginSource, OsArch, OsType } from '@vben/types';
import {
  formatBytes,
  osArchColor,
  osTypeColor,
  sourceColor,
} from '@vben/utils';

export function useColumns(
  onActionClick: OnActionClickFn<PluginInfo>,
): VxeTableGridOptions<PluginInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.northward.plugin.name'),
    },
    {
      field: 'pluginType',
      title: $t('page.northward.plugin.pluginType'),
    },
    {
      field: 'source',
      title: $t('page.northward.plugin.source.title'),
      cellRender: {
        name: 'CellTag',
        options: sourceOptions(),
      },
    },
    {
      field: 'version',
      title: $t('page.northward.plugin.version'),
    },
    {
      field: 'apiVersion',
      title: $t('page.northward.plugin.apiVersion'),
    },
    {
      field: 'sdkVersion',
      title: $t('page.northward.plugin.sdkVersion'),
    },
    {
      field: 'osType',
      title: $t('page.southward.driver.osType.title'),
      cellRender: {
        name: 'CellTag',
        options: osTypeOptions(),
      },
    },
    {
      field: 'osArch',
      title: $t('page.southward.driver.osArch.title'),
      cellRender: {
        name: 'CellTag',
        options: osArchOptions(),
      },
    },
    {
      field: 'size',
      title: $t('page.northward.plugin.size'),
      formatter: ({ row }) => formatBytes(row.size as number),
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
            code: 'uninstall',
            icon: 'entypo:uninstall',
            tooltip: $t('common.uninstall'),
            danger: true,
            disabled: (row: PluginInfo) => row.source !== 1,
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

function sourceOptions() {
  return [
    {
      color: sourceColor(PluginSource.BuiltIn),
      label: $t('page.northward.plugin.source.builtIn'),
      value: 0,
    },
    {
      color: sourceColor(PluginSource.Custom),
      label: $t('page.northward.plugin.source.custom'),
      value: 1,
    },
  ];
}

function osTypeOptions() {
  return [
    {
      color: osTypeColor(OsType.Windows),
      label: $t('page.southward.driver.osType.windows'),
      value: 0,
    },
    {
      color: osTypeColor(OsType.Linux),
      label: $t('page.southward.driver.osType.linux'),
      value: 1,
    },
    {
      color: osTypeColor(OsType.MacOS),
      label: $t('page.southward.driver.osType.macos'),
      value: 2,
    },
    {
      color: osTypeColor(OsType.Unknown),
      label: $t('page.southward.driver.osType.unknown'),
      value: 3,
    },
  ];
}

function osArchOptions() {
  return [
    {
      color: osArchColor(OsArch.x86),
      label: $t('page.southward.driver.osArch.x86'),
      value: 0,
    },
    {
      color: osArchColor(OsArch.arm64),
      label: $t('page.southward.driver.osArch.arm64'),
      value: 1,
    },
    {
      color: osArchColor(OsArch.arm),
      label: $t('page.southward.driver.osArch.arm'),
      value: 2,
    },
    {
      color: osArchColor(OsArch.Unknown),
      label: $t('page.southward.driver.osArch.unknown'),
      value: 3,
    },
  ];
}
