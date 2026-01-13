import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';
import { CommonStatus } from '@vben/types';

import {
  accessModeOptions,
  dataPointTypeOptions,
  dataTypeOptions,
} from './options';

/**
 * Search form schema for channel package list
 */
export const channelSearchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.southward.channel.name'),
    componentProps: {
      clearable: true,
    },
  },
  {
    component: 'Select',
    componentProps: {
      clearable: true,
      options: [
        {
          label: $t('common.status.enabled'),
          value: CommonStatus.ENABLED,
        },
        {
          label: $t('common.status.disabled'),
          value: CommonStatus.DISABLED,
        },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
    fieldName: 'status',
    label: $t('common.status.title'),
  },
  {
    component: 'DatePicker',
    fieldName: 'startTime',
    label: $t('common.baseInfo.startTime'),
    componentProps: {
      type: 'datetime',
      clearable: true,
      showTime: true,
      valueFormat: 'YYYY-MM-DDTHH:mm:ss.SSSZZ',
    },
  },
  {
    component: 'DatePicker',
    fieldName: 'endTime',
    label: $t('common.baseInfo.endTime'),
    componentProps: {
      type: 'datetime',
      clearable: true,
      showTime: true,
      valueFormat: 'YYYY-MM-DDTHH:mm:ss.SSSZZ',
    },
  },
];

/**
 * Search form schema for device package list
 */
export const deviceSearchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'deviceName',
    label: $t('page.southward.device.name'),
  },
  {
    component: 'Input',
    fieldName: 'deviceType',
    label: $t('page.southward.device.type'),
  },
];

export const pointSearchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.southward.point.name'),
  },
  {
    component: 'Input',
    fieldName: 'key',
    label: $t('page.southward.point.key'),
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: dataPointTypeOptions(),
    },
    fieldName: 'type',
    label: $t('page.southward.point.type'),
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: dataTypeOptions(),
    },
    fieldName: 'dataType',
    label: $t('page.southward.point.dataType'),
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: accessModeOptions(),
    },
    fieldName: 'accessMode',
    label: $t('page.southward.point.accessMode'),
  },
];

export const actionSearchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.southward.action.name'),
  },
  {
    component: 'Input',
    fieldName: 'command',
    label: $t('page.southward.action.command'),
  },
];
