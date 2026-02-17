<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AnalysisChartCard } from '@vben/common-ui';
import {
  SvgAppIcon,
  SvgChannelIcon,
  SvgCollectorIcon,
  SvgCpuIcon,
  SvgDeviceIcon,
  SvgDiskIcon,
  SvgNetworkIcon,
  SvgPointsIcon,
} from '@vben/icons';
import { $t } from '@vben/locales';
import { usePreferences } from '@vben/preferences';
import {
  formatBytesHuman,
  formatMs,
  parseChronoDurationToMs,
} from '@vben/utils';

import { VbenButton, VbenIcon } from '@vben-core/shadcn-ui';

import { message } from 'ant-design-vue';

import GatewayKpiGrid from '#/shared/components/gateway-kpi-grid.vue';
import GatewayLineChart from '#/shared/components/gateway-line-chart.vue';
import { useMetricsWs } from '#/shared/composables/use-metrics-ws';

import { buildLineChartOption } from './modules/widgets/gateway-echarts';

const router = useRouter();
const { isDark } = usePreferences();

const metrics = useMetricsWs({
  intervalMs: 1000,
  uiTriggerMinIntervalMs: 200,
  trendPoints: 60,
});

const pingToastKey = 'gateway-ws-ping';
const pingTimeoutMs = 3500;
const pingTimeoutHandle = ref<null | number>(null);

function clearPingTimeout() {
  if (pingTimeoutHandle.value !== null) {
    window.clearTimeout(pingTimeoutHandle.value);
    pingTimeoutHandle.value = null;
  }
}

function onPingClick() {
  // If user clicks while disconnected, still try to ping and show feedback.
  metrics.ping();
  message.loading({
    content: $t('page.dashboard.gatewayOverview.ping.sending'),
    key: pingToastKey,
    duration: 0,
  });

  clearPingTimeout();
  pingTimeoutHandle.value = window.setTimeout(() => {
    message.warning({
      content: $t('page.dashboard.gatewayOverview.ping.timeout'),
      key: pingToastKey,
      duration: 1.8,
    });
  }, pingTimeoutMs);
}

watch(
  () => metrics.lastPongAt.value,
  (at) => {
    if (!at) return;
    clearPingTimeout();
    const rtt = metrics.lastPongRttMs.value ?? 0;
    message.success({
      content: $t('page.dashboard.gatewayOverview.ping.pong', {
        ms: Math.round(rtt),
      }),
      key: pingToastKey,
      duration: 1.5,
    });
  },
);

onMounted(() => {
  // Subscribe first so the WS `onConnected` hook can re-send it reliably.
  // The server does NOT push anything until it receives a subscribe message.
  metrics.subscribeGlobal();
  metrics.connect();
});

onBeforeUnmount(() => {
  clearPingTimeout();
  metrics.unsubscribe();
  metrics.disconnect();
});

const snap = computed(() => metrics.snapshot.value);

const header = computed(() => {
  const s = snap.value;
  if (!s) return null;
  const uptimeMs = parseChronoDurationToMs(s.metrics.uptime);
  return {
    state: s.state,
    version: s.version,
    uptimeMs,
    hostname: s.systemInfo.hostname ?? '-',
    os: `${s.systemInfo.osType} / ${s.systemInfo.osArch}`,
  };
});

const connectedRate = computed(() => {
  const s = snap.value;
  if (!s) return 0;
  const total = s.metrics.totalChannels || 0;
  return total > 0 ? s.metrics.connectedChannels / total : 0;
});

const activeDeviceRate = computed(() => {
  const s = snap.value;
  if (!s) return 0;
  const total = s.metrics.totalDevices || 0;
  return total > 0 ? s.metrics.activeDevices / total : 0;
});

/**
 * Format bytes/sec into a consistent `KB/s` string.
 *
 * NOTE: We intentionally always use `KB/s` here to keep KPI/headers/charts aligned.
 */
function formatKBpsFromBps(bps: number) {
  if (!Number.isFinite(bps)) return '-';
  return `${Math.round(Math.max(0, bps) / 1024)} KB/s`;
}

