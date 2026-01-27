<script lang="ts" setup>
import type { Ref } from 'vue';

import type { ActionInfo, IdType, Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';

import { nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import { cloneDeep } from '@vben-core/shared/utils';

import { Card } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { getActionById } from '#/api/core/action';
import { fetchDriverSchemasById } from '#/api/core/driver';

import ActionParameterManager from './action-parameter-manager.vue';
import { useActionBasicFormSchema } from '../schemas/form';
import {
  mapActionSchemasToForm,
  sortDriverSchemas,
  type DriverSchemas,
} from '#/shared/dynamic-schema';

defineOptions({ name: 'ActionForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: ActionInfo];
}>();

const { handleRequest } = useRequestHandler();

type ActionParameter = ActionInfo['inputs'][number];

const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const deviceId = ref<IdType>(undefined);
const driverId = ref<IdType>(undefined);

const parameters = ref<ActionParameter[]>([]);
const parameterDriverSchemas: Ref<VbenFormSchema[]> = ref([]);

const [BasicForm, basicFormApi] = useVbenForm({
  handleSubmit: async (_values) => {},
  schema: useActionBasicFormSchema(),
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
});

const [ModalRoot, modalApi] = useVbenDrawer({
  class: 'w-1/2',
  destroyOnClose: true,
  showConfirmButton: true,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    const base = (await basicFormApi.validateAndSubmitForm()) as
      | Recordable<any>
      | undefined;
    if (!base) return;

    const payload = {
      ...base,
      deviceId: deviceId.value as IdType,
      inputs: cloneDeep(parameters.value),
    } as ActionInfo;

    emit('submit', type.value, recordId.value, payload);
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

  parameters.value = [];

  await basicFormApi.resetForm({ values: {} });
  await loadDriverSchema(driverId.value);

  if (type.value === FormOpenType.EDIT && recordId.value !== undefined) {
    await handleRequest(
      () => getActionById(recordId.value),
      async (action: ActionInfo) => {
        await basicFormApi.resetForm({
          values: {
            id: action.id,
            name: action.name,
            command: action.command,
          },
        });
        parameters.value = cloneDeep(action.inputs ?? []);
      },
    );
  }
}

async function loadDriverSchema(id: IdType) {
  parameterDriverSchemas.value = [];

  if (id === undefined || id === null) return;

  await handleRequest(
    () => fetchDriverSchemasById(id),
    async (schemas: DriverSchemas) => {
      const sorted = sortDriverSchemas(schemas);
      const formSchemas = mapActionSchemasToForm(sorted);
      parameterDriverSchemas.value = formSchemas as unknown as VbenFormSchema[];
    },
  );
}
</script>

<template>
  <ModalRoot>
    <div class="space-y-4 p-4">
      <Card size="small">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-4" icon="mdi:information-outline" />
            {{ $t('page.southward.action.basic') }}
          </div>
        </template>
        <BasicForm />
      </Card>

      <ActionParameterManager
        v-model:parameters="parameters"
        :driver-schemas="parameterDriverSchemas"
      />
    </div>
  </ModalRoot>
</template>

