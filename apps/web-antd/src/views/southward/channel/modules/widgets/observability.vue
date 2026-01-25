<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { ChannelInfo } from '@vben/types';

import type { DeviceObservabilityRow } from '../schemas/types';

import type {
  VxeGridListeners,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { AnalysisChartCard, Page } from '@vben/common-ui';
import {
  SvgCollectIcon,
  SvgReliabilityIcon,
  SvgReportIcon,
  SvgRxIcon,
  SvgTxIcon,
  SvgWriteIcon,
} from '@vben/icons';
import { $t } from '@vben/locales';
import { usePreferences } from '@vben/preferences';
import { CollectionType, CommonStatus } from '@vben/types';
import { parseChronoDurationToMs } from '@vben/utils';

import { Input } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getChannelById } from '#/api';
import GatewayKpiGrid from '#/shared/components/gateway-kpi-grid.vue';
import GatewayLineChart from '#/shared/components/gateway-line-chart.vue';
import { useMetricsWs } from '#/shared/composables/use-metrics-ws';
import { buildLineChartOption } from '#/views/dashboard/analytics/modules/gateway-echarts';

import { useDeviceObservabilityColumnsByType } from '../schemas/table-columns';

const route = useRoute();
const channelId = computed(() => Number(route.params.id));

const channel = ref<ChannelInfo | null>(null);
const keyword = ref('');
const pager = ref({
  currentPage: 1,
  pageSize: 20,
  total: 0,
});

const { isDark } = usePreferences();

// Single WS connection: we can subscribe to multiple scopes on the same socket.
const metrics = useMetricsWs({
  intervalMs: 1000,
  uiTriggerMinIntervalMs: 200,
  trendPoints: 60,
});

const {
  status: wsStatus,
  rowsByDeviceId,
  channelSnapshot,
  channelSnapshotTs,
  connect,
  disconnect,
} = metrics;

const gridOptions: VxeTableGridOptions<DeviceObservabilityRow> = {
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  toolbarConfig: { custom: true, refresh: false, zoom: true },
  columns: useDeviceObservabilityColumnsByType(CollectionType.Collection),
};

const gridEvents: VxeGridListeners<DeviceObservabilityRow> = {
  pageChange({ currentPage, pageSize }) {
    pager.value.currentPage = currentPage;
    pager.value.pageSize = pageSize;
    updateGridData();
  },
};

type ObservabilityGridApi = {
  setGridOptions: (options: {
    [k: string]: unknown;
    data?: DeviceObservabilityRow[];
    pagerConfig?: unknown;
  }) => void;
};

// Note: vxe-table's `DeepPartial<...>` generics can cause TS(2589) (excessively deep instantiation).
// We keep safety via `DeviceObservabilityRow`-typed `gridOptions/gridEvents` above, and avoid
// forcing TS to fully expand vxe-table's complex types at this call boundary.
const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (
    options: any,
  ) => readonly [any, ObservabilityGridApi]
)({
  gridOptions,
  gridEvents,
});

function statusTextOf(s: string) {
  switch (s) {
    case 'connected': {
      return $t('page.southward.channel.observability.ws.connected');
    }
    case 'connecting': {
      return $t('page.southward.channel.observability.ws.connecting');
    }
    case 'reconnecting': {
      return $t('page.southward.channel.observability.ws.reconnecting');
    }
    default: {
      return $t('page.southward.channel.observability.ws.disconnected');
    }
  }
}

const channelState = computed(() => channelSnapshot.value?.state ?? '-');
const channelHealth = computed(() => channelSnapshot.value?.health ?? null);
const channelMetrics = computed(() => channelSnapshot.value?.metrics ?? null);
const controlMetrics = computed(
  () => channelSnapshot.value?.controlMetrics ?? null,
);
// IMPORTANT: in this codebase CommonStatus.ENABLED === 0, DISABLED === 1.
const channelEnabled = computed(() => {
  const s = channel.value?.status;
  return (s ?? CommonStatus.ENABLED) === CommonStatus.ENABLED;
});
const effectiveChannelState = computed(() => {
  if (!channelEnabled.value) return $t('common.disabled');
  return channelState.value;
});

