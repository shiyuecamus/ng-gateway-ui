<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { AppInfo } from '@vben/types';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { AnalysisChartCard, Page } from '@vben/common-ui';
import {
  SvgDropIcon,
  SvgErrorIcon,
  SvgLatencyIcon,
  SvgSendIcon,
} from '@vben/icons';
import { $t } from '@vben/locales';
import { usePreferences } from '@vben/preferences';

import { Card, Descriptions, DescriptionsItem, Tag } from 'ant-design-vue';

import { getAppById } from '#/api/core';
import GatewayKpiGrid from '#/shared/components/gateway-kpi-grid.vue';
import GatewayLineChart from '#/shared/components/gateway-line-chart.vue';
import { useMetricsWs } from '#/shared/composables/use-metrics-ws';
import { buildLineChartOption } from '#/views/dashboard/analytics/modules/widgets/gateway-echarts';

defineOptions({
  name: 'NorthwardAppObservabilityPage',
});

const route = useRoute();
const appId = computed(() => Number(route.params.id));

const app = ref<AppInfo | null>(null);

const { isDark } = usePreferences();

const metrics = useMetricsWs({
  intervalMs: 1000,
  uiTriggerMinIntervalMs: 200,
  trendPoints: 60,
});
const { status: wsStatus, appSnapshot, appSnapshotTs, connect, disconnect } =
  metrics;

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
const connectionPhase = computed(
  () => appSnapshot.value?.connectionState?.phase ?? '-',
);
const isConnected = computed(
  () => appSnapshot.value?.connectionState?.phase === 'Connected',
);

/**
 * A lightweight trend window.
 * We keep a small in-memory buffer and trim by time window to avoid unbounded growth.
 */
type TrendPoint = { ts: number; v: number };
const trendWindowMs = 60_000;
const trendMaxLen = 120;

function pushTrend(buf: TrendPoint[], p: TrendPoint) {
  const cutoff = p.ts - trendWindowMs;
  const next = buf.filter((x) => x.ts >= cutoff);
  next.push(p);
  if (next.length > trendMaxLen) return next.slice(next.length - trendMaxLen);
  return next;
}

function pushSample(buf: number[], v: number, maxLen = 6) {
  const next = [...buf, v];
  if (next.length > maxLen) next.splice(0, next.length - maxLen);
  return next;
}

function avgOf(buf: number[]) {
  if (buf.length === 0) return 0;
  const sum = buf.reduce((a, b) => a + b, 0);
  return sum / buf.length;
}

// Derived rates from cumulative counters (msg/s).
const sentPerSec = ref(0);
const droppedPerSec = ref(0);
const errorsPerSec = ref(0);
const retriesPerSec = ref(0);

const trendSent = ref<TrendPoint[]>([]);
const trendDropped = ref<TrendPoint[]>([]);
const trendErrors = ref<TrendPoint[]>([]);
const trendRetries = ref<TrendPoint[]>([]);
const trendLatencyMs = ref<TrendPoint[]>([]);

let prevAt: null | number = null;
let prevSent: null | number = null;
let prevDropped: null | number = null;
let prevErrors: null | number = null;
let prevRetries: null | number = null;

const sentSamples = ref<number[]>([]);
const droppedSamples = ref<number[]>([]);
const errorSamples = ref<number[]>([]);
const retrySamples = ref<number[]>([]);

