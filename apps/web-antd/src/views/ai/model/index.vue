<script lang="ts" setup>
import type { AiModelInfo } from '@vben/types';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { onMounted, ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteAiModel, fetchAiModels, loadAiModel, unloadAiModel } from '#/api';

const models = ref<AiModelInfo[]>([]);

const gridOptions: VxeGridProps<AiModelInfo> = {
  columns: [
    { title: $t('page.ai.model.name'), field: 'name', minWidth: 140 },
    { title: $t('page.ai.model.version'), field: 'version', width: 100 },
    { title: $t('page.ai.model.task'), field: 'task', width: 120 },
    { title: $t('page.ai.model.fileSize'), field: 'fileSize', width: 120, formatter: ({ cellValue }) => cellValue ? `${(cellValue / 1024 / 1024).toFixed(1)} MB` : '-' },
    { title: $t('page.ai.model.loaded'), field: 'loaded', width: 80, slots: { default: 'loaded' } },
    { title: $t('page.ai.common.action'), width: 200, slots: { default: 'actions' } },
  ],
  height: 'auto',
  data: models,
};

const [Grid] = useVbenVxeGrid({ gridOptions });

async function loadData() {
  models.value = await fetchAiModels();
}

async function handleLoad(model: AiModelInfo) {
  await loadAiModel(model.id);
  message.success($t('page.ai.model.messages.loadSuccess', { name: model.name }));
  await loadData();
}

async function handleUnload(model: AiModelInfo) {
  await unloadAiModel(model.id);
  message.success($t('page.ai.model.messages.unloadSuccess', { name: model.name }));
  await loadData();
}

async function handleDelete(model: AiModelInfo) {
  await confirm({
    content: $t('page.ai.model.messages.deleteConfirm', { name: model.name }),
  });
  await deleteAiModel(model.id);
  message.success($t('page.ai.model.messages.deleteSuccess', { name: model.name }));
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('page.ai.model.title')">
      <template #loaded="{ row }">
        <Tag :color="row.loaded ? 'green' : 'default'">{{ row.loaded ? $t('page.ai.common.yes') : $t('page.ai.common.no') }}</Tag>
      </template>
      <template #actions="{ row }">
        <Button v-if="!row.loaded" type="link" size="small" @click="handleLoad(row)">{{ $t('page.ai.model.actions.load') }}</Button>
        <Button v-if="row.loaded" type="link" size="small" @click="handleUnload(row)">{{ $t('page.ai.model.actions.unload') }}</Button>
        <Button type="link" size="small" danger @click="handleDelete(row)">{{ $t('common.delete') }}</Button>
      </template>
    </Grid>
  </Page>
</template>
