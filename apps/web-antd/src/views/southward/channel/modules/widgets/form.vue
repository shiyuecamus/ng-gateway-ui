<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { ChannelInfo, DriverInfo, IdType, Recordable } from '@vben/types';

import type { CertificatePreview } from '#/api/core/certificate';
import type { DriverSchemas, Node } from '#/shared/dynamic-schema';

import { nextTick, ref } from 'vue';

import { confirm, useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CollectionType } from '@vben/types';

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
import { fetchAllDrivers, getChannelById } from '#/api/core';
import { previewCertificate } from '#/api/core/certificate';
import { fetchDriverSchemasById } from '#/api/core/driver';
import {
  mapChannelSchemasToForm,
  projectActiveDriverConfig,
  sortDriverSchemas,
} from '#/shared/dynamic-schema';

import {
  useChannelBasicFormSchema,
  useConnectPolicyFormSchema,
} from '../schemas';

defineOptions({ name: 'ChannelForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: Recordable<any>];
}>();
const driverNodes = ref<Node[]>([]);

const { handleRequest } = useRequestHandler();

const currentTab = ref(0);
const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const loading = ref(false);
const drivers = ref<DriverInfo[]>([]);
const opcuaSelected = ref(false);
const certificateInput = ref<HTMLInputElement | null>(null);
const lastCertificate = ref<CertificatePreview | null>(null);

// 初始化表单
const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: () => {
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
  handleSubmit: async () => {
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
      period:
        config.collectionType === CollectionType.Collection
          ? config.period
          : null,
      driverConfig: projectActiveDriverConfig(driverNodes.value, driverConfig),
    });
  },
  schema: [],
  commonConfig: {
    labelClass: 'text-[14px] shrink-0 break-normal',
    labelWidth: 110,
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
        connectPolicyFormApi.setValues({
          connectionPolicy: data.connectionPolicy,
        });
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

async function onDriverIdChange(selection: unknown) {
  const id =
    typeof selection === 'number' || typeof selection === 'string'
      ? selection
      : undefined;
  opcuaSelected.value =
    drivers.value
      .find((driver) => driver.id === id)
      ?.driverType?.startsWith('opcua') ?? false;
  lastCertificate.value = null;
  if (id === undefined || id === null) {
    driverNodes.value = [];
    driverFormApi.updateSchema([]);
    return;
  }
  await handleRequest(
    () => fetchDriverSchemasById(id as unknown as IdType),
    async (schemas: DriverSchemas) => {
      await nextTick();
      const sorted = sortDriverSchemas(schemas);
      driverNodes.value = sorted.channel;
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

async function onCertificateSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !opcuaSelected.value) return;
  try {
    const preview = await previewCertificate(file);
    if (!preview.validNow || preview.applicationUris.length === 0) {
      message.error($t('page.southward.channel.certificate.invalidIdentity'));
      return;
    }
    const values = await driverFormApi.getValues();
    const existing = values?.trustedServerCerts ?? [];
    if (
      !Array.isArray(existing) ||
      existing.some((pin) => typeof pin !== 'string')
    ) {
      message.error($t('page.southward.channel.certificate.invalidExisting'));
      return;
    }
    const approved = await confirm({
      title: $t('page.southward.channel.certificate.confirmTitle'),
      icon: 'warning',
      content: $t('page.southward.channel.certificate.confirmContent', {
        subject: preview.subject,
        fingerprint: preview.sha256Hex,
      }),
    }).then(
      () => true,
      () => false,
    );
    if (!approved) return;
    if (existing.includes(preview.derBase64)) {
      message.info($t('page.southward.channel.certificate.alreadyAdded'));
      return;
    }
    await driverFormApi.setValues({
      trustedServerCerts: [...existing, preview.derBase64],
    });
    lastCertificate.value = preview;
    message.success($t('page.southward.channel.certificate.added'));
  } catch {
    message.error($t('page.southward.channel.certificate.previewFailed'));
  }
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
          <div v-if="opcuaSelected" class="mb-4 space-y-3">
            <Alert
              type="info"
              show-icon
              :message="$t('page.southward.channel.certificate.instructions')"
            />
            <input
              ref="certificateInput"
              class="hidden"
              type="file"
              accept=".cer,.crt,.der,.pem,application/pkix-cert"
              @change="onCertificateSelected"
            />
            <Button @click="certificateInput?.click()">
              {{ $t('page.southward.channel.certificate.upload') }}
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
          <DriverForm />
        </Card>
      </div>
    </div>
  </Modal>
</template>

<style scoped></style>
