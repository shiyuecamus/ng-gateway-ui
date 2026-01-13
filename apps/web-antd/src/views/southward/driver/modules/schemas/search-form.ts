import type { VbenFormSchema } from '@vben/common-ui';

import { $t } from '@vben/locales';
import { DriverSource, OsArch, OsType } from '@vben/types';

/**
 * Search form schema for user package list
 */
export const searchFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('page.southward.driver.name'),
    componentProps: {
      clearable: true,
    },
  },
  {
    component: 'Input',
    fieldName: 'driverType',
    label: $t('page.southward.driver.driverType'),
    componentProps: {
      clearable: true,
    },
  },
  {
    component: 'Select',
    componentProps: {
      clearable: true,
      options: [
        {
          label: $t('page.southward.driver.source.builtIn'),
          value: DriverSource.BuiltIn,
        },
        {
          label: $t('page.southward.driver.source.custom'),
          value: DriverSource.Custom,
        },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
    fieldName: 'source',
    label: $t('page.southward.driver.source.title'),
  },
  {
    component: 'Select',
    componentProps: {
      clearable: true,
      options: [
        {
          label: $t('page.southward.driver.osType.windows'),
          value: OsType.Windows,
        },
        {
          label: $t('page.southward.driver.osType.linux'),
          value: OsType.Linux,
        },
        {
          label: $t('page.southward.driver.osType.macos'),
          value: OsType.MacOS,
        },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
    fieldName: 'osType',
    label: $t('page.southward.driver.osType.title'),
  },
  {
    component: 'Select',
    componentProps: {
      clearable: true,
      options: [
        {
          label: $t('page.southward.driver.osArch.x86'),
          value: OsArch.x86,
        },
        {
          label: $t('page.southward.driver.osArch.arm64'),
          value: OsArch.arm64,
        },
        {
          label: $t('page.southward.driver.osArch.arm'),
          value: OsArch.arm,
        },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
    fieldName: 'osArch',
    label: $t('page.southward.driver.osArch.title'),
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
