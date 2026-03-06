<script lang="ts" setup>
import type { AiAlarmEventInfo } from '@vben/types';
import type { VbenFormProps } from '@vben/common-ui';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Button,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Image,
  message,
  Space,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { changeAlarmEventStatus, fetchAlarmEventDetail, fetchAlarmEventPage } from '#/api';

defineOptions({ name: 'AiAlarmPage' });

const severityColor: Record<string, string> = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
};

const statusColor: Record<string, string> = {
  open: 'red',
  acked: 'blue',
  closed: 'default',
};

const searchFormSchema: VbenFormProps['schema'] = [
  {
    component: 'InputNumber',
    fieldName: 'channelId',
    label: $t('page.ai.alarm.channelId'),
    componentProps: {
      min: 1,
      placeholder: $t('ui.placeholder.input'),
      style: { width: '100%' },
    },
  },
  {
    component: 'Select',
    fieldName: 'severity',
    label: $t('page.ai.alarm.severity'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Critical', value: 'critical' },
        { label: 'Warning', value: 'warning' },
        { label: 'Info', value: 'info' },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
  },
  {
    component: 'Select',
    fieldName: 'status',
    label: $t('page.ai.alarm.status'),
    componentProps: {
      clearable: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Acked', value: 'acked' },
        { label: 'Closed', value: 'closed' },
      ],
      placeholder: $t('ui.placeholder.select'),
    },
  },
];

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AiAlarmEventInfo> = {
  columns: [
    { title: $t('page.ai.alarm.id'), field: 'id', width: 70 },
    { title: $t('page.ai.alarm.channelId'), field: 'channelId', width: 90 },
    { title: $t('page.ai.alarm.alarmType'), field: 'alarmType', width: 130 },
    {
      title: $t('page.ai.alarm.severity'),
      field: 'severity',
      width: 100,
      slots: { default: 'severity' },
    },
    {
      title: $t('page.ai.alarm.description'),
      field: 'description',
      minWidth: 200,
    },
    {
      title: $t('page.ai.alarm.status'),
      field: 'status',
      width: 100,
      slots: { default: 'status' },
    },
    {
      title: $t('common.baseInfo.createdAt'),
      field: 'createdAt',
      width: 170,
      formatter: 'formatDateTime',
    },
    {
      title: $t('common.actions'),
      width: 200,
      slots: { default: 'actions' },
    },
  ],
  height: 'auto',
  proxyConfig: {
    autoLoad: true,
    response: {
      result: 'records',
      total: 'total',
      list: 'records',
    },
    ajax: {
      query: async ({ page }, formValues) => {
        return await fetchAlarmEventPage({
          page: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  pagerConfig: { pageSize: 20 },
  toolbarConfig: {
    custom: true,
    refresh: true,
  },
};

type AlarmGridApi = {
  reload: () => Promise<unknown>;
};

const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (options: any) => readonly [any, AlarmGridApi]
)({
  formOptions,
  gridOptions,
});

// Detail drawer
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailRecord = ref<AiAlarmEventInfo | null>(null);

async function handleDetail(row: AiAlarmEventInfo) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detailRecord.value = await fetchAlarmEventDetail(row.id);
  } catch {
    detailRecord.value = row;
  } finally {
    detailLoading.value = false;
  }
}

async function handleAck(row: AiAlarmEventInfo) {
  await changeAlarmEventStatus({ id: row.id, status: 'acked' });
  message.success($t('page.ai.alarm.messages.ackSuccess'));
  gridApi.reload();
  if (detailRecord.value?.id === row.id) {
    detailRecord.value = { ...detailRecord.value, status: 'acked' };
  }
}

async function handleClose(row: AiAlarmEventInfo) {
  await changeAlarmEventStatus({ id: row.id, status: 'closed' });
  message.success($t('page.ai.alarm.messages.closeSuccess'));
  gridApi.reload();
  if (detailRecord.value?.id === row.id) {
    detailRecord.value = { ...detailRecord.value, status: 'closed' };
  }
}

function getSnapshotUrl(row: AiAlarmEventInfo): string | null {
  const payload = row.payload;
  if (typeof payload === 'object' && payload?.snapshot_url) {
    return payload.snapshot_url as string;
  }
  return null;
}
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('page.ai.alarm.title')">
      <template #severity="{ row }">
        <Tag :color="severityColor[row.severity] ?? 'default'">
          {{ row.severity }}
        </Tag>
      </template>
      <template #status="{ row }">
        <Tag :color="statusColor[row.status] ?? 'default'">
          {{ row.status }}
        </Tag>
      </template>
      <template #actions="{ row }">
        <Space>
          <Button type="link" size="small" @click="handleDetail(row)">
            Detail
          </Button>
          <Button
            v-if="row.status === 'open'"
            type="link"
            size="small"
            @click="handleAck(row)"
          >
            {{ $t('page.ai.alarm.actions.ack') }}
          </Button>
          <Button
            v-if="row.status !== 'closed'"
            type="link"
            size="small"
            danger
            @click="handleClose(row)"
          >
            {{ $t('page.ai.alarm.actions.close') }}
          </Button>
        </Space>
      </template>
    </Grid>

    <!-- Detail drawer -->
    <Drawer
      v-model:open="detailVisible"
      :title="`Alarm #${detailRecord?.id ?? ''}`"
      :width="560"
      placement="right"
      :destroy-on-close="true"
    >
      <template v-if="detailRecord">
        <Descriptions :column="2" bordered size="small">
          <DescriptionsItem :label="$t('page.ai.alarm.id')">
            {{ detailRecord.id }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.channelId')">
            {{ detailRecord.channelId }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.alarmType')">
            {{ detailRecord.alarmType }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.severity')">
            <Tag :color="severityColor[detailRecord.severity] ?? 'default'">
              {{ detailRecord.severity }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.status')" :span="2">
            <Tag :color="statusColor[detailRecord.status] ?? 'default'">
              {{ detailRecord.status }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.description')" :span="2">
            {{ detailRecord.description }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('common.baseInfo.createdAt')">
            {{ detailRecord.createdAt }}
          </DescriptionsItem>
          <DescriptionsItem label="Acked At">
            {{ detailRecord.ackedAt ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="Closed At" :span="2">
            {{ detailRecord.closedAt ?? '—' }}
          </DescriptionsItem>
        </Descriptions>

        <!-- Snapshot -->
        <div v-if="getSnapshotUrl(detailRecord)" class="mt-4">
          <div class="mb-2 text-sm font-medium text-gray-600">Snapshot</div>
          <Image
            :src="getSnapshotUrl(detailRecord)!"
            :preview="true"
            style="max-width: 100%; border-radius: 8px"
          />
        </div>

        <!-- Payload (raw JSON) -->
        <div v-if="detailRecord.payload" class="mt-4">
          <div class="mb-2 text-sm font-medium text-gray-600">Payload</div>
          <pre class="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs">{{ JSON.stringify(detailRecord.payload, null, 2) }}</pre>
        </div>

        <!-- Actions -->
        <div class="mt-4 flex gap-2">
          <Button
            v-if="detailRecord.status === 'open'"
            type="primary"
            @click="handleAck(detailRecord)"
          >
            {{ $t('page.ai.alarm.actions.ack') }}
          </Button>
          <Button
            v-if="detailRecord.status !== 'closed'"
            danger
            @click="handleClose(detailRecord)"
          >
            {{ $t('page.ai.alarm.actions.close') }}
          </Button>
        </div>
      </template>
    </Drawer>
  </Page>
</template>
