import type { VbenFormSchema } from '#/adapter/form';

import { $t } from '@vben/locales';

export function useAlgorithmUploadFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.ai.algorithm.upload.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: $t('page.ai.algorithm.upload.description'),
    },
    {
      component: 'Input',
      fieldName: 'version',
      label: $t('page.ai.algorithm.upload.version'),
      rules: 'required',
      defaultValue: '1.0.0',
    },
    {
      component: 'Select',
      fieldName: 'moduleType',
      label: $t('page.ai.algorithm.upload.moduleType'),
      rules: 'required',
      defaultValue: 'result_processor',
      componentProps: {
        options: [
          { label: 'result_processor', value: 'result_processor' },
          { label: 'frame_transform', value: 'frame_transform' },
        ],
      },
      controlClass: 'w-full',
    },
    {
      component: 'Input',
      fieldName: 'file',
      label: $t('page.ai.algorithm.upload.file'),
      rules: 'required',
    },
  ];
}

export function useAlgorithmTestFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'InputNumber',
      fieldName: 'frameWidth',
      label: $t('page.ai.algorithm.test.frameWidth'),
      rules: 'required',
      defaultValue: 1920,
      componentProps: {
        min: 1,
      },
      controlClass: 'w-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'frameHeight',
      label: $t('page.ai.algorithm.test.frameHeight'),
      rules: 'required',
      defaultValue: 1080,
      componentProps: {
        min: 1,
      },
      controlClass: 'w-full',
    },
  ];
}
