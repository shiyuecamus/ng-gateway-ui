import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { DriverInfo } from '@vben/types';

import type { OnActionClickFn } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
import { DriverSource, OsArch, OsType } from '@vben/types';
import {
  formatBytes,
  osArchColor,
  osTypeColor,
  sourceColor,
} from '@vben/utils';

/**
 * Table columns configuration for tenant package list
 */
export function useColumns(
  onActionClick: OnActionClickFn<DriverInfo>,
): VxeTableGridOptions<DriverInfo>['columns'] {
  return [
    {
      field: 'name',
      title: $t('page.southward.driver.name'),
    },
    {
      field: 'driverType',
      title: $t('page.southward.driver.driverType'),
    },
    {
      field: 'source',
      title: $t('page.southward.driver.source.title'),
      cellRender: {
        name: 'CellTag',
        options: sourceOptions(),
      },
    },
    {
      field: 'version',
      title: $t('page.southward.driver.version'),
    },
    {
      field: 'apiVersion',
      title: $t('page.southward.driver.apiVersion'),
    },
    {
      field: 'sdkVersion',
      title: $t('page.southward.driver.sdkVersion'),
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
      title: $t('page.southward.driver.size'),
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
            code: 'templateDownload',
            icon: 'lucide:file-text',
            tooltip: $t('page.southward.driver.templateDownload'),
            dropdown: {
              items: [
                {
                  key: 'Device',
                  icon: 'lucide:cpu',
                  label: $t('entity.device'),
                },
                {
                  key: 'Point',
                  icon: 'lucide:map-pin',
                  label: $t('entity.point'),
                },
                {
                  key: 'Action',
                  icon: 'lucide:zap',
                  label: $t('entity.action'),
                },
                {
                  key: 'DevicePoints',
                  icon: 'lucide:layers',
                  label: $t(
                    'page.southward.driver.templateEntity.devicePoints',
                  ),
                },
              ],
            },
          },
          {
            code: 'uninstall',
            icon: 'entypo:uninstall',
            tooltip: $t('common.uninstall'),
            danger: true,
            disabled: (row: DriverInfo) => row.source !== 1,
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

function sourceOptions() {
  return [
    {
      color: sourceColor(DriverSource.BuiltIn),
      label: $t('page.southward.driver.source.builtIn'),
      value: 0,
    },
    {
      color: sourceColor(DriverSource.Custom),
      label: $t('page.southward.driver.source.custom'),
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