const outBps = ref(0);
const inBps = ref(0);
const successRate = ref(0);
const avgLatencyMs = ref(0);
const publishOkPerSec = ref(0);
const publishDroppedPerSec = ref(0);
const publishFailPerSec = ref(0);

// Trends (B/s, ms)
const trendOutBps = ref<Array<{ ts: number; v: number }>>([]);
const trendInBps = ref<Array<{ ts: number; v: number }>>([]);
const trendLatencyMs = ref<Array<{ ts: number; v: number }>>([]);
const trendPublishOk = ref<Array<{ ts: number; v: number }>>([]);
const trendPublishDropped = ref<Array<{ ts: number; v: number }>>([]);
const trendPublishFail = ref<Array<{ ts: number; v: number }>>([]);

let prevChannelAt: null | number = null;
let prevBytesOut: null | number = null;
let prevBytesIn: null | number = null;
let prevPublishOk: null | number = null;
let prevPublishDropped: null | number = null;
let prevPublishFail: null | number = null;
const outSamples = ref<number[]>([]);
const inSamples = ref<number[]>([]);
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

function pushTrend(
  buf: Array<{ ts: number; v: number }>,
  p: { ts: number; v: number },
) {
  const windowMs = 60_000;
  const cutoff = p.ts - windowMs;
  const next = buf.filter((x) => x.ts >= cutoff);
  next.push(p);
  if (next.length > 120) return next.slice(-120);
  return next;
}

watch(
  channelSnapshot,
  () => {
    const m = channelMetrics.value;
    const ts = channelSnapshotTs.value || Date.now();
    if (!m) return;

    // latency (ms)
    const avgMs = parseChronoDurationToMs(m.averageResponseTime) ?? 0;
    avgLatencyMs.value = Math.max(0, avgMs);
    trendLatencyMs.value = pushTrend(trendLatencyMs.value, {
      ts,
      v: avgLatencyMs.value,
    });

    // bytes rate (bps)
    const bytesOut = Number(m.bytesSent ?? 0);
    const bytesIn = Number(m.bytesReceived ?? 0);
    const ok = Number(m.successfulOperations ?? 0);
    const total = Number(m.totalOperations ?? 0);
    successRate.value = total > 0 ? ok / total : 0;

    if (prevChannelAt && ts > prevChannelAt) {
      const dtSec = Math.max(0.05, (ts - prevChannelAt) / 1000);
      if (prevBytesOut !== null) {
        const instant = Math.max(0, (bytesOut - prevBytesOut) / dtSec);
        outSamples.value = pushSample(outSamples.value, instant);
        outBps.value = avgOf(outSamples.value);
      }
      if (prevBytesIn !== null) {
        const instant = Math.max(0, (bytesIn - prevBytesIn) / dtSec);
        inSamples.value = pushSample(inSamples.value, instant);
        inBps.value = avgOf(inSamples.value);
      }

      // report publish rates (msg/s)
      const pubOk = Number(m.reportPublishSuccessTotal ?? 0);
      const pubDrop = Number(m.reportPublishDroppedTotal ?? 0);
      const pubFail = Number(m.reportPublishFailTotal ?? 0);
      if (prevPublishOk !== null) {
        publishOkPerSec.value = Math.max(0, (pubOk - prevPublishOk) / dtSec);
      }
      if (prevPublishDropped !== null) {
        publishDroppedPerSec.value = Math.max(
          0,
          (pubDrop - prevPublishDropped) / dtSec,
        );
      }
      if (prevPublishFail !== null) {
        publishFailPerSec.value = Math.max(
          0,
          (pubFail - prevPublishFail) / dtSec,
        );
      }
      if (Number.isFinite(pubOk)) prevPublishOk = pubOk;
      if (Number.isFinite(pubDrop)) prevPublishDropped = pubDrop;
      if (Number.isFinite(pubFail)) prevPublishFail = pubFail;

      trendPublishOk.value = pushTrend(trendPublishOk.value, {
        ts,
        v: publishOkPerSec.value,
      });
      trendPublishDropped.value = pushTrend(trendPublishDropped.value, {
        ts,
        v: publishDroppedPerSec.value,
      });
      trendPublishFail.value = pushTrend(trendPublishFail.value, {
        ts,
        v: publishFailPerSec.value,
      });
    }

    prevChannelAt = ts;
    prevBytesOut = bytesOut;
    prevBytesIn = bytesIn;

    // If channel disabled, keep throughput at 0 (prevents misleading "Connected"/traffic).
    if (!channelEnabled.value) {
      outSamples.value = [];
      inSamples.value = [];
      outBps.value = 0;
      inBps.value = 0;
      successRate.value = 0;
      publishOkPerSec.value = 0;
      publishDroppedPerSec.value = 0;
      publishFailPerSec.value = 0;
    }

    trendOutBps.value = pushTrend(trendOutBps.value, { ts, v: outBps.value });
    trendInBps.value = pushTrend(trendInBps.value, { ts, v: inBps.value });
  },
  { flush: 'post' },
);

