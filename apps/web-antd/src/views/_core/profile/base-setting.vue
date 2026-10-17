<script setup lang="ts">
import type { UserInfo } from '@vben/types';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Space,
  Spin,
  Tag,
} from 'ant-design-vue';

import { getUserInfoApi } from '#/api/core/user';

const account = ref<null | UserInfo>(null);
const loading = ref(false);
const error = ref('');
let generation = 0;
/** Only server-owned account and role facts are shown; no placeholder save action exists. */
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const result = await getUserInfoApi();
    if (current === generation) account.value = result;
  } catch (error_) {
    if (current === generation)
      error.value =
        error_ instanceof Error
          ? error_.message
          : $t('page.system.user.profileLoadFailed');
  } finally {
    if (current === generation) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  generation += 1;
});
</script>

<template>
  <Card :title="$t('page.auth.profile')">
    <template #extra>
      <Button :loading="loading" @click="load">
        {{ $t('common.refresh') }}
      </Button>
    </template>
    <Space direction="vertical" :size="16" class="w-full">
      <Alert
        type="info"
        show-icon
        :message="$t('page.system.user.profileReadonly')"
      />
      <Alert v-if="error" type="error" show-icon :message="error" />
      <Spin :spinning="loading">
        <Descriptions v-if="account" bordered :column="{ xs: 1, md: 2 }">
          <DescriptionsItem
            v-for="field in ['username', 'nickname', 'email', 'phone'] as const"
            :key="field"
            :label="$t(`page.system.user.${field}`)"
          >
            {{ account[field] || '—' }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('entity.role')">
            <Space :size="8" wrap>
              <Tag v-for="role in account.roles" :key="role.id" class="!m-0">
                {{ role.code }}
              </Tag>
            </Space>
          </DescriptionsItem>
        </Descriptions>
      </Spin>
    </Space>
  </Card>
</template>