watch(
  appSnapshot,
  () => {
    const m = snapMetrics.value;
    if (!m) return;

    const ts = appSnapshotTs.value || Date.now();
    const latencyMs = Number(m.avgLatencyMs ?? 0);
    if (Number.isFinite(latencyMs)) {
      trendLatencyMs.value = pushTrend(trendLatencyMs.value, {
        ts,
        v: Math.max(0, latencyMs),
      });
    }

    const sent = Number(m.messagesSent ?? 0);
    const dropped = Number(m.messagesDropped ?? 0);
    const errors = Number(m.errors ?? 0);
    const retries = Number(m.retries ?? 0);

    if (prevAt && ts > prevAt) {
      const dtSec = Math.max(0.05, (ts - prevAt) / 1000);

      if (Number.isFinite(sent) && prevSent !== null) {
        const instant = Math.max(0, (sent - prevSent) / dtSec);
        sentSamples.value = pushSample(sentSamples.value, instant);
        sentPerSec.value = avgOf(sentSamples.value);
      }
      if (Number.isFinite(dropped) && prevDropped !== null) {
        const instant = Math.max(0, (dropped - prevDropped) / dtSec);
        droppedSamples.value = pushSample(droppedSamples.value, instant);
        droppedPerSec.value = avgOf(droppedSamples.value);
      }
      if (Number.isFinite(errors) && prevErrors !== null) {
        const instant = Math.max(0, (errors - prevErrors) / dtSec);
        errorSamples.value = pushSample(errorSamples.value, instant);
        errorsPerSec.value = avgOf(errorSamples.value);
      }
      if (Number.isFinite(retries) && prevRetries !== null) {
        const instant = Math.max(0, (retries - prevRetries) / dtSec);
        retrySamples.value = pushSample(retrySamples.value, instant);
        retriesPerSec.value = avgOf(retrySamples.value);
      }
    }

    // Update prev counters only when they are finite.
    if (Number.isFinite(sent)) prevSent = sent;
    if (Number.isFinite(dropped)) prevDropped = dropped;
    if (Number.isFinite(errors)) prevErrors = errors;
    if (Number.isFinite(retries)) prevRetries = retries;
    prevAt = ts;

    // If disconnected, avoid showing stale "throughput" by resetting rates.
    if (!isConnected.value) {
      sentSamples.value = [];
      droppedSamples.value = [];
      errorSamples.value = [];
      retrySamples.value = [];
      sentPerSec.value = 0;
      droppedPerSec.value = 0;
      errorsPerSec.value = 0;
      retriesPerSec.value = 0;
    }

    trendSent.value = pushTrend(trendSent.value, { ts, v: sentPerSec.value });
    trendDropped.value = pushTrend(trendDropped.value, {
      ts,
      v: droppedPerSec.value,
    });
    trendErrors.value = pushTrend(trendErrors.value, {
      ts,
      v: errorsPerSec.value,
    });
    trendRetries.value = pushTrend(trendRetries.value, {
      ts,
      v: retriesPerSec.value,
    });
  },
  { flush: 'post' },
);

const chartThroughput = computed(() =>
  buildLineChartOption({
    unit: $t('page.northward.app.observability.unit.msgps'),
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.northward.app.observability.series.sent'),
        color: '#34d399',
        data: trendSent.value as any,
        area: true,
      },
      {
        name: $t('page.northward.app.observability.series.dropped'),
        color: '#f97316',
        data: trendDropped.value as any,
        area: true,
      },
      {
        name: $t('page.northward.app.observability.series.errors'),
        color: '#ef4444',
        data: trendErrors.value as any,
        area: false,
      },
      {
        name: $t('page.northward.app.observability.series.retries'),
        color: '#a78bfa',
        data: trendRetries.value as any,
        area: false,
      },
    ],
  }),
);

const chartLatency = computed(() =>
  buildLineChartOption({
    unit: $t('page.northward.app.observability.unit.ms'),
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.northward.app.observability.series.avg'),
        color: '#fbbf24',
        data: trendLatencyMs.value as any,
        area: true,
      },
    ],
  }),
);

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
      totalValue: isConnected.value ? 1 : 0,
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

    <div class="mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AnalysisChartCard
        :title="$t('page.northward.app.observability.charts.throughput')"
      >
        <GatewayLineChart :option="chartThroughput" />
      </AnalysisChartCard>
      <AnalysisChartCard
        :title="$t('page.northward.app.observability.charts.latency')"
      >
        <GatewayLineChart :option="chartLatency" />
      </AnalysisChartCard>
    </div>

    <Card size="small" :title="$t('page.northward.app.observability.snapshot')">
      <Descriptions :column="2" bordered size="small">
        <DescriptionsItem :label="$t('page.northward.app.observability.state')">
          {{ connectionPhase }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.northward.app.observability.connected')"
        >
          {{ isConnected }}
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
  </Page>
</template>
