<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { ChannelInfo, DriverInfo, IdType, Recordable } from '@vben/types';

import type { DriverSchemas } from '#/shared/dynamic-schema';

import { nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { set } from '@vben-core/shared/utils';

import { Card, Select, Step, Steps, Tag } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchAllDrivers, getChannelById } from '#/api/core';
import { fetchDriverSchemasById } from '#/api/core/driver';
import {
  mapChannelSchemasToForm,
  sortDriverSchemas,
} from '#/shared/dynamic-schema';

import { useChannelBasicFormSchema, useConnectPolicyFormSchema } from '../schemas';

defineOptions({ name: 'ChannelForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: Recordable<any>];
}>();

const { handleRequest } = useRequestHandler();

const currentTab = ref(0);
const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const loading = ref(false);
const drivers = ref<DriverInfo[]>([]);

// 初始化表单
const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: (_record: Recordable<any>) => {
    currentTab.value = 1;
    // modalApi.close();
  },
  schema: useChannelBasicFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
  resetButtonOptions: {
    show: false,
  },
});

// Step 2 connect policy form
const [ConnectPolicyForm, connectPolicyFormApi] = useVbenForm({
  handleSubmit: async (_record: Recordable<any>) => {
    currentTab.value = 2;
  },
  schema: useConnectPolicyFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleReset: () => {
    currentTab.value = 0;
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
});

// Step 3 dynamic driver form
const [DriverForm, driverFormApi] = useVbenForm({
  handleSubmit: async (driverConfig: Recordable<any>) => {
    const config = await basicFormApi
      .merge(connectPolicyFormApi)
      .submitAllForm(true);
    emit('submit', type.value, recordId.value, {
      ...config,
      driverConfig,
    });
  },
  schema: [],
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleReset: () => {
    currentTab.value = 1;
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  wrapperClass: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-2',
});

const [Modal, modalApi] = useVbenDrawer({
  class: 'w-1/2',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    // modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

async function init() {
  const { type: t, id: i } = modalApi.getData<FormOpenData>();
  type.value = t;
  recordId.value = i;

  await handleRequest(
    () => fetchAllDrivers(),
    (data: DriverInfo[]) => {
      drivers.value = data;
    },
  );

  if (t === FormOpenType.EDIT) {
    loading.value = true;
    await handleRequest(
      () => getChannelById(recordId.value as IdType),
      async (data: ChannelInfo) => {
        await onDriverIdChange(data.driverId);
        basicFormApi.setValues(data);
        // The connect policy form schema uses nested field names like:
        // `connectionPolicy.backoff.maxAttempts`, so we must wrap values.
        connectPolicyFormApi.setValues({ connectionPolicy: data.connectionPolicy });
        driverFormApi.setValues(data.driverConfig);
        loading.value = false;
      },
      (error) => {
        loading.value = false;
        console.error(error);
      },
    );
  }
}

function filterOption(
  input: string,
  option: undefined | { label?: string },
): boolean {
  return option?.label?.toLowerCase().includes(input.toLowerCase()) ?? false;
}

async function onDriverIdChange(id: any, _option?: any) {
  if (id === undefined || id === null) {
    driverFormApi.updateSchema([]);
    return;
  }
  await handleRequest(
    () => fetchDriverSchemasById(id as unknown as IdType),
    async (schemas: DriverSchemas) => {
      await nextTick();
      const sorted = sortDriverSchemas(schemas);
      const formSchemas = mapChannelSchemasToForm(sorted);
      // Update dynamic schema first, then apply defaults
      driverFormApi.setState({ schema: formSchemas });
      const defaults: Record<string, any> = {};
      for (const item of formSchemas) {
        if (item && item.fieldName && item.defaultValue !== undefined) {
          set(defaults, item.fieldName, item.defaultValue);
        }
      }
      await driverFormApi.resetForm({ values: defaults });
    },
  );
}
</script>

<template>
  <Modal>
    <Steps :current="currentTab" class="steps">
      <Step :title="$t('page.southward.form.step1')" />
      <Step :title="$t('page.southward.form.step2')" />
      <Step :title="$t('page.southward.form.step3')" />
    </Steps>
    <div class="p-4">
      <Card v-show="currentTab === 0">
        <BasicForm>
          <template #driverId="slotProps">
            <Select
              v-bind="slotProps"
              @change="onDriverIdChange"
              :allow-clear="true"
              :show-search="true"
              :filter-option="filterOption"
              :placeholder="
                $t('ui.placeholder.selectWithName', {
                  name: $t('page.southward.channel.driver'),
                })
              "
              :options="
                drivers.map((v) => ({
                  displayLabel: `${v.name} ${v.version}`,
                  label: v.name,
                  value: v.id,
                  version: v.version,
                }))
              "
              option-label-prop="displayLabel"
            >
              <template #option="item">
                <div class="flex items-center justify-between">
                  <span>{{ item.label }}</span>
                  <Tag color="lime">{{ item.version }}</Tag>
                </div>
              </template>
            </Select>
          </template>
        </BasicForm>
      </Card>

      <div v-show="currentTab === 1" class="space-y-4">
        <Card>
          <ConnectPolicyForm />
        </Card>
      </div>

      <div v-show="currentTab === 2" class="space-y-4">
        <Card>
          <DriverForm />
        </Card>
      </div>
    </div>
  </Modal>
</template>

<style scoped></style>

