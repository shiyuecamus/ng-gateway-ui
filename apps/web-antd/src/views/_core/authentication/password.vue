<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, message } from 'ant-design-vue';

import { useVbenForm, z } from '#/adapter/form';
import { changePasswordApi } from '#/api/core/auth';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

const auth = useAuthStore();
const router = useRouter();
const saving = ref(false);
const description = computed(() =>
  $t(
    auth.mustChangePassword
      ? 'authentication.bootstrapDescription'
      : 'authentication.passwordChangeDescription',
  ),
);
const [Form, form] = useVbenForm({
  schema: [
    {
      component: 'InputPassword',
      fieldName: 'oldPassword',
      label: $t('authentication.oldPassword'),
      componentProps: { autocomplete: 'current-password' },
      rules: z.string().min(1),
    },
    {
      component: 'InputPassword',
      fieldName: 'newPassword',
      label: $t('authentication.newPassword'),
      componentProps: { autocomplete: 'new-password' },
      rules: z.string().refine(
        (value) => {
          const length = new TextEncoder().encode(value).length;
          return [...value].length >= 15 && length <= 72;
        },
        { message: $t('authentication.passwordLengthRule') },
      ),
    },
    {
      component: 'InputPassword',
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
      componentProps: { autocomplete: 'new-password' },
      dependencies: {
        triggerFields: ['newPassword'],
        rules: (values) =>
          z.string().refine((value) => value === values.newPassword, {
            message: $t('authentication.confirmPasswordTip'),
          }),
      },
    },
  ],
  showDefaultActions: true,
  submitButtonOptions: {
    content: $t('authentication.savePassword'),
    loading: false,
  },
  resetButtonOptions: { show: false },
  handleSubmit: async (values) => {
    if (saving.value) return;
    saving.value = true;
    form.setState({ submitButtonOptions: { loading: true } });
    try {
      await changePasswordApi(
        String(values.oldPassword),
        String(values.newPassword),
      );
      await form.resetForm();
      await auth.clearSession(false);
      message.success($t('authentication.passwordChanged'));
    } finally {
      saving.value = false;
      form.setState({ submitButtonOptions: { loading: false } });
    }
  },
});
</script>

<template>
  <section class="w-full space-y-5" :aria-busy="saving">
    <h1 class="text-2xl font-semibold">
      {{ $t('authentication.changePasswordTitle') }}
    </h1>
    <p class="text-muted-foreground">{{ description }}</p>
    <Form />
    <Button
      v-if="!auth.mustChangePassword"
      type="link"
      :disabled="saving"
      @click="router.back()"
    >
      {{ $t('common.back') }}
    </Button>
    <Button v-else type="link" :disabled="saving" @click="auth.logout(false)">
      {{ $t('common.logout') }}
    </Button>
  </section>
</template>
