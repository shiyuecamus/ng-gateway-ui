import { CollectionType, DataType, ReportType } from '@vben/types';

import { $t } from '#/locales';

const DATA_TYPE_COLOR_MAP: Partial<Record<number, string>> = {
  [DataType.Boolean]: 'green',
  [DataType.Int8]: 'volcano',
  [DataType.UInt8]: 'magenta',
  [DataType.Int16]: 'orange',
  [DataType.UInt16]: 'gold',
  [DataType.Int32]: 'geekblue',
  [DataType.UInt32]: 'blue',
  [DataType.Int64]: 'purple',
  [DataType.UInt64]: 'cyan',
  [DataType.Float32]: 'lime',
  [DataType.Float64]: 'green',
  [DataType.String]: 'geekblue',
  [DataType.Binary]: 'red',
  [DataType.Timestamp]: 'orange',
};

const DATA_TYPE_OPTION_KEYS: Array<{ key: string; value: number }> = [
  { key: 'boolean', value: DataType.Boolean },
  { key: 'int8', value: DataType.Int8 },
  { key: 'uint8', value: DataType.UInt8 },
  { key: 'int16', value: DataType.Int16 },
  { key: 'uint16', value: DataType.UInt16 },
  { key: 'int32', value: DataType.Int32 },
  { key: 'uint32', value: DataType.UInt32 },
  { key: 'int64', value: DataType.Int64 },
  { key: 'uint64', value: DataType.UInt64 },
  { key: 'float32', value: DataType.Float32 },
  { key: 'float64', value: DataType.Float64 },
  { key: 'string', value: DataType.String },
  { key: 'binary', value: DataType.Binary },
  { key: 'timestamp', value: DataType.Timestamp },
];

export function collectionTypeOptions() {
  return [
    {
      color: 'cyan',
      label: $t('page.southward.channel.collectionType.collection'),
      value: CollectionType.Collection,
    },
    {
      color: 'purple',
      label: $t('page.southward.channel.collectionType.report'),
      value: CollectionType.Report,
    },
  ];
}

export function reportTypeOptions() {
  return [
    {
      color: 'volcano',
      label: $t('page.southward.channel.reportType.change'),
      value: ReportType.Change,
    },
    {
      color: 'magenta',
      label: $t('page.southward.channel.reportType.always'),
      value: ReportType.Always,
    },
  ];
}

export function dataTypeOptions() {
  return DATA_TYPE_OPTION_KEYS.map(({ key, value }) => ({
    color: DATA_TYPE_COLOR_MAP[value] ?? 'default',
    label: $t(`page.southward.enums.dataType.${key}`),
    value,
  }));
}

export function dataPointTypeOptions() {
  return [
    {
      color: 'geekblue',
      label: $t('page.southward.enums.pointType.attribute'),
      value: 0,
    },
    {
      color: 'cyan',
      label: $t('page.southward.enums.pointType.telemetry'),
      value: 1,
    },
  ];
}

export function accessModeOptions() {
  return [
    {
      color: 'geekblue',
      label: $t('page.southward.enums.accessMode.read'),
      value: 0,
    },
    {
      color: 'orange',
      label: $t('page.southward.enums.accessMode.write'),
      value: 1,
    },
    {
      color: 'purple',
      label: $t('page.southward.enums.accessMode.readWrite'),
      value: 2,
    },
  ];
}

function createOptionResolver<T extends { label: string; value: any }>(
  getter: () => T[],
) {
  return (value: null | T['value'] | undefined) => {
    if (value === null || value === undefined) return '-';
    const option = getter().find((item) => item.value === value);
    return option?.label ?? '-';
  };
}

export const resolveDataTypeLabel = createOptionResolver(dataTypeOptions);
export const resolvePointTypeLabel = createOptionResolver(dataPointTypeOptions);
export const resolveAccessModeLabel = createOptionResolver(accessModeOptions);
