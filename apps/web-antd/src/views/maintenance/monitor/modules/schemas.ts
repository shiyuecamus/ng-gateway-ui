import type { MonitorRow } from './types';

import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

/**
 * Build VXE grid columns for monitor realtime table.
 */
export function useMonitorColumns(): VxeGridProps<MonitorRow>['columns'] {
  return [
    {
      field: 'deviceName',
      title: $t('page.monitor.realtime.table.deviceName'),
      minWidth: 160,
    },
    {
      field: 'key',
      title: $t('page.monitor.realtime.table.key'),
      minWidth: 160,
    },
    {
      field: 'value',
      title: $t('page.monitor.realtime.table.value'),
      minWidth: 200,
      showOverflow: true,
    },
    {
      field: 'sourceType',
      title: $t('page.monitor.realtime.table.sourceType'),
      width: 160,
      cellRender: {
        name: 'CellTag',
        options: sourceTypeTagOptions(),
      },
    },
    {
      field: 'lastUpdate',
      title: $t('page.monitor.realtime.table.lastUpdate'),
      width: 220,
      formatter: 'formatDateTime',
    },
  ];
}

function sourceTypeTagOptions() {
  return [
    {
      color: 'processing',
      label: $t('page.monitor.realtime.table.sourceTypeMap.telemetry'),
      value: 'telemetry',
    },
    {
      color: 'success',
      label: $t('page.monitor.realtime.table.sourceTypeMap.attributes'),
      value: 'attributes',
    },
  ];
}
