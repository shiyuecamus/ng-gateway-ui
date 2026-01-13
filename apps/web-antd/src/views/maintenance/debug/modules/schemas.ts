import type { VbenFormSchema as FormSchema } from '@vben/common-ui';
import type { ActionInfo } from '@vben/types';

import { z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { DataType } from '@vben/types';

/**
 * Build dynamic form schema for action debug.
 */
export function buildActionDebugSchema(info: ActionInfo): FormSchema[] {
  const timeoutItem: FormSchema = {
    component: 'InputNumber',
    fieldName: 'timeoutMs',
    label: $t('page.southward.action.timeoutMs'),
    componentProps: {
      min: 1,
      step: 100,
      class: 'w-full',
    },
    rules: z.number().min(1).default(5000),
  };

  const inputItems: FormSchema[] = (info.inputs || []).map((p) => {
    if (p.dataType === DataType.Boolean) {
      return {
        component: 'Switch',
        fieldName: p.key,
        label: p.name,
        rules: p.required ? z.boolean() : undefined,
      };
    }

    const isFloat = ([DataType.Float32, DataType.Float64] as number[]).includes(
      p.dataType as number,
    );
    const isInteger = (
      [
        DataType.Int8,
        DataType.UInt8,
        DataType.Int16,
        DataType.UInt16,
        DataType.Int32,
        DataType.UInt32,
        DataType.Int64,
        DataType.UInt64,
        DataType.Timestamp,
      ] as number[]
    ).includes(p.dataType as number);

    if (isFloat || isInteger) {
      return {
        component: 'InputNumber',
        fieldName: p.key,
        label: p.name,
        componentProps: {
          min: p.minValue ?? undefined,
          max: p.maxValue ?? undefined,
          step: isFloat ? 0.01 : 1,
          class: 'w-full',
        },
        rules: p.required ? 'required' : undefined,
      };
    }

    return {
      component: 'Input',
      fieldName: p.key,
      label: p.name,
      componentProps: {
        class: 'w-full',
      },
      rules: p.required ? 'required' : undefined,
    };
  });

  return [timeoutItem, ...inputItems];
}

/**
 * Build initial form values for action debug form.
 */
export function buildActionDebugInitialValues(
  info: ActionInfo,
): Record<string, any> {
  const entries: Array<[string, any]> = [
    ['timeoutMs', 5000],
    ...(info.inputs || []).map<[string, any]>((p) => [
      p.key,
      p.dataType === DataType.Boolean
        ? (p.defaultValue ?? false)
        : (p.defaultValue ?? undefined),
    ]),
  ];

  return Object.fromEntries(entries) as Record<string, any>;
}