const isReportChannel = computed(() => {
  const ct = channel.value?.collectionType;
  return ct === CollectionType.Report;
});

const pointReadOk = computed(() =>
  Number(channelMetrics.value?.pointReadSuccessTotal ?? 0),
);
const pointReadFail = computed(() =>
  Number(channelMetrics.value?.pointReadFailTotal ?? 0),
);
const pointReadTimeout = computed(() =>
  Number(channelMetrics.value?.pointReadTimeoutTotal ?? 0),
);
const pointReadTotal = computed(
  () => pointReadOk.value + pointReadFail.value + pointReadTimeout.value,
);
const collectPointSuccessRate = computed(() => {
  const denom = pointReadTotal.value;
  return denom > 0 ? pointReadOk.value / denom : 0;
});

const publishOk = computed(() =>
  Number(channelMetrics.value?.reportPublishSuccessTotal ?? 0),
);
const publishDropped = computed(() =>
  Number(channelMetrics.value?.reportPublishDroppedTotal ?? 0),
);
const publishFail = computed(() =>
  Number(channelMetrics.value?.reportPublishFailTotal ?? 0),
);
const publishTotal = computed(
  () => publishOk.value + publishDropped.value + publishFail.value,
);
const publishSuccessRate = computed(() => {
  const denom = publishTotal.value;
  return denom > 0 ? publishOk.value / denom : 0;
});

const reconnects = computed(() =>
  Number(channelMetrics.value?.reconnectionCount ?? 0),
);
// const connectFailed = computed(() =>
//   Number(channelMetrics.value?.connectFailedCount ?? 0),
// );
// const disconnects = computed(() =>
//   Number(channelMetrics.value?.disconnectCount ?? 0),
// );

const writeOk = computed(() =>
  Number(controlMetrics.value?.writeSuccessTotal ?? 0),
);
const writeFail = computed(() =>
  Number(controlMetrics.value?.writeFailTotal ?? 0),
);
const writeTimeout = computed(() =>
  Number(controlMetrics.value?.writeTimeoutTotal ?? 0),
);
const writeTotal = computed(
  () => writeOk.value + writeFail.value + writeTimeout.value,
);
const writeSuccessRate = computed(() => {
  const denom = writeTotal.value;
  return denom > 0 ? writeOk.value / denom : 0;
});

const execOk = computed(() =>
  Number(controlMetrics.value?.executeSuccessTotal ?? 0),
);
const execFail = computed(() =>
  Number(controlMetrics.value?.executeFailTotal ?? 0),
);
const execTimeout = computed(() =>
  Number(controlMetrics.value?.executeTimeoutTotal ?? 0),
);
const execTotal = computed(
  () => execOk.value + execFail.value + execTimeout.value,
);
const execSuccessRate = computed(() => {
  const denom = execTotal.value;
  return denom > 0 ? execOk.value / denom : 0;
});

