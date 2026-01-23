import type {
  GatewayStatusSnapshot,
  GatewayWsConnectionStatus,
  MetricsClientMessage,
  MetricsServerMessage,
  TrendPoint,
} from './gateway-metrics-types';

import { computed, ref, shallowRef, triggerRef } from 'vue';

import { $t } from '@vben/locales';

import { useWebSocket } from '@vueuse/core';

import { baseRequestClient } from '#/api/request';

import { clamp } from './gateway-metrics-types';

function buildWsUrl(): string {
  const baseURL = (baseRequestClient as any).defaults?.baseURL as
    | string
    | undefined;
  const url = baseURL ?? window.location.origin;
  const wsScheme = url.startsWith('https') ? 'wss' : 'ws';
  const httpScheme = url.startsWith('https') ? 'https' : 'http';
  const normalized = url.replace(`${httpScheme}:`, `${wsScheme}:`);
  return `${normalized}/api/ws/metrics`;
}

function pushPoint(
  buf: TrendPoint[],
  p: TrendPoint,
  maxLen: number,
  windowMs: number,
): TrendPoint[] {
  const cutoff = p.ts - windowMs;
  let next = buf.filter((x) => x.ts >= cutoff);
  next.push(p);
  if (next.length > maxLen) next = next.slice(next.length - maxLen);
  return next;
}