const overviewItems = computed<AnalysisOverviewItem[]>(() => {
  const s = snap.value;
  if (!s) {
    return [
      {
        icon: SvgChannelIcon,
        title: $t('page.dashboard.gatewayOverview.kpi.southwardChannel'),
        totalTitle: $t('page.dashboard.gatewayOverview.kpi.connectionRate'),
        totalValue: 0,
        totalSuffix: '',
        value: 0,
        valueSuffix: '',
      },
      {
        icon: SvgDeviceIcon,
        title: $t('page.dashboard.gatewayOverview.kpi.device'),
        totalTitle: $t('page.dashboard.gatewayOverview.kpi.activeRate'),
        totalValue: 0,
        totalSuffix: '',
        value: 0,
        valueSuffix: '',
      },
      {
        icon: SvgCpuIcon,
        title: $t('page.dashboard.gatewayOverview.kpi.cpu'),
        totalTitle: $t('page.dashboard.gatewayOverview.kpi.memory'),
        totalValue: 0,
        totalSuffix: '%',
        value: 0,
        valueSuffix: '%',
      },
      {
        icon: SvgAppIcon,
        title: $t('page.dashboard.gatewayOverview.kpi.northwardApp'),
        totalTitle: $t('page.dashboard.gatewayOverview.kpi.running'),
        totalValue: 0,
        totalSuffix: $t('common.unit.count'),
        value: 0,
        valueSuffix: $t('common.unit.count'),
      },
    ];
  }

  return [
    {
      icon: SvgChannelIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.connectedChannels'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.totalChannels'),
      totalValue: s.metrics.totalChannels,
      totalSuffix: $t('common.unit.count'),
      value: s.metrics.connectedChannels,
      valueSuffix: $t('common.unit.count'),
    },
    {
      icon: SvgDeviceIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.activeDevices'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.totalDevices'),
      totalValue: s.metrics.totalDevices,
      totalSuffix: $t('common.unit.count'),
      value: s.metrics.activeDevices,
      valueSuffix: $t('common.unit.count'),
    },
    {
      icon: SvgPointsIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.totalPoints'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.avgPerDevice'),
      totalValue: Math.round(s.southwardMetrics.averagePointsPerDevice ?? 0),
      totalSuffix: $t('common.unit.count'),
      value: s.metrics.totalDataPoints,
      valueSuffix: $t('common.unit.count'),
    },
    {
      icon: SvgAppIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.runningApps'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.totalApps'),
      totalValue: s.northwardMetrics.totalApps,
      totalSuffix: $t('common.unit.count'),
      value: s.northwardMetrics.activeApps,
      valueSuffix: $t('common.unit.count'),
    },
    {
      icon: SvgCpuIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.cpuUsage'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.memoryUsage'),
      totalValue: Math.round(s.systemInfo.memoryUsagePercent),
      totalSuffix: '%',
      value: Math.round(s.systemInfo.cpuUsagePercent),
      valueSuffix: '%',
    },
    {
      icon: SvgDiskIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.diskUsage'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.processRssMb'),
      totalValue: Math.round((s.metrics.memoryUsage ?? 0) / 1024 / 1024),
      totalSuffix: 'MB',
      value: Math.round(s.systemInfo.diskUsagePercent),
      valueSuffix: '%',
    },
    {
      icon: SvgNetworkIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.networkRx'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.networkTx'),
      // `network*Bps` are bytes/sec; convert to KB/sec for consistent UI.
      totalValue: Math.round(metrics.networkTxBps.value / 1024),
      totalSuffix: 'KB/s',
      value: Math.round(metrics.networkRxBps.value / 1024),
      valueSuffix: 'KB/s',
    },
    {
      icon: SvgCollectorIcon,
      title: $t('page.dashboard.gatewayOverview.kpi.collectorAvgMs'),
      totalTitle: $t('page.dashboard.gatewayOverview.kpi.collectorActiveTasks'),
      totalValue: s.metrics.activeTasks,
      totalSuffix: $t('common.unit.count'),
      value: Math.round(s.collectorMetrics.averageCollectionTimeMs ?? 0),
      valueSuffix: 'ms',
    },
  ];
});

const chartSystem = computed(() =>
  buildLineChartOption({
    unit: '%',
    yMin: 0,
    yMax: 100,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.dashboard.gatewayOverview.series.cpu'),
        color: '#22d3ee',
        data: metrics.trendCpu.value,
        area: true,
      },
      {
        name: $t('page.dashboard.gatewayOverview.series.memory'),
        color: '#a78bfa',
        data: metrics.trendMem.value,
        area: true,
      },
      {
        name: $t('page.dashboard.gatewayOverview.series.disk'),
        color: '#34d399',
        data: metrics.trendDisk.value,
        area: false,
      },
    ],
  }),
);

const chartNetwork = computed(() =>
  buildLineChartOption({
    unit: 'KB/s',
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.dashboard.gatewayOverview.series.tx'),
        color: '#f472b6',
        data: metrics.trendTx.value,
        area: true,
      },
      {
        name: $t('page.dashboard.gatewayOverview.series.rx'),
        color: '#60a5fa',
        data: metrics.trendRx.value,
        area: true,
      },
    ],
  }),
);

const chartCollector = computed(() =>
  buildLineChartOption({
    unit: 'ms',
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.dashboard.gatewayOverview.series.collectorAvgMs'),
        color: '#fbbf24',
        data: metrics.trendCollectorMs.value,
        area: true,
      },
    ],
  }),
);

const quickFacts = computed(() => {
  const s = snap.value;
  if (!s) return null;
  return {
    channels: `${s.metrics.connectedChannels}/${s.metrics.totalChannels} (${Math.round(connectedRate.value * 100)}%)`,
    devices: `${s.metrics.activeDevices}/${s.metrics.totalDevices} (${Math.round(activeDeviceRate.value * 100)}%)`,
    uptime: formatMs(header.value?.uptimeMs ?? 0),
    netTx: formatKBpsFromBps(metrics.networkTxBps.value),
    netRx: formatKBpsFromBps(metrics.networkRxBps.value),
    procMem: formatBytesHuman(s.metrics.memoryUsage ?? 0),
    collectorMs: formatMs(s.collectorMetrics.averageCollectionTimeMs ?? 0),
  };
});