const lastReportAgeSec = computed(() => {
  const s = channelMetrics.value?.lastReportAt;
  if (!s) return null;
  const t = Date.parse(String(s));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 1000);
});

const chartThroughput = computed(() =>
  buildLineChartOption({
    unit: $t('page.southward.channel.observability.unit.bps'),
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.southward.channel.observability.series.tx'),
        color: '#f472b6',
        data: trendOutBps.value as any,
        area: true,
      },
      {
        name: $t('page.southward.channel.observability.series.rx'),
        color: '#60a5fa',
        data: trendInBps.value as any,
        area: true,
      },
    ],
  }),
);

const chartLatency = computed(() =>
  buildLineChartOption({
    unit: $t('page.southward.channel.observability.unit.ms'),
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.southward.channel.observability.series.avg'),
        color: '#fbbf24',
        data: trendLatencyMs.value as any,
        area: true,
      },
    ],
  }),
);

const chartReport = computed(() =>
  buildLineChartOption({
    unit: $t('page.southward.channel.observability.unit.msgps'),
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: $t('page.southward.channel.observability.report.series.ok'),
        color: '#34d399',
        data: trendPublishOk.value as any,
        area: true,
      },
      {
        name: $t('page.southward.channel.observability.report.series.dropped'),
        color: '#f97316',
        data: trendPublishDropped.value as any,
        area: true,
      },
      {
        name: $t('page.southward.channel.observability.report.series.fail'),
        color: '#ef4444',
        data: trendPublishFail.value as any,
        area: false,
      },
    ],
  }),
);

const secondaryChartTitle = computed(() => {
  return isReportChannel.value
    ? $t('page.southward.channel.observability.charts.reportPublish')
    : $t('page.southward.channel.observability.charts.latencyAvg');
});

const secondaryChartOption = computed(() => {
  return isReportChannel.value ? chartReport.value : chartLatency.value;
});

