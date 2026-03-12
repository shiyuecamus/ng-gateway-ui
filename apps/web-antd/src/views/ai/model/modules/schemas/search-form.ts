import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';

export const searchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.ai.model.name'),
    componentProps: {
      clearable: true,
    },
  },
  {
    component: 'Select',
    fieldName: 'task',
    label: $t('page.ai.model.task'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Object Detection', value: 'object_detection' },
        { label: 'Classification', value: 'classification' },
        { label: 'Segmentation', value: 'segmentation' },
        { label: 'OCR', value: 'ocr' },
        { label: 'Anomaly Detection', value: 'anomaly_detection' },
        { label: 'Custom', value: 'custom' },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
  },
  {
    component: 'Select',
    fieldName: 'format',
    label: $t('page.ai.model.format'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'ONNX', value: 'onnx' },
        { label: 'RKNN', value: 'rknn' },
        { label: 'TensorRT', value: 'tensor_rt' },
        { label: 'OpenVINO', value: 'open_vino' },
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
