<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { AppInfo, IdType, PluginInfo, Recordable } from '@vben/types';

import type { CertificatePreview } from '#/api/core/certificate';
import type { PluginConfigSchemas } from '#/shared/dynamic-schema';

import { nextTick, ref } from 'vue';

import { confirm, useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { set } from '@vben-core/shared/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  message,
  Select,
  Step,
  Steps,
  Tag,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchAllPlugins, getAppById } from '#/api/core';
import { previewCertificate } from '#/api/core/certificate';
import { fetchPluginSchemasById } from '#/api/core/plugin';
import {
  mapPluginConfigSchemasToForm,
  sortNodes,
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
const expectedRevision = ref<string | undefined>(undefined);
const loading = ref(false);
const plugins = ref<PluginInfo[]>([]);
const opcuaSelected = ref(false);
const certificateInput = ref<HTMLInputElement | null>(null);
const lastCertificate = ref<CertificatePreview | null>(null);

// Step 1: Basic information form
const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: () => {
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
  handleSubmit: async () => {
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
  handleSubmit: async () => {
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
      ...(type.value === FormOpenType.EDIT
        ? { expectedRevision: expectedRevision.value }
        : {}),
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
  class: 'w-[920px] max-w-[calc(100vw-2rem)]',
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
  expectedRevision.value = undefined;

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
        expectedRevision.value = data.desiredRevision;
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

async function onPluginIdChange(selection: unknown, resetForm = true) {
  const id =
    typeof selection === 'number' || typeof selection === 'string'
      ? selection
      : undefined;
  opcuaSelected.value =
    plugins.value.find((plugin) => plugin.id === id)?.pluginType ===
    'opcua-server';
  lastCertificate.value = null;
  if (id === undefined || id === null) {
    pluginConfigFormApi.updateSchema([]);
    return;
  }
  await handleRequest(
    () => fetchPluginSchemasById(id as unknown as IdType),
    async (schemas: PluginConfigSchemas) => {
      await nextTick();
      const sorted = sortNodes(schemas);
      const formSchemas = mapPluginConfigSchemasToForm(sorted);
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

async function onCertificateSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !opcuaSelected.value) return;
  try {
    const preview = await previewCertificate(file);
    if (!preview.validNow || preview.applicationUris.length === 0) {
      message.error($t('page.northward.app.certificate.invalidClientIdentity'));
      return;
    }
    const values = await pluginConfigFormApi.getValues();
    const existing = values?.trusted_client_certs ?? [];
    if (
      !Array.isArray(existing) ||
      existing.some((pin) => typeof pin !== 'string')
    ) {
      message.error($t('page.northward.app.certificate.invalidExisting'));
      return;
    }
    const approved = await confirm({
      title: $t('page.northward.app.certificate.confirmTitle'),
      icon: 'warning',
      content: $t('page.northward.app.certificate.confirmContent', {
        subject: preview.subject,
        fingerprint: preview.sha256Hex,
      }),
    }).then(
      () => true,
      () => false,
    );
    if (!approved) return;
    if (existing.includes(preview.derBase64)) {
      message.info($t('page.northward.app.certificate.alreadyAdded'));
      return;
    }
    await pluginConfigFormApi.setValues({
      trusted_client_certs: [...existing, preview.derBase64],
    });
    lastCertificate.value = preview;
    message.success($t('page.northward.app.certificate.added'));
  } catch {
    message.error($t('page.northward.app.certificate.previewFailed'));
  }
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
              @change="(id) => onPluginIdChange(id)"
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
          <div v-if="opcuaSelected" class="mb-4 space-y-3">
            <Alert
              type="info"
              show-icon
              :message="$t('page.northward.app.certificate.clientInstructions')"
            />
            <input
              ref="certificateInput"
              class="hidden"
              type="file"
              accept=".cer,.crt,.der,.pem,application/pkix-cert"
              @change="onCertificateSelected"
            />
            <Button @click="certificateInput?.click()">
              {{ $t('page.northward.app.certificate.uploadClient') }}
            </Button>
            <Descriptions
              v-if="lastCertificate"
              bordered
              :column="1"
              size="small"
            >
              <DescriptionsItem label="Subject">
                {{ lastCertificate.subject }}
              </DescriptionsItem>
              <DescriptionsItem label="ApplicationUri">
                {{ lastCertificate.applicationUris.join(', ') }}
              </DescriptionsItem>
              <DescriptionsItem label="SHA-256">
                <code class="break-all">{{ lastCertificate.sha256Hex }}</code>
              </DescriptionsItem>
            </Descriptions>
          </div>
          <PluginConfigForm />
        </Card>
      </div>
    </div>
  </Modal>
</template>

<style scoped></style>
