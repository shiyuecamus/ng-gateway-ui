<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { AiAlarmEventInfo } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import {
  Descriptions,
  DescriptionsItem,
  Drawer,
  Image,
  message,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeAlarmEventStatus,
  fetchAlarmEventDetail,
  fetchAlarmEventPage,
} from '#/api';

import { searchFormSchema, useColumns } from './modules/schemas';

defineOptions({ name: 'AiAlarmPage' });

const { handleRequest } = useRequestHandler();

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: searchFormSchema,
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AiAlarmEventInfo> = {
  columns: useColumns(onActionClick),
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

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const detailVisible = ref(false);
const detailRecord = ref<AiAlarmEventInfo | null>(null);

function onActionClick({ code, row }: OnActionClickParams<AiAlarmEventInfo>) {
  switch (code) {
    case 'ack': {
      handleAck(row);
      break;
    }
    case 'close': {
      handleClose(row);
      break;
    }
    case 'detail': {
      handleDetail(row);
      break;
    }
    default: {
      break;
    }
  }
}

async function handleDetail(row: AiAlarmEventInfo) {
  detailVisible.value = true;
  try {
    detailRecord.value = await fetchAlarmEventDetail(row.id);
  } catch {
    detailRecord.value = row;
  }
}

async function handleAck(row: AiAlarmEventInfo) {
  await handleRequest(
    () => changeAlarmEventStatus({ id: row.id, status: 'acked' }),
    async () => {
      message.success($t('page.ai.alarm.messages.ackSuccess'));
      await gridApi.query();
    },
  );
}

async function handleClose(row: AiAlarmEventInfo) {
  await handleRequest(
    () => changeAlarmEventStatus({ id: row.id, status: 'closed' }),
    async () => {
      message.success($t('page.ai.alarm.messages.closeSuccess'));
      await gridApi.query();
    },
  );
}

function getSnapshotUrl(row: AiAlarmEventInfo): null | string {
  const payload = row.payload;
  if (typeof payload === 'object' && payload?.snapshot_url) {
    return payload.snapshot_url as string;
  }
  return null;
}
</script>

<template>
  <Page auto-content-height>
    <Grid />

    <!-- Detail drawer -->
    <Drawer
      v-model:open="detailVisible"
      :title="`${$t('page.ai.alarm.title')} #${detailRecord?.id ?? ''}`"
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
            {{ detailRecord.severity }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.status')" :span="2">
            {{ detailRecord.status }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.alarm.description')" :span="2">
            {{ detailRecord.description }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('common.baseInfo.createdAt')">
            {{ detailRecord.createdAt }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('common.baseInfo.updatedAt')">
            {{ detailRecord.updatedAt }}
          </DescriptionsItem>
        </Descriptions>

        <!-- Snapshot -->
        <div v-if="getSnapshotUrl(detailRecord)" class="mt-4">
          <Image
            :src="getSnapshotUrl(detailRecord)!"
            :preview="true"
            style="max-width: 100%; border-radius: 8px"
          />
        </div>

        <!-- Payload (raw JSON) -->
        <div v-if="detailRecord.payload" class="mt-4">
          <pre class="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs">{{
            JSON.stringify(detailRecord.payload, null, 2)
          }}</pre>
        </div>
      </template>
    </Drawer>
  </Page>
</template>
