<script lang="ts" setup>
import type { AiAlgorithmInfo } from '@vben/types';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { onMounted, ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteAiAlgorithm, fetchAiAlgorithms } from '#/api';

const algorithms = ref<AiAlgorithmInfo[]>([]);

const gridOptions: VxeGridProps<AiAlgorithmInfo> = {
  columns: [
    { title: $t('page.ai.algorithm.name'), field: 'name', minWidth: 160 },
    { title: $t('page.ai.algorithm.version'), field: 'version', width: 100 },
    { title: $t('page.ai.algorithm.moduleType'), field: 'moduleType', width: 120 },
    {
      title: $t('page.ai.algorithm.fileSize'),
      field: 'fileSize',
      width: 120,
      formatter: ({ cellValue }) =>
        cellValue ? `${(cellValue / 1024).toFixed(1)} KB` : '-',
    },
    { title: $t('page.ai.common.action'), width: 160, slots: { default: 'actions' } },
  ],
  height: 'auto',
  data: algorithms,
};

const [Grid] = useVbenVxeGrid({ gridOptions });

async function loadData() {
  algorithms.value = await fetchAiAlgorithms();
}

async function handleDelete(row: AiAlgorithmInfo) {
  await confirm({ content: $t('page.ai.algorithm.messages.deleteConfirm', { name: row.name }) });
  await deleteAiAlgorithm(row.id);
  message.success($t('page.ai.algorithm.messages.deleteSuccess', { name: row.name }));
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('page.ai.algorithm.title')">
      <template #actions="{ row }">
        <Button type="link" size="small" danger @click="handleDelete(row)">
          {{ $t('common.delete') }}
        </Button>
      </template>
    </Grid>
  </Page>
</template>
