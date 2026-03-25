import type {
  MonitorClientMessage,
  MonitorDeviceMeta,
  MonitorDeviceSnapshot,
  MonitorServerMessage,
  MonitorSubscribeMessage,
  MonitorUpdateHint,
} from '@vben/types';

import { shallowRef, triggerRef } from 'vue';

import { useGatewayWs } from './use-gateway-ws';

export function useMonitorWs() {
  const snapshots = shallowRef<Map<number, MonitorDeviceSnapshot>>(new Map());
  const subscribedDeviceIds = shallowRef<number[]>([]);
  // Hints about which keys changed since last UI trigger.
  const updateHints = shallowRef<MonitorUpdateHint[]>([]);
  const pendingHintKeys = new Map<string, Set<string>>();

  // Throttle UI notifications
  let triggerScheduled = false;
  let lastTriggerAt = 0;
  const TRIGGER_MIN_INTERVAL_MS = 200;

  const { status, connect, disconnect, sendMessage, ping } = useGatewayWs<
    MonitorServerMessage,
    MonitorClientMessage
  >({
    endpoint: '/api/ws/monitor',
    onConnected() {
      if (subscribedDeviceIds.value.length > 0) {
        // Re-subscribe on reconnect
        const ids = subscribedDeviceIds.value;
        const payload: MonitorSubscribeMessage = {
          type: 'subscribe',
          deviceIds: ids,
          requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        sendMessage(payload);
      }
    },
    onMessage(msg) {
      handleServerMessage(msg);
    },
  });

  function subscribe(deviceIds: number | number[], channelId?: number) {
    const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
    subscribedDeviceIds.value = [...ids];

    // Clear stale snapshots
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();

    const payload: MonitorSubscribeMessage = {
      type: 'subscribe',
      channelId,
      deviceIds: ids,
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    sendMessage(payload);
  }

  function unsubscribe() {
    subscribedDeviceIds.value = [];
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();
    sendMessage({ type: 'unsubscribe', requestId: `${Date.now()}` });
  }

  function handleServerMessage(msg: MonitorServerMessage) {
    switch (msg.type) {
      case 'error': {
        // 这里只做简单日志，具体 UI 提示交给调用方

        console.error('[monitor-ws] error', msg.code, msg.message, msg.details);
        break;
      }
      case 'pong': {
        break;
      }
      case 'snapshot': {
        applyMonitorMessage(msg);
        scheduleTrigger();
        break;
      }
      case 'subscribed': {
        subscribedDeviceIds.value = msg.deviceIds;
        break;
      }
      case 'update': {
        applyMonitorMessage(msg);
        scheduleTrigger();
        break;
      }
    }
  }

  function applyMonitorMessage(
    msg: Extract<MonitorServerMessage, { type: 'snapshot' | 'update' }>,
  ) {
    if (msg.type === 'snapshot') {
      upsertSnapshot({
        deviceId: msg.meta.id,
        deviceName: msg.meta.deviceName,
        channelId: msg.meta.channelId,
        telemetry: (msg.telemetry ?? {}) as MonitorDeviceSnapshot['telemetry'],
        clientAttributes: (msg.attributes?.client ?? {}) as MonitorDeviceSnapshot['clientAttributes'],
        sharedAttributes: (msg.attributes?.shared ?? {}) as MonitorDeviceSnapshot['sharedAttributes'],
        serverAttributes: (msg.attributes?.server ?? {}) as MonitorDeviceSnapshot['serverAttributes'],
        lastUpdate: msg.lastUpdate,
      });
      return;
    }

    const existing = ensureSnapshot(msg.meta, msg.timestamp);
    const deviceId = msg.meta.id;

    if (msg.dataType === 'telemetry') {
      Object.assign(existing.telemetry, msg.values ?? {});
      addHint(deviceId, 'telemetry', undefined, Object.keys(msg.values ?? {}));
    } else {
      const values = msg.values ?? {};
      Object.assign(existing.clientAttributes, values.client ?? {});
      Object.assign(existing.sharedAttributes, values.shared ?? {});
      Object.assign(existing.serverAttributes, values.server ?? {});
      addHint(deviceId, 'attributes', 'client', Object.keys(values.client ?? {}));
      addHint(deviceId, 'attributes', 'shared', Object.keys(values.shared ?? {}));
      addHint(deviceId, 'attributes', 'server', Object.keys(values.server ?? {}));
    }

    existing.lastUpdate = msg.timestamp;
  }

  function upsertSnapshot(snapshot: MonitorDeviceSnapshot) {
    snapshots.value.set(snapshot.deviceId, snapshot);
  }

  function ensureSnapshot(meta: MonitorDeviceMeta, timestamp: string) {
    const existing = snapshots.value.get(meta.id);
    if (existing) return existing;

    const snapshot: MonitorDeviceSnapshot = {
      deviceId: meta.id,
      deviceName: meta.deviceName,
      channelId: meta.channelId,
      telemetry: {},
      clientAttributes: {},
      sharedAttributes: {},
      serverAttributes: {},
      lastUpdate: timestamp,
    };
    upsertSnapshot(snapshot);
    return snapshot;
  }

  function scheduleTrigger() {
    if (triggerScheduled) return;

    const now = Date.now();
    const elapsed = now - lastTriggerAt;
    const delay = Math.max(0, TRIGGER_MIN_INTERVAL_MS - elapsed);
    triggerScheduled = true;

    window.setTimeout(() => {
      triggerScheduled = false;
      lastTriggerAt = Date.now();
      flushHints();
      triggerRef(updateHints);
      triggerRef(snapshots);
    }, delay);
  }

  function addHint(
    deviceId: number,
    dataType: MonitorUpdateHint['dataType'],
    scope: MonitorUpdateHint['scope'],
    keys: string[],
  ) {
    if (!keys || keys.length === 0) return;
    const scopePart = scope ?? '';
    const mapKey = `${deviceId}|${dataType}|${scopePart}`;
    let set = pendingHintKeys.get(mapKey);
    if (!set) {
      set = new Set<string>();
      pendingHintKeys.set(mapKey, set);
    }
    for (const k of keys) set.add(k);
  }

  function flushHints() {
    if (pendingHintKeys.size === 0) {
      updateHints.value = [];
      return;
    }

    const next: MonitorUpdateHint[] = [];
    for (const [compound, keys] of pendingHintKeys.entries()) {
      const [deviceIdStr, dataTypeStr, scopeStr] = compound.split('|');
      const deviceId = Number(deviceIdStr);
      const dataType = dataTypeStr as MonitorUpdateHint['dataType'];
      const scope = (scopeStr || undefined) as MonitorUpdateHint['scope'];
      next.push({
        deviceId,
        dataType,
        scope,
        keys: [...keys],
      });
    }
    pendingHintKeys.clear();
    updateHints.value = next;
  }

  return {
    status,
    snapshots,
    updateHints,
    subscribedDeviceIds,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    ping,
  };
}
