import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';

export const searchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.ai.algorithm.name'),
    componentProps: {
      clearable: true,
    },
  },
  {
    component: 'Select',
    fieldName: 'moduleType',
    label: $t('page.ai.algorithm.moduleType'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Frame Transform', value: 'frame_transform' },
        { label: 'Result Processor', value: 'result_processor' },
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
