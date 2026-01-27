<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { IdType, Recordable } from '@vben/types';

import { nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';

import { useVbenForm } from '#/adapter/form';
import { getUserById } from '#/api/core';

import { formSchema } from '../schemas';

defineOptions({ name: 'UserForm' });

const emit = defineEmits<{
  submit: [type: FormOpenType, id: IdType, values: Recordable<any>];
}>();

const { handleRequest } = useRequestHandler();

const type = ref(FormOpenType.CREATE);
const recordId = ref<IdType>(undefined);
const loading = ref(false);

// 初始化表单
const [Form, formApi] = useVbenForm({
  handleSubmit: (record: Recordable<any>) => {
    emit('submit', type.value, recordId.value, record);
    modalApi.close();
  },
  schema: formSchema,
  commonConfig: {
    labelClass: 'text-[14px] w-1/6',
  },
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenDrawer({
  class: 'w-1/2',
  destroyOnClose: true,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    await formApi.validateAndSubmitForm();
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

  if (t === FormOpenType.EDIT) {
    await formApi.removeSchemaByFields(['password']);
    loading.value = true;
    await handleRequest(
      () => getUserById(recordId.value as IdType),
      (data) => {
        formApi.setValues(data);
        loading.value = false;
      },
      (error) => {
        loading.value = false;
        console.error(error);
      },
    );
  }
}
</script>

<template>
  <Modal>
    <Form />
  </Modal>
</template>

<style scoped></style>

