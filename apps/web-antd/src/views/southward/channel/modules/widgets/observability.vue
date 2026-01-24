<script lang="ts" setup>
import type { ChannelInfo } from '@vben/types';

import type { DeviceObservabilityRow } from '../schemas/types';

import type {
  VxeGridListeners,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { AnalysisChartCard, Page } from '@vben/common-ui';
import { usePreferences } from '@vben/preferences';
import { parseChronoDurationToMs } from '@vben/utils';

import { Input, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getChannelById } from '#/api';
import { useMetricsWs } from '#/shared/composables/use-metrics-ws';
import { buildLineChartOption } from '#/views/dashboard/analytics/modules/gateway-echarts';
import GatewayLineChart from '#/views/dashboard/analytics/widgets/gateway-line-chart.vue';

import { useDeviceObservabilityColumns } from '../schemas/table-columns';

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
  connect,
  disconnect,
} = metrics;

const gridOptions: VxeTableGridOptions<DeviceObservabilityRow> = {
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  toolbarConfig: { custom: true, refresh: false, zoom: true },
  columns: useDeviceObservabilityColumns(),
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
}

function statusColorOf(s: string) {
  switch (s) {
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
}

const channelState = computed(() => channelSnapshot.value?.state ?? '-');
const channelHealth = computed(() => channelSnapshot.value?.health ?? null);
const channelMetrics = computed(() => channelSnapshot.value?.metrics ?? null);

const outBps = ref(0);
const inBps = ref(0);
const successRate = ref(0);
const avgLatencyMs = ref(0);

// Trends (KB/s, ms, %)
const trendOutKb = ref<Array<{ ts: number; v: number }>>([]);
const trendInKb = ref<Array<{ ts: number; v: number }>>([]);
const trendLatencyMs = ref<Array<{ ts: number; v: number }>>([]);

let prevChannelAt: null | number = null;
let prevBytesOut: null | number = null;
let prevBytesIn: null | number = null;
let prevOk: null | number = null;
let prevFail: null | number = null;

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
    const ts = Date.now();
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
    const fail = Number(m.failedOperations ?? 0);

    if (prevChannelAt && ts > prevChannelAt) {
      const dtSec = Math.max(0.05, (ts - prevChannelAt) / 1000);
      if (prevBytesOut !== null)
        outBps.value = Math.max(0, (bytesOut - prevBytesOut) / dtSec);
      if (prevBytesIn !== null)
        inBps.value = Math.max(0, (bytesIn - prevBytesIn) / dtSec);

      if (prevOk !== null && prevFail !== null) {
        const dOk = ok - prevOk;
        const dFail = fail - prevFail;
        const denom = Math.max(0, dOk + dFail);
        if (denom > 0) successRate.value = dOk / denom;
      }
    }

    prevChannelAt = ts;
    prevBytesOut = bytesOut;
    prevBytesIn = bytesIn;
    prevOk = ok;
    prevFail = fail;

    trendOutKb.value = pushTrend(trendOutKb.value, {
      ts,
      v: outBps.value / 1024,
    });
    trendInKb.value = pushTrend(trendInKb.value, { ts, v: inBps.value / 1024 });
  },
  { flush: 'post' },
);

const chartThroughput = computed(() =>
  buildLineChartOption({
    unit: 'KB/s',
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: 'TX',
        color: '#f472b6',
        data: trendOutKb.value as any,
        area: true,
      },
      {
        name: 'RX',
        color: '#60a5fa',
        data: trendInKb.value as any,
        area: true,
      },
    ],
  }),
);

const chartLatency = computed(() =>
  buildLineChartOption({
    unit: 'ms',
    yMin: 0,
    xTickStepSeconds: 10,
    isDark: isDark.value,
    series: [
      {
        name: 'Avg',
        color: '#fbbf24',
        data: trendLatencyMs.value as any,
        area: true,
      },
    ],
  }),
);

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
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="text-lg font-medium">
          {{ channel?.name ?? `Channel #${channelId}` }}
        </div>
        <Tag :color="statusColorOf(wsStatus)">{{ statusTextOf(wsStatus) }}</Tag>
        <Tag> state: {{ channelState }} </Tag>
        <Tag v-if="channelHealth">health: {{ channelHealth }}</Tag>
      </div>
      <div class="flex items-center gap-3">
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="Search device..."
          style="width: 240px"
        />
      </div>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="text-xs text-muted-foreground">Throughput</div>
        <div class="mt-1 flex items-baseline gap-3">
          <div class="text-sm font-medium">TX</div>
          <div class="text-lg font-semibold">
            {{ Math.round(outBps / 1024) }} KB/s
          </div>
          <div class="text-sm text-muted-foreground">
            RX {{ Math.round(inBps / 1024) }} KB/s
          </div>
        </div>
        <div class="mt-2 text-xs text-muted-foreground">
          totals:
          {{ channelMetrics?.bytesSent ?? 0 }} out /
          {{ channelMetrics?.bytesReceived ?? 0 }}
          in
        </div>
      </div>

      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="text-xs text-muted-foreground">Quality</div>
        <div class="mt-1 flex items-baseline gap-3">
          <div class="text-sm font-medium">Success</div>
          <div class="text-lg font-semibold">
            {{ (successRate * 100).toFixed(1) }}%
          </div>
          <div class="text-sm text-muted-foreground">
            ops
            {{ channelMetrics?.successfulOperations ?? 0 }}/
            {{ channelMetrics?.totalOperations ?? 0 }}
          </div>
        </div>
        <div class="mt-2 text-xs text-muted-foreground">
          reconnects:
          {{ channelMetrics?.reconnectionCount ?? 0 }}
        </div>
      </div>

      <div
        class="rounded-xl border p-4 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div class="text-xs text-muted-foreground">Latency</div>
        <div class="mt-1 flex items-baseline gap-3">
          <div class="text-sm font-medium">Avg</div>
          <div class="text-lg font-semibold">
            {{ avgLatencyMs.toFixed(1) }} ms
          </div>
          <div class="text-sm text-muted-foreground">
            last
            {{
              (
                parseChronoDurationToMs(channelMetrics?.lastOperationTime) ?? 0
              ).toFixed(1)
            }}
            ms
          </div>
        </div>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AnalysisChartCard title="Network (TX/RX)">
        <GatewayLineChart :option="chartThroughput" />
      </AnalysisChartCard>
      <AnalysisChartCard title="Latency (avg)">
        <GatewayLineChart :option="chartLatency" />
      </AnalysisChartCard>
    </div>

    <Grid />
  </Page>
</template>
