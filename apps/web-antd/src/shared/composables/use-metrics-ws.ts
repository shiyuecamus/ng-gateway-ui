import type {
  ChannelStatsSnapshot,
  DeviceRowsPayload,
  DeviceStatsSnapshot,
  GatewayStatusSnapshot,
  MetricsClientMessage,
  MetricsScope,
  MetricsServerMessage,
  MetricsSnapshotMessage,
  MetricsSubscribeMessage,
  MetricsUpdateMessage,
  NorthwardAppStatsSnapshot,
  TrendPoint,
} from '@vben/types';

import { computed, ref, shallowRef, triggerRef } from 'vue';

import { $t } from '@vben/locales';
import { clamp } from '@vben/utils';

import { useGatewayWs } from './use-gateway-ws';

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

/**
 * Unified `/api/ws/metrics` client.
 *
 * - `subscribeGlobal()` for dashboard (gateway overview)
 * - `subscribeDevice(channelId)` for southward channel per-device observability
 *
 * The server side protocol is implemented in `ng-gateway-web/src/api/v1/ws/metrics.rs`.
 */
export function useMetricsWs(options?: {
  intervalMs?: number;
  /**
   * Number of trend points to keep (sliding window).
   * 60 = ~1 minute at 1s updates.
   */
  trendPoints?: number;
  /**
   * UI trigger throttle (ms).
   * This does NOT change WS frame rate; it only controls how frequently Vue
   * reactive refs are triggered to re-render.
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

  // One connection can keep multiple active subscriptions (at most one per scope).
  const subscriptions = shallowRef<
    Array<{ id?: number; intervalMs?: number; scope: MetricsScope }>
  >([]);
  // Backward-compatible: last subscribed scope/id (useful for debugging).
  const subscribed = shallowRef<null | { id?: number; scope: MetricsScope }>(
    null,
  );

  // ---- global snapshot (dashboard) ----
  const lastMessageTs = ref<number>(0);
  const snapshot = shallowRef<GatewayStatusSnapshot | null>(null);

  // ---- channel/app snapshots (observability pages) ----
  const channelSnapshot = shallowRef<ChannelStatsSnapshot | null>(null);
  const appSnapshot = shallowRef<NorthwardAppStatsSnapshot | null>(null);

  // Derived rates from counters (best-effort, for global snapshot)
  const networkTxBps = ref<number>(0);
  const networkRxBps = ref<number>(0);
  const collectorCyclesPerSec = ref<number>(0);
  const collectorSuccessRate = ref<number>(0);
  const northwardRoutedPerSec = ref<number>(0);
  const northwardErrorsPerSec = ref<number>(0);

  // Trend buffers (sliding window, for global snapshot)
  const trendCpu = shallowRef<TrendPoint[]>([]);
  const trendMem = shallowRef<TrendPoint[]>([]);
  const trendDisk = shallowRef<TrendPoint[]>([]);
  const trendTx = shallowRef<TrendPoint[]>([]);
  const trendRx = shallowRef<TrendPoint[]>([]);
  const trendCollectorMs = shallowRef<TrendPoint[]>([]);

  // ---- device rows (southward channel observability) ----
  const subscribedChannelId = shallowRef<number | undefined>(undefined);
  const rowsByDeviceId = shallowRef<Map<number, DeviceStatsSnapshot>>(
    new Map(),
  );

  let triggerScheduled = false;
  let lastTriggerAt = 0;

  const {
    status,
    isConnected,
    lastError,
    lastPongAt,
    lastPongRttMs,
    connect,
    disconnect,
    sendMessage,
    ping,
  } = useGatewayWs<MetricsServerMessage, MetricsClientMessage>({
    endpoint: '/api/ws/metrics',
    onConnected() {
      // Re-subscribe all active subscriptions on reconnect.
      for (const sub of subscriptions.value) {
        const msg: MetricsSubscribeMessage = {
          type: 'subscribe',
          requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          scope: sub.scope,
          id: sub.id,
          intervalMs: sub.intervalMs ?? intervalMs,
        };
        sendMessage(msg);
      }
    },
    onMessage(msg) {
      handleServerMessage(msg);
    },
  });

  function scheduleTrigger(refs: Array<{ value: unknown }>) {
    if (triggerScheduled) return;
    const now = Date.now();
    const elapsed = now - lastTriggerAt;
    const delay = Math.max(0, TRIGGER_MIN_INTERVAL_MS - elapsed);
    triggerScheduled = true;

    window.setTimeout(() => {
      triggerScheduled = false;
      lastTriggerAt = Date.now();
      for (const r of refs) {
        // Vue's `triggerRef` type is generic; we only need runtime triggering here.
        triggerRef(r as never);
      }
    }, delay);
  }

  function subscribe(
    scope: MetricsScope,
    id?: number,
    intervalOverrideMs?: number,
  ) {
    subscribed.value = { scope, id };

    // Maintain "at most one per scope" subscription list.
    const next = [...subscriptions.value];
    const idx = next.findIndex((s) => s.scope === scope);
    const interval = intervalOverrideMs ?? intervalMs;
    if (idx === -1) {
      next.push({ scope, id, intervalMs: interval });
    } else {
      next[idx] = { scope, id, intervalMs: interval };
    }
    subscriptions.value = next;

    // Reset scope-specific state on (re)subscribe.
    switch (scope) {
      case 'app': {
        appSnapshot.value = null;

        break;
      }
      case 'channel': {
        channelSnapshot.value = null;

        break;
      }
      case 'device': {
        subscribedChannelId.value = id;
        rowsByDeviceId.value = new Map();

        break;
      }
      // No default
    }

    const msg: MetricsSubscribeMessage = {
      type: 'subscribe',
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      scope,
      id,
      intervalMs: interval,
    };
    sendMessage(msg);
  }

  function subscribeGlobal(intervalOverrideMs?: number) {
    subscribe('global', undefined, intervalOverrideMs);
  }

  function subscribeChannel(channelId: number, intervalOverrideMs?: number) {
    subscribe('channel', channelId, intervalOverrideMs);
  }

  function subscribeApp(appId: number, intervalOverrideMs?: number) {
    subscribe('app', appId, intervalOverrideMs);
  }

  function subscribeDevice(channelId: number, intervalOverrideMs?: number) {
    subscribe('device', channelId, intervalOverrideMs);
  }

  function unsubscribe() {
    subscribed.value = null;
    subscriptions.value = [];
    subscribedChannelId.value = undefined;
    rowsByDeviceId.value = new Map();
    sendMessage({ type: 'unsubscribe', requestId: `${Date.now()}` });
  }

  // Used for delta/rate calculations (global)
  let prevAt: null | number = null;
  let prevNetworkTx: null | number = null;
  let prevNetworkRx: null | number = null;
  let prevCollectorTotal: null | number = null;
  let prevCollectorSuccess: null | number = null;
  let prevCollectorFail: null | number = null;
  let prevCollectorTimeout: null | number = null;
  let prevNorthwardRouted: null | number = null;
  let prevNorthwardErrors: null | number = null;

  function applyGlobalSnapshot(ts: number, data: GatewayStatusSnapshot) {
    snapshot.value = data;
    lastMessageTs.value = ts;

    const metrics = data.metrics;
    const collector = data.collectorMetrics;
    const northward = data.northwardMetrics;
    const system = data.systemInfo;

    const now = ts;
    const dtSec =
      prevAt && now > prevAt ? Math.max(0.05, (now - prevAt) / 1000) : null;

    if (dtSec && metrics) {
      const tx = Number(metrics.networkBytesSent);
      const rx = Number(metrics.networkBytesReceived);
      if (Number.isFinite(tx) && prevNetworkTx !== null) {
        networkTxBps.value = Math.max(0, (tx - prevNetworkTx) / dtSec);
      }
      if (Number.isFinite(rx) && prevNetworkRx !== null) {
        networkRxBps.value = Math.max(0, (rx - prevNetworkRx) / dtSec);
      }
      if (Number.isFinite(tx)) prevNetworkTx = tx;
      if (Number.isFinite(rx)) prevNetworkRx = rx;
    }

    if (dtSec && collector) {
      const total = Number(collector.totalCollections);
      const ok = Number(collector.successfulCollections);
      const fail = Number(collector.failedCollections);
      const timeout = Number(collector.timeoutCollections);

      if (Number.isFinite(total) && prevCollectorTotal !== null) {
        collectorCyclesPerSec.value = Math.max(
          0,
          (total - prevCollectorTotal) / dtSec,
        );
      }
      if (
        Number.isFinite(ok) &&
        Number.isFinite(fail) &&
        Number.isFinite(timeout) &&
        prevCollectorSuccess !== null &&
        prevCollectorFail !== null &&
        prevCollectorTimeout !== null
      ) {
        const dOk = ok - prevCollectorSuccess;
        const dFail = fail - prevCollectorFail;
        const dTo = timeout - prevCollectorTimeout;
        const denom = Math.max(0, dOk + dFail + dTo);
        collectorSuccessRate.value =
          denom > 0 ? dOk / denom : collectorSuccessRate.value;
      }
      if (Number.isFinite(total)) prevCollectorTotal = total;
      if (Number.isFinite(ok)) prevCollectorSuccess = ok;
      if (Number.isFinite(fail)) prevCollectorFail = fail;
      if (Number.isFinite(timeout)) prevCollectorTimeout = timeout;
    }

    if (dtSec && northward) {
      const routed = Number(northward.totalDataRouted);
      const errors = Number(northward.routingErrors);
      if (Number.isFinite(routed) && prevNorthwardRouted !== null) {
        northwardRoutedPerSec.value = Math.max(
          0,
          (routed - prevNorthwardRouted) / dtSec,
        );
      }
      if (Number.isFinite(errors) && prevNorthwardErrors !== null) {
        northwardErrorsPerSec.value = Math.max(
          0,
          (errors - prevNorthwardErrors) / dtSec,
        );
      }
      if (Number.isFinite(routed)) prevNorthwardRouted = routed;
      if (Number.isFinite(errors)) prevNorthwardErrors = errors;
    }

    // Trend buffers
    const cpu = Number(system?.cpuUsagePercent);
    const mem = Number(system?.memoryUsagePercent);
    const disk = Number(system?.diskUsagePercent);
    const collectorMs = Number(collector?.averageCollectionTimeMs);

    if (Number.isFinite(cpu)) {
      trendCpu.value = pushPoint(
        trendCpu.value,
        { ts, v: cpu },
        trendPoints,
        trendWindowMs,
      );
    }
    if (Number.isFinite(mem)) {
      trendMem.value = pushPoint(
        trendMem.value,
        { ts, v: mem },
        trendPoints,
        trendWindowMs,
      );
    }
    if (Number.isFinite(disk)) {
      trendDisk.value = pushPoint(
        trendDisk.value,
        { ts, v: disk },
        trendPoints,
        trendWindowMs,
      );
    }
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
    if (Number.isFinite(collectorMs)) {
      trendCollectorMs.value = pushPoint(
        trendCollectorMs.value,
        { ts, v: collectorMs },
        trendPoints,
        trendWindowMs,
      );
    }

    prevAt = now;
    scheduleTrigger([
      snapshot,
      trendCpu,
      trendMem,
      trendDisk,
      trendTx,
      trendRx,
      trendCollectorMs,
    ]);
  }

  function applyDeviceRows(msg: MetricsSnapshotMessage | MetricsUpdateMessage) {
    const rows = (msg.data as DeviceRowsPayload).rows ?? [];
    // Backend now always sends full `rows` for both snapshot and update.
    // Rebuild the map to correctly reflect deletions/offlines.
    const next = new Map<number, DeviceStatsSnapshot>();
    for (const row of rows) next.set(row.deviceId, row);
    rowsByDeviceId.value = next;
    scheduleTrigger([rowsByDeviceId]);
  }

  function applyChannelSnapshot(ts: number, data: ChannelStatsSnapshot) {
    channelSnapshot.value = data;
    lastMessageTs.value = ts;
    scheduleTrigger([channelSnapshot]);
  }

  function applyAppSnapshot(ts: number, data: NorthwardAppStatsSnapshot) {
    appSnapshot.value = data;
    lastMessageTs.value = ts;
    scheduleTrigger([appSnapshot]);
  }

  function handleServerMessage(msg: MetricsServerMessage) {
    switch (msg.type) {
      case 'snapshot':
      case 'update': {
        if (msg.scope === 'global') {
          applyGlobalSnapshot(msg.ts, msg.data as GatewayStatusSnapshot);
          return;
        }
        if (msg.scope === 'channel') {
          applyChannelSnapshot(msg.ts, msg.data as ChannelStatsSnapshot);
          return;
        }
        if (msg.scope === 'app') {
          applyAppSnapshot(msg.ts, msg.data as NorthwardAppStatsSnapshot);
          return;
        }
        if (msg.scope === 'device') {
          applyDeviceRows(msg);
          return;
        }
        break;
      }
      case 'error':
      case 'pong':
      case 'subscribed':
    }
  }

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

    // subscription
    subscribed,
    subscriptions,
    subscribe,
    subscribeGlobal,
    subscribeChannel,
    subscribeApp,
    subscribeDevice,
    unsubscribe,

    // global snapshot + derived metrics
    snapshot,
    lastMessageTs,
    channelSnapshot,
    appSnapshot,
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

    // device rows
    subscribedChannelId,
    rowsByDeviceId,
  };
}
