<script setup lang="ts">
import type { IdType } from '@vben/types';

import type { RoleOption } from '#/api/core/role';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Select } from 'ant-design-vue';

import {
  assignUserRoles,
  fetchRoleOptions,
  fetchUserRoleIds,
} from '#/api/core/role';

const emit = defineEmits<{ saved: [] }>();
const options = ref<RoleOption[]>([]);
const selected = ref<number[]>([]);
const userId = ref<IdType>();
const loading = ref(false);
const loaded = ref(false);
let epoch = 0;
const [Modal, modal] = useVbenModal({
  title: $t('page.system.user.assignRole'),
  destroyOnClose: true,
  onOpenChange: async (open) => {
    const current = ++epoch;
    if (!open) return;
    userId.value = modal.getData<{ id: IdType }>().id;
    options.value = [];
    selected.value = [];
    loaded.value = false;
    modal.setState({ confirmDisabled: true });
    loading.value = true;
    try {
      const [roles, assigned] = await Promise.all([
        fetchRoleOptions(),
        fetchUserRoleIds(userId.value),
      ]);
      if (current !== epoch) return;
      options.value = roles.filter((role) => role.status === 0);
      selected.value = assigned;
      loaded.value = true;
      modal.setState({ confirmDisabled: false });
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
  onConfirm: async () => {
    if (loading.value || !loaded.value || userId.value === undefined) return;
    loading.value = true;
    modal.setState({ confirmLoading: true });
    const current = epoch;
    try {
      await assignUserRoles(userId.value, [...selected.value]);
      emit('saved');
      if (current === epoch) modal.close();
    } finally {
      if (current === epoch) {
        loading.value = false;
        modal.setState({ confirmLoading: false });
      }
    }
  },
});
</script>

<template>
  <Modal>
    <p class="mb-4 text-sm text-muted-foreground">
      {{ $t('authentication.roleChangeEffect') }}
    </p>
    <Select
      v-model:value="selected"
      class="w-full"
      mode="multiple"
      :loading="loading"
      :disabled="loading"
      :aria-label="$t('page.system.user.assignRole')"
      :options="options.map((role) => ({ label: role.name, value: role.id }))"
    />
  </Modal>
</template>
