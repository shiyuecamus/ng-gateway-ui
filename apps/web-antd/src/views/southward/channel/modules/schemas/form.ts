import type { VbenFormSchema as FormSchema } from '@vben/common-ui';

import type { ZodTypeAny } from '#/adapter/form';

import { $t } from '@vben/locales';
import { CollectionType, DataType, ReportType } from '@vben/types';

import { z } from '#/adapter/form';

import {
  accessModeOptions,
  collectionTypeOptions,
  dataPointTypeOptions,
  dataTypeOptions,
  reportTypeOptions,
} from './options';

export function useChannelBasicFormSchema(): FormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.inputWithName', {
          name: $t('page.southward.channel.name'),
        }),
      },
      fieldName: 'name',
      label: $t('page.southward.channel.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'driverId',
      label: $t('page.southward.channel.driver'),
      rules: 'required',
      controlClass: 'w-full',
    },
    {
      component: 'Select',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.selectWithName', {
          name: $t('page.southward.channel.collectionType.title'),
        }),
        options: collectionTypeOptions(),
      },
      fieldName: 'collectionType',
      label: $t('page.southward.channel.collectionType.title'),
      rules: 'required',
      controlClass: 'w-full',
      defaultValue: CollectionType.Collection,
    },
    {
      component: 'InputNumber',
      fieldName: 'period',
      label: $t('page.southward.channel.period'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      dependencies: {
        triggerFields: ['collectionType'],
        if: (values) => {
          return values.collectionType === CollectionType.Collection;
        },
        rules: (values) => {
          return values.collectionType === CollectionType.Collection
            ? 'required'
            : null;
        },
      },
    },
    {
      component: 'Select',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.selectWithName', {
          name: $t('page.southward.channel.reportType.title'),
        }),
        options: reportTypeOptions(),
      },
      fieldName: 'reportType',
      label: $t('page.southward.channel.reportType.title'),
      rules: 'required',
      controlClass: 'w-full',
      defaultValue: ReportType.Change,
    },
  ];
}

export function useSubDeviceBasicFormSchema(): FormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'deviceName',
      label: $t('page.southward.device.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'deviceType',
      label: $t('page.southward.device.type'),
      rules: 'required',
    },
  ];
}

export function usePointBasicFormSchema(): FormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.southward.point.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'key',
      label: $t('page.southward.point.key'),
      rules: 'required',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: dataPointTypeOptions(),
      },
      fieldName: 'type',
      label: $t('page.southward.point.type'),
      rules: 'required',
      controlClass: 'w-full',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: dataTypeOptions(),
      },
      fieldName: 'dataType',
      label: $t('page.southward.point.dataType'),
      rules: 'required',
      controlClass: 'w-full',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: accessModeOptions(),
      },
      fieldName: 'accessMode',
      label: $t('page.southward.point.accessMode'),
      rules: 'required',
      controlClass: 'w-full',
    },
    {
      component: 'Input',
      fieldName: 'unit',
      label: $t('page.southward.point.unit'),
    },
    {
      component: 'InputNumber',
      fieldName: 'minValue',
      label: $t('page.southward.point.minValue'),
      controlClass: 'w-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'maxValue',
      label: $t('page.southward.point.maxValue'),
      controlClass: 'w-full',
    },
    {
      component: 'Divider',
      fieldName: 'transformDivider',
      hideLabel: true,
      renderComponentContent() {
        return {
          default: () => $t('page.southward.point.transform'),
        };
      },
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: dataTypeOptions(),
      },
      fieldName: 'transformDataType',
      label: $t('page.southward.point.logicalDataType'),
      controlClass: 'w-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'transformScale',
      label: $t('page.southward.point.scale'),
      controlClass: 'w-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'transformOffset',
      label: $t('page.southward.point.transformOffset'),
      controlClass: 'w-full',
    },
    {
      component: 'Switch',
      fieldName: 'transformNegate',
      label: $t('page.southward.point.transformNegate'),
      defaultValue: false,
    },
  ];
}

