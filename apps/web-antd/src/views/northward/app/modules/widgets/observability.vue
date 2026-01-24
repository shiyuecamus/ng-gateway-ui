<script lang="ts" setup>
import type { AppInfo } from '@vben/types';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Card, Descriptions, DescriptionsItem, Tag } from 'ant-design-vue';

import { getAppById } from '#/api/core';
import { useMetricsWs } from '#/shared/composables/use-metrics-ws';

defineOptions({
  name: 'NorthwardAppObservabilityPage',
});

const route = useRoute();
const appId = computed(() => Number(route.params.id));

const app = ref<AppInfo | null>(null);

const metrics = useMetricsWs({ intervalMs: 1000 });
const { status: wsStatus, appSnapshot, connect, disconnect } = metrics;

const statusText = computed(() => {
  switch (wsStatus.value) {
    case 'connected': {
      return 'connected';
    }
    case 'connecting': {
      return 'connecting';
    }
    case 'reconnecting': {
      return 'reconnecting';
    }
    default: {
      return 'disconnected';
    }
  }
});

const statusColor = computed(() => {
  switch (wsStatus.value) {
    case 'connected': {
      return 'success';
    }
    case 'connecting': {
      return 'processing';
    }
    case 'reconnecting': {
      return 'warning';
    }
    default: {
      return 'default';
    }
  }
});

const snapMetrics = computed(() => appSnapshot.value?.metrics ?? null);

async function loadApp() {
  if (!Number.isFinite(appId.value)) return;
  app.value = await getAppById(appId.value);
}

function subscribe() {
  if (!Number.isFinite(appId.value)) return;
  metrics.subscribeApp(appId.value);
}

watch(appId, () => {
  void loadApp();
  subscribe();
});

onMounted(async () => {
  await loadApp();
  connect();
  subscribe();
});

onBeforeUnmount(() => {
  disconnect();
});
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="text-lg font-medium">
          {{ app?.name ?? `App #${appId}` }}
        </div>
        <Tag :color="statusColor">{{ statusText }}</Tag>
      </div>
    </div>

    <Card size="small" title="Snapshot">
      <Descriptions :column="2" bordered size="small">
        <DescriptionsItem label="State">
          {{ appSnapshot?.state ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="Connected">
          {{ appSnapshot?.isConnected ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="Messages Sent">
          {{ snapMetrics?.messagesSent ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem label="Messages Dropped">
          {{ snapMetrics?.messagesDropped ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem label="Errors">
          {{ snapMetrics?.errors ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem label="Retries">
          {{ snapMetrics?.retries ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem label="Avg Latency (ms)">
          {{ (snapMetrics?.avgLatencyMs ?? 0).toFixed(1) }}
        </DescriptionsItem>
        <DescriptionsItem label="Last Sent">
          {{ snapMetrics?.lastSent ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="Last Error">
          {{ snapMetrics?.lastError ?? '-' }}
        </DescriptionsItem>
      </Descriptions>
    </Card>

    <Card class="mt-3" size="small" title="Raw JSON (debug)">
      <pre class="m-0 overflow-auto text-xs">{{ appSnapshot }}</pre>
    </Card>
  </Page>
</template>
