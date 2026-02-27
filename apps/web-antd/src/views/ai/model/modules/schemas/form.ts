import type { VbenFormSchema } from '#/adapter/form';

import { $t } from '@vben/locales';

export function useModelBasicFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'id',
      label: $t('page.ai.model.upload.id'),
      rules: 'required',
      componentProps: {
        clearable: true,
      },
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.ai.model.upload.name'),
      rules: 'required',
      componentProps: {
        clearable: true,
      },
    },
    {
      component: 'Input',
      fieldName: 'version',
      label: $t('page.ai.model.upload.version'),
      rules: 'required',
      defaultValue: '1.0.0',
      componentProps: {
        clearable: true,
      },
    },
    {
      component: 'Select',
      fieldName: 'task',
      label: $t('page.ai.model.upload.task'),
      rules: 'required',
      defaultValue: 'object_detection',
      componentProps: {
        options: [
          { label: 'object_detection', value: 'object_detection' },
          { label: 'classification', value: 'classification' },
          { label: 'segmentation', value: 'segmentation' },
          { label: 'ocr', value: 'ocr' },
          { label: 'anomaly_detection', value: 'anomaly_detection' },
          { label: 'custom', value: 'custom' },
        ],
      },
      controlClass: 'w-full',
    },
    {
      component: 'Input',
      fieldName: 'labelsText',
      label: 'Labels',
      componentProps: {
        placeholder: 'person,car,bike',
      },
    },
  ];
}

export function useModelUploadFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'file',
      label: $t('page.ai.model.upload.file'),
      rules: 'required',
    },
  ];
}
