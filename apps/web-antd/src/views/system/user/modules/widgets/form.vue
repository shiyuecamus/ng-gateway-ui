<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { IdType } from '@vben/types';

import { ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createUser, getUserById, updateUser } from '#/api/core/user';

import { formSchema } from '../schemas';

const emit = defineEmits<{ saved: [] }>();
const mode = ref(FormOpenType.CREATE);
const recordId = ref<IdType>();
let epoch = 0;
const [Form, form] = useVbenForm({
  schema: formSchema,
  showDefaultActions: false,
  handleSubmit: async (values) => {
    const current = epoch;
    drawer.setState({ confirmLoading: true });
    try {
      await (mode.value === FormOpenType.CREATE
        ? createUser({
            username: String(values.username),
            password: String(values.password),
            nickname: String(values.nickname),
            phone: values.phone || undefined,
            email: values.email || undefined,
          })
        : updateUser({
            id: recordId.value,
            nickname: String(values.nickname),
            phone: values.phone || null,
            email: values.email || null,
          }));
      message.success($t('common.action.updateSuccess'));
      emit('saved');
      if (current === epoch) drawer.close();
    } finally {
      if (current === epoch) drawer.setState({ confirmLoading: false });
    }
  },
});
const [Drawer, drawer] = useVbenDrawer({
  class: 'w-full max-w-lg',
  destroyOnClose: true,
  onConfirm: async () => {
    await form.validateAndSubmitForm();
  },
  onOpenChange: async (open) => {
    const current = ++epoch;
    if (!open) return;
    const data = drawer.getData<FormOpenData>();
    mode.value = data.type;
    recordId.value = data.id;
    await form.resetForm();
    form.setState({
      schema: formSchema
        .filter(
          (item) =>
            mode.value === FormOpenType.CREATE || item.fieldName !== 'password',
        )
        .map((item) =>
          item.fieldName === 'username'
            ? {
                ...item,
                componentProps: {
                  ...item.componentProps,
                  disabled: mode.value !== FormOpenType.CREATE,
                },
              }
            : item,
        ),
    });
    if (mode.value === FormOpenType.EDIT) {
      drawer.setState({ loading: true });
      try {
        const user = await getUserById(data.id);
        if (current === epoch) await form.setValues(user);
      } finally {
        if (current === epoch) drawer.setState({ loading: false });
      }
    }
  },
});
</script>

<template>
  <Drawer><Form /></Drawer>
</template>