const kpiItems = computed<AnalysisOverviewItem[]>(() => {
  const m = channelMetrics.value;
  // const totalOps = Number(m?.totalOperations ?? 0);
  // const okOps = Number(m?.successfulOperations ?? 0);
  const baseItems: AnalysisOverviewItem[] = [
    {
      icon: SvgTxIcon,
      title: $t('page.southward.channel.observability.series.tx'),
      totalTitle: $t('page.southward.channel.observability.out'),
      totalValue: Number(m?.bytesSent ?? 0),
      totalSuffix: 'B',
      value: Math.max(0, outBps.value),
      valueSuffix: ` ${$t('page.southward.channel.observability.unit.bps')}`,
    },
    {
      icon: SvgRxIcon,
      title: $t('page.southward.channel.observability.series.rx'),
      totalTitle: $t('page.southward.channel.observability.in'),
      totalValue: Number(m?.bytesReceived ?? 0),
      totalSuffix: 'B',
      value: Math.max(0, inBps.value),
      valueSuffix: ` ${$t('page.southward.channel.observability.unit.bps')}`,
    },
  ];

  // Quality KPI (Collection vs Report)
  const qualityItems: AnalysisOverviewItem[] = isReportChannel.value
    ? [
        {
          icon: SvgReportIcon,
          title: $t('page.southward.channel.observability.publishSuccess'),
          totalTitle: $t('page.southward.channel.observability.publishTotal'),
          totalValue: publishOk.value,
          totalSuffix: `/${publishTotal.value}`,
          value: Math.max(0, publishSuccessRate.value * 100),
          valueSuffix: '%',
        },
        {
          icon: SvgReportIcon,
          title: $t('page.southward.channel.observability.publishDropped'),
          totalTitle: $t('page.southward.channel.observability.totals'),
          totalValue: publishDropped.value,
          totalSuffix: '',
          value: Math.max(0, publishDropped.value),
          valueSuffix: '',
        },
        {
          icon: SvgReportIcon,
          title: $t('page.southward.channel.observability.lastReportAge'),
          totalTitle: $t('page.southward.channel.observability.lastReportAge'),
          totalValue: Math.max(0, lastReportAgeSec.value ?? 0),
          totalSuffix: ` ${$t('page.southward.channel.observability.unit.s')}`,
          value: Math.max(0, lastReportAgeSec.value ?? 0),
          valueSuffix: ` ${$t('page.southward.channel.observability.unit.s')}`,
        },
      ]
    : [
        {
          icon: SvgCollectIcon,
          title: $t('page.southward.channel.observability.avg'),
          totalTitle: $t('page.southward.channel.observability.last'),
          totalValue: Math.max(
            0,
            parseChronoDurationToMs(m?.lastOperationTime) ?? 0,
          ),
          totalSuffix: ` ${$t('page.southward.channel.observability.unit.ms')}`,
          value: Math.max(0, avgLatencyMs.value),
          valueSuffix: ` ${$t('page.southward.channel.observability.unit.ms')}`,
        },
        {
          icon: SvgCollectIcon,
          title: $t('page.southward.channel.observability.collectPointSuccess'),
          totalTitle: $t('page.southward.channel.observability.collectPoints'),
          totalValue: pointReadOk.value,
          totalSuffix: `/${pointReadTotal.value}`,
          value: Math.max(0, collectPointSuccessRate.value * 100),
          valueSuffix: '%',
        },
        {
          icon: SvgCollectIcon,
          title: $t('page.southward.channel.observability.collectPointTimeout'),
          totalTitle: $t('page.southward.channel.observability.totals'),
          totalValue: pointReadTimeout.value,
          totalSuffix: '',
          value: Math.max(0, pointReadTimeout.value),
          valueSuffix: '',
        },
      ];

  const reliabilityItems: AnalysisOverviewItem[] = [
    {
      icon: SvgReliabilityIcon,
      title: $t('page.southward.channel.observability.reconnects'),
      totalTitle: $t('page.southward.channel.observability.totals'),
      totalValue: reconnects.value,
      totalSuffix: '',
      value: Math.max(0, reconnects.value),
      valueSuffix: '',
    },
    // {
    //   icon: SvgNetworkIcon,
    //   title: $t('page.southward.channel.observability.connectFailed'),
    //   totalTitle: $t('page.southward.channel.observability.totals'),
    //   totalValue: connectFailed.value,
    //   totalSuffix: '',
    //   value: Math.max(0, connectFailed.value),
    //   valueSuffix: '',
    // },
    // {
    //   icon: SvgNetworkIcon,
    //   title: $t('page.southward.channel.observability.disconnects'),
    //   totalTitle: $t('page.southward.channel.observability.totals'),
    //   totalValue: disconnects.value,
    //   totalSuffix: '',
    //   value: Math.max(0, disconnects.value),
    //   valueSuffix: '',
    // },
  ];

  const controlItems: AnalysisOverviewItem[] = [
    {
      icon: SvgWriteIcon,
      title: $t('page.southward.channel.observability.writeSuccess'),
      totalTitle: $t('page.southward.channel.observability.writeTotal'),
      totalValue: writeOk.value,
      totalSuffix: `/${writeTotal.value}`,
      value: Math.max(0, writeSuccessRate.value * 100),
      valueSuffix: '%',
    },
    {
      icon: SvgWriteIcon,
      title: $t('page.southward.channel.observability.executeSuccess'),
      totalTitle: $t('page.southward.channel.observability.executeTotal'),
      totalValue: execOk.value,
      totalSuffix: `/${execTotal.value}`,
      value: Math.max(0, execSuccessRate.value * 100),
      valueSuffix: '%',
    },
  ];

  // Keep legacy mixed I/O ops success rate as a diagnostic KPI (explicitly named).
  // const legacyItems: AnalysisOverviewItem[] = [
  //   {
  //     icon: SvgPointsIcon,
  //     title: $t('page.southward.channel.observability.ioSuccess'),
  //     totalTitle: $t('page.southward.channel.observability.ioOps'),
  //     totalValue: okOps,
  //     totalSuffix: `/${totalOps}`,
  //     value: Math.max(0, successRate.value * 100),
  //     valueSuffix: '%',
  //   },
  // ];

  return [...baseItems, ...qualityItems, ...reliabilityItems, ...controlItems];
});

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const all = [...rowsByDeviceId.value.values()];
  if (!kw) return all;
  return all.filter((r) => {
    return (
      r.deviceName.toLowerCase().includes(kw) ||
      r.deviceType.toLowerCase().includes(kw)
    );
  });
});