export function useActionBasicFormSchema(): FormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.southward.action.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'command',
      label: $t('page.southward.action.command'),
      rules: 'required',
    },
  ];
}

export function useActionParameterBasicFormSchema(): FormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.southward.action.parameter.name'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'key',
      label: $t('page.southward.action.parameter.key'),
      rules: 'required',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: dataTypeOptions(),
      },
      controlClass: 'w-full',
      fieldName: 'dataType',
      label: $t('page.southward.action.parameter.dataType'),
      rules: 'required',
    },
    {
      component: 'Switch',
      fieldName: 'required',
      label: $t('page.southward.action.parameter.required'),
      defaultValue: false,
    },
    {
      component: 'JsonEditor',
      fieldName: 'defaultValue',
      label: $t('page.southward.action.parameter.defaultValue'),
      componentProps: {
        mode: 'text',
        stringified: false,
        statusBar: false,
        navigationBar: false,
        mainMenuBar: false,
      },
      dependencies: {
        // 需要在以下字段变化时重新计算默认值的校验规则
        triggerFields: [
          'required',
          'dataType',
          'transformDataType',
          'minValue',
          'maxValue',
        ],
        rules: (values) => {
          // 基于 logical data type 构建 zod 校验；当 required=false 时，强制必填；当 required=true 时，允许为空
          // 注意：仅对存在的值进行类型校验，min/max 仅对数值类型生效
          const wireDt = Number(values?.dataType);
          const logicalDt =
            typeof values?.transformDataType === 'number'
              ? Number(values.transformDataType)
              : wireDt;
          const isRequired = !values?.required;

          // 映射 dataType -> zod 基础类型
          let schema: ZodTypeAny;
          const isNumeric =
            logicalDt === DataType.Int8 ||
            logicalDt === DataType.UInt8 ||
            logicalDt === DataType.Int16 ||
            logicalDt === DataType.UInt16 ||
            logicalDt === DataType.Int32 ||
            logicalDt === DataType.UInt32 ||
            logicalDt === DataType.Int64 ||
            logicalDt === DataType.UInt64 ||
            logicalDt === DataType.Float32 ||
            logicalDt === DataType.Float64 ||
            logicalDt === DataType.Timestamp;

          // 为数值类型收集范围
          const min =
            typeof values?.minValue === 'number' ? values.minValue : undefined;
          const max =
            typeof values?.maxValue === 'number' ? values.maxValue : undefined;

          switch (logicalDt) {
            case DataType.Binary:
            case DataType.String: {
              // Binary 也按字符串校验（默认视作 base64/hex 等字符串表达）
              schema = z.string();
              break;
            }
            case DataType.Boolean: {
              schema = z.boolean();
              break;
            }
            case DataType.Float32:
            case DataType.Float64: {
              schema = z.number();
              if (typeof min === 'number')
                schema = (schema as any).min(Number(min));
              if (typeof max === 'number')
                schema = (schema as any).max(Number(max));
              break;
            }
            case DataType.Int8:
            case DataType.Int16:
            case DataType.Int32:
            case DataType.Int64: {
              schema = z.number().int();
              if (typeof min === 'number')
                schema = (schema as any).min(Number(min));
              if (typeof max === 'number')
                schema = (schema as any).max(Number(max));
              break;
            }
            case DataType.Timestamp: {
              // 时间戳按整数数值校验（毫秒/秒的粒度交由后端/业务解释）
              schema = z.number().int();
              if (typeof min === 'number')
                schema = (schema as any).min(Number(min));
              if (typeof max === 'number')
                schema = (schema as any).max(Number(max));
              break;
            }
            case DataType.UInt8:
            case DataType.UInt16:
            case DataType.UInt32:
            case DataType.UInt64: {
              schema = z.number().int().min(0);
              if (typeof min === 'number')
                schema = (schema as any).min(Math.max(0, Number(min)));
              if (typeof max === 'number')
                schema = (schema as any).max(Number(max));
              break;
            }
            default: {
              // 兜底按任意值；若需要强类型，后续补充
              schema = z.any();
            }
          }

          // 非数值类型不应用 min/max
          if (!isNumeric) {
            // no-op
          }

          if (isRequired) {
            // 统一确保存在性（即便 schema 是 z.any() 也不放过 undefined/null）
            return schema.refine((v: any) => v !== undefined && v !== null, {
              message: $t('ui.formRules.required', [
                $t('page.southward.action.parameter.defaultValue'),
              ]),
            });
          }
          // 当 required=true 时，允许 defaultValue 为 null 或对应类型的值
          return schema.nullable().optional();
        },
      },
      controlClass: 'w-full jse-theme-dark',
    },
    {
      component: 'InputNumber',
      controlClass: 'w-full',
      fieldName: 'minValue',
      label: $t('page.southward.action.parameter.minValue'),
    },
    {
      component: 'InputNumber',
      controlClass: 'w-full',
      fieldName: 'maxValue',
      label: $t('page.southward.action.parameter.maxValue'),
    },
    {
      component: 'Divider',
      fieldName: 'actionParamTransformDivider',
      hideLabel: true,
      renderComponentContent() {
        return {
          default: () => $t('page.southward.action.parameter.transform'),
        };
      },
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: dataTypeOptions(),
      },
      controlClass: 'w-full',
      fieldName: 'transformDataType',
      label: $t('page.southward.action.parameter.logicalDataType'),
    },
    {
      component: 'InputNumber',
      controlClass: 'w-full',
      fieldName: 'transformScale',
      label: $t('page.southward.action.parameter.scale'),
    },
    {
      component: 'InputNumber',
      controlClass: 'w-full',
      fieldName: 'transformOffset',
      label: $t('page.southward.action.parameter.transformOffset'),
    },
    {
      component: 'Switch',
      fieldName: 'transformNegate',
      label: $t('page.southward.action.parameter.transformNegate'),
      defaultValue: false,
    },
  ];
}

