import type { VbenFormSchema as FormSchema } from '@vben/common-ui';

import { z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { parsePhoneNumber } from 'awesome-phonenumber';

export const formSchema: FormSchema[] = [
  {
    component: 'Input',
    componentProps: {
      clearable: true,
      placeholder: $t('ui.placeholder.inputWithName', {
        name: $t('page.system.user.username'),
      }),
    },
    fieldName: 'username',
    label: $t('page.system.user.username'),
    rules: 'required',
  },
  {
    component: 'Input',
    componentProps: {
      clearable: true,
      placeholder: $t('ui.placeholder.inputWithName', {
        name: $t('page.system.user.nickname'),
      }),
    },
    fieldName: 'nickname',
    label: $t('page.system.user.nickname'),
    rules: 'required',
  },
  {
    component: 'Input',
    componentProps: {
      clearable: true,
      placeholder: $t('ui.placeholder.inputWithName', {
        name: $t('page.system.user.phone'),
      }),
    },
    fieldName: 'phone',
    label: $t('page.system.user.phone'),
    rules: z
      .string()
      .refine(
        (value) => {
          // 如果值为空或只包含国家代码（如+86），不进行验证
          if (
            !value ||
            value.trim() === '' ||
            /^\+\d{1,3}$/.test(value.trim())
          ) {
            return true;
          }
          const phone = parsePhoneNumber(value);
          return phone.valid;
        },
        {
          message: $t('errors.invalidPhone'),
        },
      )
      .optional(),
  },
  {
    component: 'Input',
    componentProps: {
      clearable: true,
      placeholder: $t('ui.placeholder.inputWithName', {
        name: $t('page.system.user.email'),
      }),
    },
    fieldName: 'email',
    label: $t('page.system.user.email'),
    rules: z.string().email($t('errors.invalidEmail')).optional(),
  },
  {
    component: 'InputPassword',
    componentProps: {
      clearable: true,
      placeholder: $t('ui.placeholder.inputWithName', {
        name: $t('page.system.user.password'),
      }),
    },
    fieldName: 'password',
    label: $t('page.system.user.password'),
    rules: 'required',
  },
];
