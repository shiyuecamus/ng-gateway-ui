import type { MonitorRow } from '@vben/types';

import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';
import { DataType } from '@vben/types';

import { sampleTimeText, sourceTimeText } from '../time';

/**
 * Build VXE grid columns for monitor realtime table.
 */
export function useMonitorColumns(): VxeGridProps<MonitorRow>['columns'] {
  return [
    {
      field: 'deviceName',
      title: $t('page.monitor.realtime.table.deviceName'),
      minWidth: 100,
      showOverflow: true,
    },
    {
      field: 'key',
      title: $t('page.monitor.realtime.table.key'),
      minWidth: 100,
      showOverflow: true,
    },
    {
      field: 'value',
      formatter: ({ row }) => formatSampleValue(row),
      title: $t('page.monitor.realtime.table.value'),
      minWidth: 160,
      showOverflow: true,
    },
    {
      field: 'sourceQuality',
      title: $t('page.monitor.realtime.table.sourceQuality'),
      width: 130,
      slots: { default: 'sourceQuality' },
    },
    {
      field: 'freshness',
      title: $t('page.monitor.realtime.table.freshness'),
      width: 90,
      cellRender: {
        name: 'CellTag',
        options: [
          {
            value: 'current',
            color: 'success',
            label: $t('page.monitor.realtime.freshness.current'),
          },
          {
            value: 'recovering',
            color: 'processing',
            label: $t('page.monitor.realtime.freshness.recovering'),
          },
          {
            value: 'stale',
            color: 'warning',
            label: $t('page.monitor.realtime.freshness.stale'),
          },
          {
            value: 'unknown',
            color: 'default',
            label: $t('page.monitor.realtime.freshness.unknown'),
          },
        ],
      },
    },
    {
      field: 'receivedTime',
      title: $t('page.monitor.realtime.table.receivedTime'),
      width: 200,
      formatter: ({ row }) => sampleTimeText(row.receivedTime),
    },
    {
      field: 'sourceTime',
      title: $t('page.monitor.realtime.table.sourceTime'),
      width: 200,
      formatter: ({ row }) => sourceTimeText(row),
    },
    {
      field: 'sourceType',
      visible: false,
      title: $t('page.monitor.realtime.table.sourceType'),
      width: 160,
      cellRender: {
        name: 'CellTag',
        options: sourceTypeTagOptions(),
      },
    },
    {
      field: 'stateChangedAt',
      visible: false,
      title: $t('page.monitor.realtime.table.stateChangedAt'),
      width: 200,
      formatter: ({ row }) => sampleTimeText(row.stateChangedAt),
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

/** Render non-finite observation bits without converting exact integer strings. */
function formatSampleValue(row: MonitorRow): string {
  const value = row.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'ieee754Bits' in value) {
    const bits = value.ieee754Bits;
    let width = 0;
    if (row.valueType === DataType.Float32) width = 4;
    else if (row.valueType === DataType.Float64) width = 8;
    if (
      typeof bits === 'string' &&
      width > 0 &&
      bits.length === width * 2 &&
      /^[\da-f]+$/i.test(bits)
    ) {
      const bytes = Uint8Array.from(bits.match(/../g) ?? [], (pair) =>
        Number.parseInt(pair, 16),
      );
      const view = new DataView(bytes.buffer);
      return String(
        width === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false),
      );
    }
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