function navTo(path: string) {
  router.push(path).catch(() => undefined);
}
</script>

<template>
  <div class="p-5">
    <!-- Neon header -->
    <div
      class="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 ring-1 ring-purple-500/10"
    >
      <div
        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-3 w-3 rounded-full"
            :class="
              metrics.isConnected
                ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.7)]'
                : 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.6)]'
            "
          ></div>
          <div class="flex flex-col">
            <div class="text-base font-semibold text-white">
              {{ $t('page.dashboard.gatewayOverview.title') }}
            </div>
            <div class="text-xs text-white/60">
              {{ metrics.connectionHint }}
              <template v-if="header">
                · {{ $t('page.dashboard.gatewayOverview.header.status') }}:
                {{ header.state }} · v{{ header.version }}
              </template>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <div class="rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
            <span class="text-white/50">{{
              $t('page.dashboard.gatewayOverview.header.host')
            }}</span>
            {{ header?.hostname ?? '-' }}
          </div>
          <div class="rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
            <span class="text-white/50">{{
              $t('page.dashboard.gatewayOverview.header.os')
            }}</span>
            {{ header?.os ?? '-' }}
          </div>
          <div class="rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
            <span class="text-white/50">{{
              $t('page.dashboard.gatewayOverview.header.uptime')
            }}</span>
            {{ quickFacts?.uptime ?? '-' }}
          </div>
          <div class="rounded-md bg-white/5 px-2 py-1 ring-1 ring-white/10">
            <span class="text-white/50">{{
              $t('page.dashboard.gatewayOverview.header.net')
            }}</span>
            RX {{ quickFacts?.netRx ?? '-' }} · TX
            {{ quickFacts?.netTx ?? '-' }}
          </div>

          <VbenButton
            size="sm"
            variant="secondary"
            class="bg-white/5 text-white/80 hover:bg-white/10"
            @click="onPingClick"
          >
            <VbenIcon icon="lucide:send" class="mr-2 size-4" />
            {{ $t('page.dashboard.gatewayOverview.ping.action') }}
          </VbenButton>
        </div>
      </div>
    </div>

    <!-- KPI grid (animated numbers) -->
    <div class="mt-5">
      <GatewayKpiGrid :items="overviewItems" />
    </div>

    <!-- Charts -->
    <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <AnalysisChartCard
        :title="$t('page.dashboard.gatewayOverview.charts.resources')"
        class="dark:border-cyan-500/10 dark:bg-slate-950/40"
      >
        <GatewayLineChart :option="chartSystem" />
      </AnalysisChartCard>
      <AnalysisChartCard
        :title="$t('page.dashboard.gatewayOverview.charts.network')"
        class="dark:border-cyan-500/10 dark:bg-slate-950/40"
      >
        <GatewayLineChart :option="chartNetwork" />
      </AnalysisChartCard>
      <AnalysisChartCard
        :title="$t('page.dashboard.gatewayOverview.charts.collector')"
        class="dark:border-cyan-500/10 dark:bg-slate-950/40"
      >
        <GatewayLineChart :option="chartCollector" />
      </AnalysisChartCard>
    </div>

    <!-- Drilldown -->
    <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">
            {{ $t('page.dashboard.gatewayOverview.drilldown.south.title') }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ quickFacts?.channels ?? '-' }}
          </div>
        </div>
        <div class="mt-3 text-xs text-muted-foreground">
          {{ $t('page.dashboard.gatewayOverview.drilldown.south.desc') }}
        </div>
        <VbenButton class="mt-4 w-full" @click="navTo('/southward/channel')">
          {{ $t('page.dashboard.gatewayOverview.drilldown.south.action') }}
        </VbenButton>
      </div>

      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">
            {{ $t('page.dashboard.gatewayOverview.drilldown.north.title') }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ snap?.northwardMetrics.activeApps ?? 0 }}/{{
              snap?.northwardMetrics.totalApps ?? 0
            }}
          </div>
        </div>
        <div class="mt-3 text-xs text-muted-foreground">
          {{ $t('page.dashboard.gatewayOverview.drilldown.north.desc') }}
        </div>
        <VbenButton class="mt-4 w-full" @click="navTo('/northward/app')">
          {{ $t('page.dashboard.gatewayOverview.drilldown.north.action') }}
        </VbenButton>
      </div>

      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">
            {{ $t('page.dashboard.gatewayOverview.drilldown.monitor.title') }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ quickFacts?.devices ?? '-' }}
          </div>
        </div>
        <div class="mt-3 text-xs text-muted-foreground">
          {{ $t('page.dashboard.gatewayOverview.drilldown.monitor.desc') }}
        </div>
        <VbenButton class="mt-4 w-full" @click="navTo('/maintenance/monitor')">
          {{ $t('page.dashboard.gatewayOverview.drilldown.monitor.action') }}
        </VbenButton>
      </div>
    </div>
  </div>
</template>
