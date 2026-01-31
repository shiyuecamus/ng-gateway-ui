import type { VbenFormSchema as FormSchema } from '@vben/common-ui';
import type { IdType } from '@vben/types';

import { z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { DropPolicy } from '@vben/types';

/**
 * Select option definition used for plugin selection.
 */
interface PluginSelectOption {
  /**
   * Option display label.
   */
  label: string;
  /**
   * Bound plugin identifier.
   */
  value: IdType;
}

/**
 * Build basic information form schema (Step 1).
 * @param pluginOptions - Reactive plugin options shared by the caller.
 */
export function useAppBasicFormSchema(
  pluginOptions: PluginSelectOption[],
): FormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.inputWithName', {
          name: $t('page.northward.app.name'),
        }),
      },
      fieldName: 'name',
      label: $t('page.northward.app.name'),
      rules: 'required',
    },
    {
      component: 'Select',
      fieldName: 'pluginId',
      label: $t('page.northward.app.plugin'),
      rules: 'required',
      controlClass: 'w-full',
      componentProps: {
        allowClear: true,
        options: pluginOptions,
        placeholder: $t('ui.placeholder.selectWithName', {
          name: $t('page.northward.app.plugin'),
        }),
      },
    },
    {
      component: 'Textarea',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.inputWithName', {
          name: $t('page.northward.app.description'),
        }),
        rows: 3,
        showCount: true,
      },
      fieldName: 'description',
      controlClass: 'w-full resize-none',
      label: $t('page.northward.app.description'),
    },
  ];
}

/**
 * Build retry policy form schema (Step 2).
 */
export function useRetryPolicyFormSchema(): FormSchema[] {
  return [
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.maxAttempts',
      label: $t('page.northward.app.retryPolicy.maxAttempts'),
      help: $t('page.northward.app.retryPolicy.maxAttemptsHelp'),
      controlClass: 'w-full',
      // 0 = no retry, empty = unlimited retries
      componentProps: { min: 0, precision: 0 },
    },
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.initialIntervalMs',
      label: $t('page.northward.app.retryPolicy.initialInterval'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 1000,
    },
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.maxIntervalMs',
      label: $t('page.northward.app.retryPolicy.maxInterval'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 30_000,
    },
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.randomizationFactor',
      label: $t('page.northward.app.retryPolicy.randomizationFactor'),
      help: $t('page.northward.app.retryPolicy.randomizationFactorHelp'),
      controlClass: 'w-full',
      componentProps: { min: 0, max: 1, step: 0.01 },
      rules: 'required',
      defaultValue: 0.2,
    },
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.multiplier',
      label: $t('page.northward.app.retryPolicy.multiplier'),
      help: $t('page.northward.app.retryPolicy.multiplierHelp'),
      controlClass: 'w-full',
      componentProps: { min: 1, step: 0.1 },
      rules: 'required',
      defaultValue: 2,
    },
    {
      component: 'InputNumber',
      fieldName: 'retryPolicy.maxElapsedTimeMs',
      label: $t('page.northward.app.retryPolicy.maxElapsedTime'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
    },
  ];
}

/**
 * Build queue policy form schema (Step 3).
 */
