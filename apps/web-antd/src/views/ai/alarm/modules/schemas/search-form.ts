import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';

export const searchFormSchema: VbenFormSchema[] = [
  {
    component: 'InputNumber',
    fieldName: 'channelId',
    label: $t('page.ai.alarm.channelId'),
    componentProps: {
      min: 1,
      placeholder: $t('ui.placeholder.input'),
      style: { width: '100%' },
    },
  },
  {
    component: 'Select',
    fieldName: 'severity',
    label: $t('page.ai.alarm.severity'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Critical', value: 'critical' },
        { label: 'Warning', value: 'warning' },
        { label: 'Info', value: 'info' },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
  },
  {
    component: 'Select',
    fieldName: 'status',
    label: $t('page.ai.alarm.status'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Acked', value: 'acked' },
        { label: 'Closed', value: 'closed' },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
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
