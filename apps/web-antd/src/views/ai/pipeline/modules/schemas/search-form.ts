import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';

export const searchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.ai.pipeline.name'),
    componentProps: {
      clearable: true,
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
