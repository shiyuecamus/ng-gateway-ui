<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';

import { Page } from '@vben/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

defineOptions({ name: 'AiAlarmPage' });

interface AlarmRecord {
  id: string;
  channelId: number;
  ruleName: string;
  severity: string;
  timestamp: number;
  status: string;
}

const gridOptions: VxeGridProps<AlarmRecord> = {
  columns: [
    { field: 'id', title: 'ID', minWidth: 160 },
    { field: 'channelId', title: 'Channel', width: 120 },
    { field: 'ruleName', title: 'Rule', minWidth: 180 },
    { field: 'severity', title: 'Severity', width: 120 },
    { field: 'timestamp', title: 'Timestamp', minWidth: 180 },
    { field: 'status', title: 'Status', width: 120 },
  ],
  proxyConfig: {
    autoLoad: true,
    ajax: {
      query: async () => [],
    },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
  },
};

const [Grid] = useVbenVxeGrid({ gridOptions });
</script>

<template>
  <Page auto-content-height>
    <Grid />
  </Page>
</template>