function updateGridData() {
  const allRows = filteredRows.value;
  pager.value.total = allRows.length;
  let { currentPage, pageSize } = pager.value;

  const maxPage =
    allRows.length === 0
      ? 1
      : Math.max(1, Math.ceil(allRows.length / pageSize));
  if (currentPage > maxPage) {
    currentPage = maxPage;
    pager.value.currentPage = maxPage;
  }

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = allRows.slice(startIndex, endIndex);

  gridApi.setGridOptions({
    data: pageRows,
    pagerConfig: {
      ...gridOptions.pagerConfig,
      currentPage,
      pageSize,
      total: pager.value.total,
    },
  });
}

watch(
  keyword,
  () => {
    pager.value.currentPage = 1;
    updateGridData();
  },
  { flush: 'post' },
);

watch(
  rowsByDeviceId,
  () => {
    updateGridData();
  },
  { flush: 'post' },
);

async function loadChannel() {
  if (!Number.isFinite(channelId.value)) return;
  channel.value = await getChannelById(channelId.value);
  // Update device table columns based on channel collection type (Report vs Collection).
  gridApi.setGridOptions({
    columns: useDeviceObservabilityColumnsByType(
      channel.value?.collectionType ?? CollectionType.Collection,
    ),
  });
}

onMounted(async () => {
  await loadChannel();
  // Subscribe first so the WS `onConnected` hook can re-send it reliably.
  metrics.subscribeDevice(channelId.value);
  metrics.subscribeChannel(channelId.value);
  connect();
});

onBeforeUnmount(() => {
  metrics.unsubscribe();
  disconnect();
});
</script>

<template>
  <Page auto-content-height>
    <!-- Neon header (dashboard-like) -->
    <div
      class="mb-4 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 ring-1 ring-purple-500/10"
    >
      <div
        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-3 w-3 rounded-full"
            :class="
              wsStatus === 'connected'
                ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.7)]'
                : 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.6)]'
            "
          ></div>
          <div class="flex flex-col">
            <div class="text-base font-semibold text-white">
              {{
                channel?.name ??
                $t('page.southward.channel.observability.channelFallback', {
                  id: channelId,
                })
              }}
            </div>
            <div class="text-xs text-white/60">
              {{ statusTextOf(wsStatus) }}
              · {{ $t('page.southward.channel.observability.state') }}:
              {{ effectiveChannelState }}
              <template v-if="channelHealth">
                · {{ $t('page.southward.channel.observability.health') }}:
                {{ channelHealth }}
              </template>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Input
            v-model:value="keyword"
            allow-clear
            :placeholder="
              $t('page.southward.channel.observability.searchDevice')
            "
            style="width: 240px"
          />
        </div>
      </div>
    </div>

    <div class="mb-4">
      <GatewayKpiGrid :items="kpiItems" />
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AnalysisChartCard
        :title="$t('page.southward.channel.observability.charts.network')"
      >
        <GatewayLineChart :option="chartThroughput" />
      </AnalysisChartCard>
      <AnalysisChartCard :title="secondaryChartTitle">
        <GatewayLineChart :option="secondaryChartOption" />
      </AnalysisChartCard>
    </div>

    <Grid />
  </Page>
</template>
