import type { VbenFormSchema } from '#/adapter/form';

import { $t } from '@vben/locales';

export function usePipelineBaseFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'channelId',
      label: $t('page.ai.pipeline.channelId'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'id',
      label: $t('page.ai.pipeline.id'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.ai.pipeline.name'),
      rules: 'required',
    },
  ];
}

export function usePipelineRoiFormSchema(): VbenFormSchema[] {
  return [];
}

export function usePipelineSamplingFormSchema(): VbenFormSchema[] {
  return [];
}

export function usePipelineStagesFormSchema(): VbenFormSchema[] {
  return [];
}

export function usePipelineRulesFormSchema(): VbenFormSchema[] {
  return [];
}

export function usePipelineAnnotationFormSchema(): VbenFormSchema[] {
  return [];
}
