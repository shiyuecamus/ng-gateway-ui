<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { AppInfo } from '@vben/types';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import {
  SvgDropIcon,
  SvgErrorIcon,
  SvgLatencyIcon,
  SvgSendIcon,
} from '@vben/icons';
import { $t } from '@vben/locales';

import { Card, Descriptions, DescriptionsItem, Tag } from 'ant-design-vue';

import { getAppById } from '#/api/core';
import GatewayKpiGrid from '#/shared/components/gateway-kpi-grid.vue';
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
      return $t('page.northward.app.observability.ws.connected');
    }
    case 'connecting': {
      return $t('page.northward.app.observability.ws.connecting');
    }
    case 'reconnecting': {
      return $t('page.northward.app.observability.ws.reconnecting');
    }
    default: {
      return $t('page.northward.app.observability.ws.disconnected');
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

const kpiItems = computed<AnalysisOverviewItem[]>(() => {
  const m = snapMetrics.value;
  return [
    {
      icon: SvgSendIcon,
      title: $t('page.northward.app.observability.messagesSent'),
      totalTitle: $t('page.northward.app.observability.messagesDropped'),
      totalValue: Number(m?.messagesDropped ?? 0),
      totalSuffix: '',
      value: Number(m?.messagesSent ?? 0),
      valueSuffix: '',
    },
    {
      icon: SvgDropIcon,
      title: $t('page.northward.app.observability.messagesDropped'),
      totalTitle: $t('page.northward.app.observability.retries'),
      totalValue: Number(m?.retries ?? 0),
      totalSuffix: '',
      value: Number(m?.messagesDropped ?? 0),
      valueSuffix: '',
    },
    {
      icon: SvgErrorIcon,
      title: $t('page.northward.app.observability.errors'),
      totalTitle: $t('page.northward.app.observability.retries'),
      totalValue: Number(m?.retries ?? 0),
      totalSuffix: '',
      value: Number(m?.errors ?? 0),
      valueSuffix: '',
    },
    {
      icon: SvgLatencyIcon,
      title: $t('page.northward.app.observability.avgLatencyMs'),
      totalTitle: $t('page.northward.app.observability.connected'),
      totalValue: appSnapshot.value?.isConnected ? 1 : 0,
      totalSuffix: '',
      value: Number(m?.avgLatencyMs ?? 0),
      valueSuffix: 'ms',
    },
  ];
});

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
          {{
            app?.name ??
            $t('page.northward.app.observability.appFallback', { id: appId })
          }}
        </div>
        <Tag :color="statusColor">{{ statusText }}</Tag>
      </div>
    </div>

    <div class="mb-3">
      <GatewayKpiGrid :items="kpiItems" />
    </div>

    <Card size="small" :title="$t('page.northward.app.observability.snapshot')">
      <Descriptions :column="2" bordered size="small">
        <DescriptionsItem :label="$t('page.northward.app.observability.state')">
          {{ appSnapshot?.state ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.connected')"
        >
          {{ appSnapshot?.isConnected ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.messagesSent')"
        >
          {{ snapMetrics?.messagesSent ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.messagesDropped')"
        >
          {{ snapMetrics?.messagesDropped ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.errors')"
        >
          {{ snapMetrics?.errors ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.retries')"
        >
          {{ snapMetrics?.retries ?? 0 }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.avgLatencyMs')"
        >
          {{ (snapMetrics?.avgLatencyMs ?? 0).toFixed(1) }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.lastSent')"
        >
          {{ snapMetrics?.lastSent ?? '-' }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.lastError')"
        >
          {{ snapMetrics?.lastError ?? '-' }}
        </DescriptionsItem>
      </Descriptions>
    </Card>

    <Card
      class="mt-3"
      size="small"
      :title="$t('page.northward.app.observability.rawJsonDebug')"
    >
      <pre class="m-0 overflow-auto text-xs">{{ appSnapshot }}</pre>
    </Card>
  </Page>
</template>
