import type { VbenFormSchema as FormSchema } from '@vben/common-ui';

import { h } from 'vue';

import { z } from '@vben/common-ui';
import { Inbox } from '@vben/icons';

import { probeAiAlgorithm } from '#/api';
import { $t } from '#/locales';

export function useFormSchema(customRequest?: any): FormSchema[] {
  return [
    {
      component: 'UploadDragger',
      componentProps: {
        accept: '.wasm',
        customRequest: customRequest ?? probeAiAlgorithm,
        disabled: false,
        maxCount: 1,
        multiple: false,
        showUploadList: true,
      },
      controlClass: 'grid-cols-1 w-full',
      fieldName: 'files',
      hideLabel: true,
      renderComponentContent: () => {
        return {
          default: () => [
            h('p', { class: 'ant-upload-drag-icon flex justify-center' }, [
              h(Inbox, { class: 'size-10 text-primary' }),
            ]),
            h('p', { class: 'ant-upload-text' }, $t('common.uploadText')),
            h('p', { class: 'ant-upload-hint' }, $t('common.uploadHint')),
          ],
        };
      },
      rules: z
        .array(z.any())
        .min(1, { message: $t('page.ai.algorithm.messages.uploadRequired') }),
    },
  ];
}