export function useQueuePolicyFormSchema(): FormSchema[] {
  return [
    {
      component: 'InputNumber',
      fieldName: 'queuePolicy.capacity',
      label: $t('page.northward.app.queuePolicy.capacity'),
      help: $t('page.northward.app.queuePolicy.capacityHelp'),
      controlClass: 'w-full',
      componentProps: { min: 1 },
      rules: 'required',
      defaultValue: 1000,
    },
    {
      component: 'Select',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.selectWithName', {
          name: $t('page.northward.app.queuePolicy.dropPolicy.title'),
        }),
        options: [
          {
            label: $t('page.northward.app.queuePolicy.dropPolicy.discard'),
            value: DropPolicy.Discard,
          },
          {
            label: $t('page.northward.app.queuePolicy.dropPolicy.block'),
            value: DropPolicy.Block,
          },
        ],
      },
      fieldName: 'queuePolicy.dropPolicy',
      label: $t('page.northward.app.queuePolicy.dropPolicy.title'),
      rules: 'required',
      controlClass: 'w-full',
      defaultValue: DropPolicy.Discard,
    },
    {
      component: 'InputNumber',
      fieldName: 'queuePolicy.blockDuration',
      label: $t('page.northward.app.queuePolicy.blockDuration'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 5000,
      dependencies: {
        triggerFields: ['queuePolicy.dropPolicy'],
        if: (values) => {
          return values.queuePolicy?.dropPolicy === DropPolicy.Block;
        },
      },
    },
    {
      component: 'Divider',
      fieldName: 'bufferDivider',
      hideLabel: true,
      renderComponentContent() {
        return {
          default: () => $t('page.northward.app.queuePolicy.buffer.title'),
        };
      },
    },
    {
      component: 'Switch',
      fieldName: 'queuePolicy.bufferEnabled',
      label: $t('page.northward.app.queuePolicy.buffer.enabled'),
      defaultValue: true,
    },
    {
      component: 'InputNumber',
      fieldName: 'queuePolicy.bufferCapacity',
      label: $t('page.northward.app.queuePolicy.buffer.capacity'),
      help: $t('page.northward.app.queuePolicy.buffer.capacityHelp'),
      controlClass: 'w-full',
      componentProps: { min: 1 },
      rules: 'required',
      defaultValue: 8192,
      dependencies: {
        triggerFields: ['queuePolicy.bufferEnabled'],
        if: (values) => {
          return values.queuePolicy?.bufferEnabled === true;
        },
      },
    },
    {
      component: 'InputNumber',
      fieldName: 'queuePolicy.bufferExpireMs',
      label: $t('page.northward.app.queuePolicy.buffer.expireTime'),
      help: $t('ui.help.unitWithName', {
        unit: $t('ui.unit.milliseconds'),
      }),
      controlClass: 'w-full',
      componentProps: { min: 0 },
      rules: 'required',
      defaultValue: 300_000,
      dependencies: {
        triggerFields: ['queuePolicy.bufferEnabled'],
        if: (values) => {
          return values.queuePolicy?.bufferEnabled === true;
        },
      },
    },
  ];
}

export function useSubscriptionFormSchema(): FormSchema[] {
  return [
    {
      component: 'Switch',
      fieldName: 'allDevices',
      label: $t('page.northward.app.subscriptionForm.allDevices'),
      defaultValue: false,
      rules: 'required',
    },
    {
      component: 'InputNumber',
      fieldName: 'priority',
      label: $t('page.northward.app.subscriptionForm.priority'),
      controlClass: 'w-full',
      componentProps: { min: 0, max: 32_767 },
      defaultValue: 0,
      rules: z.number().min(0).max(32_767).default(0),
    },
    {
      component: 'TreeSelect',
      fieldName: 'deviceIds',
      label: $t('page.northward.app.subscriptionForm.devices'),
      defaultValue: [],
      controlClass: 'w-full',
      componentProps: {
        allowClear: true,
        showSearch: true,
        multiple: true,
        treeCheckable: true,
        class: 'w-full',
      },
      dependencies: {
        triggerFields: ['allDevices'],
        if: (values) => values.allDevices === false,
        rules: (values) => (values.allDevices ? null : 'required'),
      },
    },
  ];
}

// --- App log level override (TTL) ---

/** Log level options for app log level form. */
const APP_LOG_LEVEL_OPTIONS = [
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'TRACE', value: 'TRACE' },
] as const;

/**
 * Options for app log level form schema (TTL bounds).
 */
export interface AppLogLevelFormSchemaOptions {
  minSeconds: number;
  maxSeconds: number;
  defaultSeconds: number;
}

/**
 * Form schema for app log level modal: level (Select) + TTL (InputNumber).
 * Used with useVbenForm for setting temporary app log level override.
 */
export function useAppLogLevelFormSchema(
  opts: AppLogLevelFormSchemaOptions,
): FormSchema[] {
  const { minSeconds, maxSeconds, defaultSeconds } = opts;
  return [
    {
      component: 'Select',
      componentProps: {
        options: [...APP_LOG_LEVEL_OPTIONS],
        placeholder: $t('ui.placeholder.selectWithName', {
          name: $t('page.northward.app.logLevelModal.levelLabel'),
        }),
      },
      fieldName: 'level',
      label: $t('page.northward.app.logLevelModal.levelLabel'),
      rules: 'required',
      controlClass: 'w-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'ttlSeconds',
      label: $t('page.northward.app.logLevelModal.ttlSeconds'),
      help: $t('page.northward.app.logLevelModal.ttlRange', {
        min: minSeconds,
        max: maxSeconds,
        def: defaultSeconds,
      }),
      controlClass: 'w-full',
      componentProps: {
        min: minSeconds,
        max: maxSeconds,
        step: 10,
      },
      rules: 'required',
      defaultValue: defaultSeconds,
    },
  ];
}