export function useConnectPolicyFormSchema(): FormSchema[] {
  return [
    // Connection timeouts
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.connectTimeoutMs',
      label: $t('page.southward.channel.connectPolicy.connectTimeout'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 10_000,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.readTimeoutMs',
      label: $t('page.southward.channel.connectPolicy.readTimeout'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 10_000,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.writeTimeoutMs',
      label: $t('page.southward.channel.connectPolicy.writeTimeout'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 10_000,
    },
    {
      component: 'Divider',
      fieldName: 'backoffDivider',
      hideLabel: true,
      renderComponentContent() {
        return {
          default: () =>
            $t('page.southward.channel.connectPolicy.backoff.title'),
        };
      },
    },
    // Backoff configuration
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.maxAttempts',
      label: $t('page.southward.channel.connectPolicy.backoff.maxAttempts'),
      help: $t('page.southward.channel.connectPolicy.backoff.maxAttemptsHelp'),
      controlClass: 'w-full',
      // 0 = no retry, empty = unlimited retries
      componentProps: { min: 0, precision: 0 },
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.initialIntervalMs',
      label: $t('page.southward.channel.connectPolicy.backoff.initialInterval'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 1000,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.maxIntervalMs',
      label: $t('page.southward.channel.connectPolicy.backoff.maxInterval'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 30_000,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.randomizationFactor',
      label: $t(
        'page.southward.channel.connectPolicy.backoff.randomizationFactor',
      ),
      controlClass: 'w-full',
      componentProps: { min: 0, max: 1, step: 0.01 },
      rules: 'required',
      defaultValue: 0.2,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.multiplier',
      label: $t('page.southward.channel.connectPolicy.backoff.multiplier'),
      controlClass: 'w-full',
      componentProps: { min: 1, step: 0.1 },
      rules: 'required',
      defaultValue: 2,
    },
    {
      component: 'InputNumber',
      fieldName: 'connectionPolicy.backoff.maxElapsedTimeMs',
      label: $t('page.southward.channel.connectPolicy.backoff.maxElapsedTime'),
      help: $t('ui.help.unitWithName', { unit: $t('ui.unit.milliseconds') }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
    },
  ];
}
