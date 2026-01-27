<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { AppInfo, IdType, PluginInfo, Recordable } from '@vben/types';

import type { DriverSchemas } from '#/shared/dynamic-schema';

import { nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { set } from '@vben-core/shared/utils';

import { Card, Select, Step, Steps, Tag } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchAllPlugins, getAppById } from '#/api/core';
import { fetchPluginSchemasById } from '#/api/core/plugin';
import {
  mapChannelSchemasToForm,
  sortDriverSchemas,
} from '#/shared/dynamic-schema';

import {
  useAppBasicFormSchema,
  useQueuePolicyFormSchema,
  useRetryPolicyFormSchema,
} from '../schemas';

defineOptions({ name: 'AppForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: Recordable<any>];
}>();

const { handleRequest } = useRequestHandler();

const currentTab = ref(0);
const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const loading = ref(false);
const plugins = ref<PluginInfo[]>([]);

// Step 1: Basic information form
const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: (_record: Recordable<any>) => {
    currentTab.value = 1;
  },
  schema: useAppBasicFormSchema([]),
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

// Step 2: Retry policy form
const [RetryPolicyForm, retryPolicyFormApi] = useVbenForm({
  handleSubmit: async (_record: Recordable<any>) => {
    currentTab.value = 2;
  },
  schema: useRetryPolicyFormSchema(),
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

// Step 3: Queue policy form
const [QueuePolicyForm, queuePolicyFormApi] = useVbenForm({
  handleSubmit: async (_record: Recordable<any>) => {
    currentTab.value = 3;
  },
  schema: useQueuePolicyFormSchema(),
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleReset: () => {
    currentTab.value = 1;
  },
  resetButtonOptions: {
    content: $t('common.previous'),
  },
  submitButtonOptions: {
    content: $t('common.next'),
  },
});

// Step 4: Plugin config form (dynamic)
const [PluginConfigForm, pluginConfigFormApi] = useVbenForm({
  handleSubmit: async (pluginConfig: Recordable<any>) => {
    const basic = await basicFormApi
      .merge(retryPolicyFormApi)
      .merge(queuePolicyFormApi)
      .submitAllForm(true);
    emit('submit', type.value, recordId.value, {
      ...basic,
      config: pluginConfig,
    });
  },
  schema: [],
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  handleReset: () => {
    currentTab.value = 2;
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
    () => fetchAllPlugins(),
    (data: PluginInfo[]) => {
      plugins.value = data;
      // Update basic form schema with plugin options
      const pluginOptions = data.map((v) => ({
        label: v.name,
        value: v.id,
      }));
      basicFormApi.setState({
        schema: useAppBasicFormSchema(pluginOptions),
      });
    },
  );

  if (t === FormOpenType.EDIT) {
    loading.value = true;
    await handleRequest(
      () => getAppById(recordId.value as IdType),
      async (data: AppInfo) => {
        await onPluginIdChange(data.pluginId, false);
        basicFormApi.setValues({
          name: data.name,
          pluginId: data.pluginId,
          description: data.description,
          status: data.status,
        });
        retryPolicyFormApi.setValues({
          retryPolicy: data.retryPolicy,
        });
        queuePolicyFormApi.setValues({
          queuePolicy: data.queuePolicy,
        });
        pluginConfigFormApi.setValues(data.config);
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

async function onPluginIdChange(id: any, _option?: any, resetForm = true) {
  if (id === undefined || id === null) {
    pluginConfigFormApi.updateSchema([]);
    return;
  }
  await handleRequest(
    () => fetchPluginSchemasById(id as unknown as IdType),
    async (schemas: DriverSchemas) => {
      await nextTick();
      const sorted = sortDriverSchemas(schemas);
      const formSchemas = mapChannelSchemasToForm(sorted);
      // Update dynamic schema first, then apply defaults
      pluginConfigFormApi.setState({ schema: formSchemas });
      if (resetForm) {
        const defaults: Record<string, any> = {};
        for (const item of formSchemas) {
          if (item && item.fieldName && item.defaultValue !== undefined) {
            set(defaults, item.fieldName, item.defaultValue);
          }
        }
        await pluginConfigFormApi.resetForm({ values: defaults });
      }
    },
  );
}
</script>

<template>
  <Modal>
    <Steps :current="currentTab" class="steps">
      <Step :title="$t('page.northward.app.form.step1')" />
      <Step :title="$t('page.northward.app.form.step2')" />
      <Step :title="$t('page.northward.app.form.step3')" />
      <Step :title="$t('page.northward.app.form.step4')" />
    </Steps>
    <div class="p-4">
      <Card v-show="currentTab === 0">
        <BasicForm>
          <template #pluginId="slotProps">
            <Select
              v-bind="slotProps"
              @change="onPluginIdChange"
              :allow-clear="true"
              :show-search="true"
              :filter-option="filterOption"
              :placeholder="
                $t('ui.placeholder.selectWithName', {
                  name: $t('page.northward.app.plugin'),
                })
              "
              :options="
                plugins.map((v) => ({
                  displayLabel: `${v.pluginType} ${v.version}`,
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
          <RetryPolicyForm />
        </Card>
      </div>

      <div v-show="currentTab === 2" class="space-y-4">
        <Card>
          <QueuePolicyForm />
        </Card>
      </div>

      <div v-show="currentTab === 3" class="space-y-4">
        <Card>
          <PluginConfigForm />
        </Card>
      </div>
    </div>
  </Modal>
</template>

<style scoped></style>

