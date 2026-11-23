<script setup lang="ts">
import { RotateCw } from '@vben/icons';

import { Button, Pagination, Select } from 'ant-design-vue';

import { quotaText } from './presentation';

defineProps<{
  id: string;
  kind: 'apps' | 'channels';
  listPending: boolean;
  options: { label: string; value: string }[];
  pageSize: number;
  samplePending: boolean;
  selected?: string;
  total: number;
}>();

defineEmits<{
  choose: [value: unknown];
  refresh: [];
  search: [name: string];
}>();

const page = defineModel<number>('page', { required: true });
</script>

<template>
  <label :for="id" class="mb-1.5 block text-sm font-medium">
    {{ quotaText(`${kind}.selectLabel`) }}
  </label>
  <div class="flex flex-wrap items-center gap-2">
    <Select
      :id="id"
      :value="selected"
      :options="options"
      :loading="listPending"
      :placeholder="quotaText(`${kind}.placeholder`)"
      :filter-option="false"
      :not-found-content="quotaText(`${kind}.noMatches`)"
      show-search
      allow-clear
      class="min-w-0 flex-1 basis-56 sm:max-w-sm"
      @change="$emit('choose', $event)"
      @search="$emit('search', $event)"
    />
    <Button :loading="listPending || samplePending" @click="$emit('refresh')">
      <template #icon><RotateCw :size="14" aria-hidden="true" /></template>
      {{ quotaText('refresh') }}
    </Button>
  </div>
  <div
    v-if="total > pageSize"
    :aria-label="quotaText(`${kind}.results`)"
    class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
  >
    <span class="text-xs text-muted-foreground">
      {{ quotaText(`${kind}.resultCount`, { count: total }) }}
    </span>
    <Pagination
      v-model:current="page"
      :total="total"
      :page-size="pageSize"
      :show-size-changer="false"
      size="small"
    />
  </div>
</template>
