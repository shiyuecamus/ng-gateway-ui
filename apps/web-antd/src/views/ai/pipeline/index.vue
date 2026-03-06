<script lang="ts" setup>
import type { AiPipelineSummary } from '@vben/types';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { onMounted, ref } from 'vue';

import { confirm, Page, useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { $t } from '@vben/locales';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteAiPipeline, fetchAiPipelines, validateAiPipeline } from '#/api';

import PipelineEditorForm from './modules/widgets/form.vue';

defineOptions({ name: 'AiPipelinePage' });

type PipelineRow = AiPipelineSummary & {
  id: string;
  name: string;
  stageCount: number;
  ruleCount: number;
};

const pipelines = ref<PipelineRow[]>([]);

const gridOptions: VxeGridProps<PipelineRow> = {
  columns: [
    { title: $t('page.ai.pipeline.id'), field: 'id', width: 140 },
    { title: $t('page.ai.pipeline.name'), field: 'name', minWidth: 160 },
    { title: $t('page.ai.pipeline.channelId'), field: 'channelId', width: 100 },
    {
      title: $t('page.ai.pipeline.stageCount'),
      field: 'stageCount',
      width: 100,
      slots: { default: 'stageCount' },
    },
    {
      title: $t('page.ai.pipeline.ruleCount'),
      field: 'ruleCount',
      width: 100,
      slots: { default: 'ruleCount' },
    },
    {
      title: $t('page.ai.common.action'),
      width: 240,
      slots: { default: 'actions' },
    },
  ],
  height: 'auto',
  data: pipelines,
  toolbarConfig: {
    custom: true,
    refresh: false,
  },
};

const [Grid] = useVbenVxeGrid({ gridOptions });

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: PipelineEditorForm,
});

async function loadData() {
  const raw = await fetchAiPipelines();
  pipelines.value = (raw ?? []).map(
    (p): PipelineRow => ({
      ...p,
      id: p.config.id,
      name: p.config.name,
      stageCount: p.config.stages?.length ?? 0,
      ruleCount: p.config.alarmRules?.length ?? 0,
    }),
  );
}

function handleCreate() {
  formDrawerApi
    .setData({ type: FormOpenType.CREATE })
    .setState({
      title: $t('page.ai.pipeline.actions.create'),
    })
    .open();
}

function handleEdit(row: PipelineRow) {
  formDrawerApi
    .setData({ type: FormOpenType.EDIT, channelId: row.channelId })
    .setState({
      title: `${$t('page.ai.pipeline.editor.updateTitle')} — ${row.name}`,
    })
    .open();
}

async function handleValidate(row: PipelineRow) {
  try {
    const report = await validateAiPipeline(row.channelId);
    if (report.valid) {
      message.success($t('page.ai.pipeline.validation.pass'));
    } else {
      message.error(
        report.errors.length > 0
          ? report.errors.join('; ')
          : $t('page.ai.pipeline.validation.fail'),
      );
    }
  } catch {
    message.error($t('page.ai.pipeline.validation.fail'));
  }
}

async function handleDelete(row: PipelineRow) {
  await confirm({
    content: $t('page.ai.pipeline.messages.deleteConfirm', {
      name: row.name,
      channelId: row.channelId,
    }),
  });
  await deleteAiPipeline(row.channelId);
  message.success(
    $t('page.ai.pipeline.messages.deleteSuccess', { name: row.name }),
  );
  await loadData();
}

async function onFormSaved() {
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('page.ai.pipeline.title')">
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleCreate">
          {{ $t('page.ai.pipeline.actions.create') }}
        </Button>
        <Button @click="loadData">
          {{ $t('common.refresh') }}
        </Button>
      </template>
      <template #stageCount="{ row }">
        <Tag color="blue">{{ row.stageCount }}</Tag>
      </template>
      <template #ruleCount="{ row }">
        <Tag :color="row.ruleCount > 0 ? 'orange' : 'default'">{{ row.ruleCount }}</Tag>
      </template>
      <template #actions="{ row }">
        <Button type="link" size="small" @click="handleEdit(row)">
          {{ $t('common.edit') }}
        </Button>
        <Button type="link" size="small" @click="handleValidate(row)">
          {{ $t('page.ai.pipeline.actions.validate') }}
        </Button>
        <Button type="link" size="small" danger @click="handleDelete(row)">
          {{ $t('common.delete') }}
        </Button>
      </template>
    </Grid>
    <FormDrawer @saved="onFormSaved" />
  </Page>
</template>
