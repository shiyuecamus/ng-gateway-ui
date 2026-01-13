import type { VbenFormSchema } from '@vben/common-ui';
import type { IdType } from '@vben/types';

import { $t } from '@vben/locales';
import { CommonStatus } from '@vben/types';

/**
 * Select option definition used for plugin filters.
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
 * Build search form schema for northward app listing.
 * @param pluginOptions - Reactive plugin options shared by the caller.
 */
export function createSearchFormSchema(
  pluginOptions: PluginSelectOption[],
): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.northward.app.name'),
      componentProps: {
        clearable: true,
      },
    },
    {
      component: 'Select',
      fieldName: 'pluginId',
      label: $t('page.northward.app.plugin'),
      componentProps: {
        allowClear: true,
        options: pluginOptions,
        placeholder: $t('ui.placeholder.select'),
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: $t('common.status.title'),
      componentProps: {
        allowClear: true,
        options: [
          {
            label: $t('common.status.enabled'),
            value: CommonStatus.ENABLED,
          },
          {
            label: $t('common.status.disabled'),
            value: CommonStatus.DISABLED,
          },
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
}
