<script lang="ts" setup>
import type { IdType, PointInfo, Recordable } from '@vben/types';

import { nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';

import { set } from '@vben-core/shared/utils';

import { Card } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchDriverSchemasById } from '#/api/core/driver';
import { getPointById } from '#/api/core/point';

import {
  mapPointSchemasToForm,
  sortDriverSchemas,
  type DriverSchemas,
} from '#/shared/dynamic-schema';
import { usePointBasicFormSchema } from './schemas/form';

defineOptions({ name: 'PointForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: PointInfo];
}>();

const { handleRequest } = useRequestHandler();

const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const deviceId = ref<IdType>(undefined);
const driverId = ref<IdType>(undefined);
const hasDriverSchema = ref(false);

const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: async (_values) => {},
  schema: usePointBasicFormSchema(),
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
});

const [DriverForm, driverFormApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  wrapperClass: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-2',
});

const [Modal, modalApi] = useVbenDrawer({
  class: 'w-1/2',
  destroyOnClose: true,
  showConfirmButton: true,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    const base = await basicFormApi.validateAndSubmitForm();
    const driverConfig = await driverFormApi.validateAndSubmitForm();
    emit('submit', type.value, recordId.value, {
      deviceId: deviceId.value as IdType,
      ...base,
      driverConfig: driverConfig as Recordable<any>,
    } as PointInfo);
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

async function init() {
  const data = modalApi.getData<{
    deviceId: IdType;
    driverId: IdType;
    id?: IdType;
    type: FormOpenType;
  }>();

  type.value = data.type;
  recordId.value = data.id;
  deviceId.value = data.deviceId;
  driverId.value = data.driverId;

  await basicFormApi.resetForm();
  await driverFormApi.resetForm();
  await loadDriverSchema(driverId.value);

  if (type.value === FormOpenType.EDIT && recordId.value !== undefined) {
    await handleRequest(
      () => getPointById(recordId.value),
      async (point: PointInfo) => {
        await basicFormApi.setValues({
          id: point.id,
          name: point.name,
          key: point.key,
          type: point.type,
          dataType: point.dataType,
          accessMode: point.accessMode,
          unit: point.unit,
          minValue: point.minValue,
          maxValue: point.maxValue,
          transformDataType: point.transformDataType,
          transformScale: point.transformScale,
          transformOffset: point.transformOffset,
          transformNegate: point.transformNegate,
        });
        await driverFormApi.setValues(point.driverConfig as Recordable<any>);
      },
    );
  }
}

async function loadDriverSchema(id: IdType) {
  hasDriverSchema.value = false;
  driverFormApi.setState({ schema: [] });
  await nextTick();
  await driverFormApi.resetForm();

  if (id === undefined || id === null) return;

  await handleRequest(
    () => fetchDriverSchemasById(id),
    async (schemas: DriverSchemas) => {
      const sorted = sortDriverSchemas(schemas);
      const formSchemas = mapPointSchemasToForm(sorted);
      hasDriverSchema.value = formSchemas.length > 0;
      driverFormApi.setState({ schema: formSchemas });
      if (formSchemas.length === 0) return;
      const defaults: Record<string, any> = {};
      for (const item of formSchemas) {
        if (item && item.fieldName && item.defaultValue !== undefined) {
          set(defaults, item.fieldName, item.defaultValue);
        }
      }
      await driverFormApi.setValues(defaults);
    },
  );
}
</script>

<template>
  <Modal>
    <div class="space-y-4 p-4">
      <Card size="small">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-4" icon="mdi:information-outline" />
            {{ $t('page.southward.point.basic') }}
          </div>
        </template>
        <BasicForm />
      </Card>
      <Card v-show="hasDriverSchema" size="small">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-4" icon="mdi:cog-outline" />
            {{ $t('page.southward.point.driver') }}
          </div>
        </template>
        <DriverForm />
      </Card>
    </div>
  </Modal>
</template>