export function useGatewayMetricsWs(options?: {
  intervalMs?: number;
  /**
   * Number of trend points to keep (sliding window).
   * 60 = ~1 minute at 1s updates.
   */
  trendPoints?: number;
  /**
   * UI trigger throttle (ms). This does NOT change WS frame rate; it only controls
   * how frequently Vue reactive refs are triggered to re-render.
   */
  uiTriggerMinIntervalMs?: number;
}) {
  const intervalMs = clamp(options?.intervalMs ?? 1000, 200, 5000);
  const trendPoints = clamp(options?.trendPoints ?? 60, 30, 600);
  const trendWindowMs = 60_000;
  const TRIGGER_MIN_INTERVAL_MS = clamp(
    options?.uiTriggerMinIntervalMs ?? 200,
    100,
    1000,
  );

  const status = ref<GatewayWsConnectionStatus>('disconnected');
  const lastMessageTs = ref<number>(0);
  const lastError = shallowRef<null | { code: string; message: string }>(null);
  const lastPongAt = ref<number>(0);
  const lastPongRttMs = ref<null | number>(null);

  // Latest snapshot (global)
  const snapshot = shallowRef<GatewayStatusSnapshot | null>(null);

  // Derived rates from counters (best-effort)
  const networkTxBps = ref<number>(0);
  const networkRxBps = ref<number>(0);
  const collectorCyclesPerSec = ref<number>(0);
  const collectorSuccessRate = ref<number>(0);
  const northwardRoutedPerSec = ref<number>(0);
  const northwardErrorsPerSec = ref<number>(0);

  // Trend buffers (sliding window)
  const trendCpu = shallowRef<TrendPoint[]>([]);
  const trendMem = shallowRef<TrendPoint[]>([]);
  const trendDisk = shallowRef<TrendPoint[]>([]);
  const trendTx = shallowRef<TrendPoint[]>([]);
  const trendRx = shallowRef<TrendPoint[]>([]);
  const trendCollectorMs = shallowRef<TrendPoint[]>([]);

  let triggerScheduled = false;
  let lastTriggerAt = 0;

  const {
    status: wsStatus,
    open: openWs,
    close: closeWs,
    send,
  } = useWebSocket(buildWsUrl(), {
    immediate: false,
    autoReconnect: { delay: 1000 },
    onConnected() {
      status.value = 'connected';
      lastError.value = null;
      subscribeGlobal();
    },
    onDisconnected() {
      status.value = snapshot.value ? 'reconnecting' : 'disconnected';
    },
    onMessage(_, event) {
      try {
        const msg = JSON.parse(event.data) as MetricsServerMessage;
        handleServerMessage(msg);
      } catch {
        // ignore invalid messages
      }
    },
  });

  function scheduleTrigger() {
    if (triggerScheduled) return;
    const now = Date.now();
    const elapsed = now - lastTriggerAt;
    const delay = Math.max(0, TRIGGER_MIN_INTERVAL_MS - elapsed);
    triggerScheduled = true;

    window.setTimeout(() => {
      triggerScheduled = false;
      lastTriggerAt = Date.now();
      triggerRef(snapshot);
      triggerRef(trendCpu);
      triggerRef(trendMem);
      triggerRef(trendDisk);
      triggerRef(trendTx);
      triggerRef(trendRx);
      triggerRef(trendCollectorMs);
    }, delay);
  }

  function sendMessage(payload: MetricsClientMessage) {
    if (wsStatus.value !== 'OPEN') {
      return;
    }
    send(JSON.stringify(payload));
  }

  function connect() {
    if (wsStatus.value === 'OPEN' || wsStatus.value === 'CONNECTING') return;
    status.value =
      status.value === 'disconnected' ? 'connecting' : 'reconnecting';
    openWs();
  }

  function disconnect() {
    status.value = 'disconnected';
    closeWs();
  }

  // Ping/Pong RTT measurement (client-side).
  let lastPingSentAt: null | number = null;

  function ping() {
    const ts = Date.now();
    lastPingSentAt = ts;
    sendMessage({ type: 'ping', ts });
    return ts;
  }

  function subscribeGlobal() {
    sendMessage({
      type: 'subscribe',
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      scope: 'global',
      intervalMs,
    });
  }

  function unsubscribe() {
    sendMessage({ type: 'unsubscribe', requestId: `${Date.now()}` });
  }

  // Used for delta/rate calculations
  let prevAt: null | number = null;
  let prevNetworkTx: null | number = null;
  let prevNetworkRx: null | number = null;
  let prevCollectorTotal: null | number = null;
  let prevCollectorSuccess: null | number = null;
  let prevCollectorFail: null | number = null;
  let prevCollectorTimeout: null | number = null;
  let prevNorthwardRouted: null | number = null;
  let prevNorthwardErrors: null | number = null;

  function applySnapshot(ts: number, data: GatewayStatusSnapshot) {
    snapshot.value = data;
    lastMessageTs.value = ts;

    const now = ts;
    const dtSec =
      prevAt && now > prevAt ? Math.max(0.05, (now - prevAt) / 1000) : null;

    // Network
    if (dtSec) {
      if (prevNetworkTx !== null) {
        networkTxBps.value = Math.max(
          0,
          (data.metrics.network_bytes_sent - prevNetworkTx) / dtSec,
        );
      }
      if (prevNetworkRx !== null) {
        networkRxBps.value = Math.max(
          0,
          (data.metrics.network_bytes_received - prevNetworkRx) / dtSec,
        );
      }
    }
    prevNetworkTx = data.metrics.network_bytes_sent;
    prevNetworkRx = data.metrics.network_bytes_received;

    // Collector rates
    if (dtSec) {
      if (prevCollectorTotal !== null) {
        collectorCyclesPerSec.value = Math.max(
          0,
          (data.collector_metrics.total_collections - prevCollectorTotal) /
          dtSec,
        );
      }
      if (
        prevCollectorSuccess !== null &&
        prevCollectorFail !== null &&
        prevCollectorTimeout !== null
      ) {
        const dOk =
          data.collector_metrics.successful_collections - prevCollectorSuccess;
        const dFail =
          data.collector_metrics.failed_collections - prevCollectorFail;
        const dTo =
          data.collector_metrics.timeout_collections - prevCollectorTimeout;
        const denom = Math.max(0, dOk + dFail + dTo);
        collectorSuccessRate.value =
          denom > 0 ? dOk / denom : collectorSuccessRate.value;
      }
    }
    prevCollectorTotal = data.collector_metrics.total_collections;
    prevCollectorSuccess = data.collector_metrics.successful_collections;
    prevCollectorFail = data.collector_metrics.failed_collections;
    prevCollectorTimeout = data.collector_metrics.timeout_collections;

    // Northward throughput
    if (dtSec) {
      if (prevNorthwardRouted !== null) {
        northwardRoutedPerSec.value = Math.max(
          0,
          (data.northward_metrics.total_data_routed - prevNorthwardRouted) /
          dtSec,
        );
      }
      if (prevNorthwardErrors !== null) {
        northwardErrorsPerSec.value = Math.max(
          0,
          (data.northward_metrics.routing_errors - prevNorthwardErrors) / dtSec,
        );
      }
    }
    prevNorthwardRouted = data.northward_metrics.total_data_routed;
    prevNorthwardErrors = data.northward_metrics.routing_errors;

    // Trend buffers (use system_info percentages + derived rates)
    trendCpu.value = pushPoint(
      trendCpu.value,
      { ts, v: data.system_info.cpu_usage_percent },
      trendPoints,
      trendWindowMs,
    );
    trendMem.value = pushPoint(
      trendMem.value,
      { ts, v: data.system_info.memory_usage_percent },
      trendPoints,
      trendWindowMs,
    );
    trendDisk.value = pushPoint(
      trendDisk.value,
      { ts, v: data.system_info.disk_usage_percent },
      trendPoints,
      trendWindowMs,
    );
    trendTx.value = pushPoint(
      trendTx.value,
      { ts, v: networkTxBps.value / 1024 },
      trendPoints,
      trendWindowMs,
    );
    trendRx.value = pushPoint(
      trendRx.value,
      { ts, v: networkRxBps.value / 1024 },
      trendPoints,
      trendWindowMs,
    );
    trendCollectorMs.value = pushPoint(
      trendCollectorMs.value,
      { ts, v: data.collector_metrics.average_collection_time_ms },
      trendPoints,
      trendWindowMs,
    );

    prevAt = now;
    scheduleTrigger();
  }

  function handleServerMessage(msg: MetricsServerMessage) {
    switch (msg.type) {
      case 'error': {
        lastError.value = { code: msg.code, message: msg.message };
        break;
      }
      case 'pong': {
        const now = Date.now();
        // Server echoes ping `ts`; use it to compute RTT.
        const base = Number(msg.ts) || lastPingSentAt || now;
        const rtt = Math.max(0, now - base);
        lastPongAt.value = now;
        lastPongRttMs.value = rtt;
        break;
      }
      case 'snapshot':
      case 'update': {
        if (msg.scope !== 'global') return;
        applySnapshot(msg.ts, msg.data);
        break;
      }
      case 'subscribed': {
        // no-op (UI can infer from status)
        break;
      }
    }
  }

  const isConnected = computed(() => status.value === 'connected');
  const connectionHint = computed(() => {
    switch (status.value) {
      case 'connected': {
        return $t('page.dashboard.gatewayOverview.ws.connected');
      }
      case 'connecting': {
        return $t('page.dashboard.gatewayOverview.ws.connecting');
      }
      case 'reconnecting': {
        return $t('page.dashboard.gatewayOverview.ws.reconnecting');
      }
      default: {
        return $t('page.dashboard.gatewayOverview.ws.disconnected');
      }
    }
  });

  return {
    // connection
    status,
    isConnected,
    connectionHint,
    lastError,
    lastPongAt,
    lastPongRttMs,
    connect,
    disconnect,
    ping,
    subscribeGlobal,
    unsubscribe,

    // snapshot + derived metrics
    snapshot,
    lastMessageTs,
    networkTxBps,
    networkRxBps,
    collectorCyclesPerSec,
    collectorSuccessRate,
    northwardRoutedPerSec,
    northwardErrorsPerSec,

    // trends
    trendCpu,
    trendMem,
    trendDisk,
    trendTx,
    trendRx,
    trendCollectorMs,
  };
}
