import type {
  MonitorConnectionStatus,
  MonitorDeviceSnapshot,
  MonitorUpdateHint,
} from './types';

import { ref, shallowRef, triggerRef } from 'vue';

import { useWebSocket } from '@vueuse/core';

import { baseRequestClient } from '#/api/request';

interface SubscribePayload {
  type: 'subscribe';
  channelId?: number;
  deviceId?: number;
  deviceIds?: number[];
  requestId?: string;
}

interface UnsubscribePayload {
  type: 'unsubscribe';
  requestId?: string;
}

interface PingPayload {
  type: 'ping';
  ts: number;
}

type ClientMessage = PingPayload | SubscribePayload | UnsubscribePayload;

type ServerMessage =
  | {
      attributes: {
        client: Record<string, unknown>;
        server: Record<string, unknown>;
        shared: Record<string, unknown>;
      };
      device: {
        channelId: number;
        deviceName: string;
        id: number;
      };
      lastUpdate: string;
      telemetry: Record<string, unknown>;
      type: 'snapshot';
    }
  | {
      code: string;
      details?: any;
      message: string;
      type: 'error';
    }
  | {
      dataType: 'attributes' | 'telemetry';
      deviceId: number;
      scope?: string;
      timestamp: string;
      type: 'update';
      values: any;
    }
  | {
      deviceIds: number[];
      requestId?: string;
      type: 'subscribed';
    }
  | {
      ts: number;
      type: 'pong';
    };

function buildWsUrl(): string {
  const baseURL = (baseRequestClient as any).defaults?.baseURL as
    | string
    | undefined;
  const url = baseURL ?? window.location.origin;
  const wsScheme = url.startsWith('https') ? 'wss' : 'ws';
  const httpScheme = url.startsWith('https') ? 'https' : 'http';

  const normalized = url.replace(`${httpScheme}:`, `${wsScheme}:`);
  return `${normalized}/api/ws/monitor`;
}

export function useMonitorWs() {
  const status = ref<MonitorConnectionStatus>('disconnected');
  const snapshots = shallowRef<Map<number, MonitorDeviceSnapshot>>(new Map());
  const subscribedDeviceIds = ref<number[]>([]);
  // Hints about which keys changed since last UI trigger.
  // Used by monitor table to append new keys without scanning all snapshots.
  const updateHints = shallowRef<MonitorUpdateHint[]>([]);
  const pendingHintKeys = new Map<string, Set<string>>();

  // Throttle UI notifications: avoid triggering reactive updates per WS frame.
  let triggerScheduled = false;
  let lastTriggerAt = 0;
  const TRIGGER_MIN_INTERVAL_MS = 200;

  const {
    status: wsStatus,
    open: openWs,
    close: closeWs,
    send,
  } = useWebSocket(buildWsUrl(), {
    immediate: false,
    autoReconnect: {
      delay: 1000,
    },
    onConnected() {
      status.value = 'connected';
      if (subscribedDeviceIds.value.length > 0) {
        subscribe(subscribedDeviceIds.value);
      }
    },
    onDisconnected() {
      status.value =
        subscribedDeviceIds.value.length > 0 ? 'reconnecting' : 'disconnected';
    },
    onMessage(_, event) {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        handleServerMessage(msg);
      } catch {
        // ignore invalid messages
      }
    },
  });

  function connect() {
    if (wsStatus.value === 'OPEN' || wsStatus.value === 'CONNECTING') return;
    status.value =
      status.value === 'disconnected' ? 'connecting' : 'reconnecting';
    openWs();
  }

  function disconnect() {
    subscribedDeviceIds.value = [];
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();
    status.value = 'disconnected';
    closeWs();
  }

  function sendMessage(payload: ClientMessage) {
    if (wsStatus.value !== 'OPEN') {
      console.warn(
        '[monitor-ws] Skip send, socket is not open:',
        wsStatus.value,
        payload.type,
      );
      return;
    }
    send(JSON.stringify(payload));
  }

  function subscribe(deviceIds: number | number[], channelId?: number) {
    const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
    subscribedDeviceIds.value = [...ids];
    // Clear stale snapshots when updating the subscription set so that
    // the grid only reflects the currently subscribed devices.
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();
    const payload: SubscribePayload = {
      type: 'subscribe',
      channelId,
      deviceIds: ids,
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    sendMessage(payload);
  }

  function unsubscribe() {
    subscribedDeviceIds.value = [];
    // When fully unsubscribing, clear all cached snapshots.
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();
    sendMessage({ type: 'unsubscribe', requestId: `${Date.now()}` });
  }

  function ping() {
    sendMessage({ type: 'ping', ts: Date.now() });
  }

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'error': {
        // 这里只做简单日志，具体 UI 提示交给调用方
        console.error('[monitor-ws] error', msg.code, msg.message, msg.details);
        break;
      }
      case 'pong': {
        // no-op
        break;
      }
      case 'snapshot': {
        const snapshot: MonitorDeviceSnapshot = {
          deviceId: msg.device.id,
          deviceName: msg.device.deviceName,
          channelId: msg.device.channelId,
          telemetry: msg.telemetry ?? {},
          clientAttributes: msg.attributes?.client ?? {},
          sharedAttributes: msg.attributes?.shared ?? {},
          serverAttributes: msg.attributes?.server ?? {},
          lastUpdate: msg.lastUpdate,
        };
        snapshots.value.set(snapshot.deviceId, snapshot);
        scheduleTrigger();
        break;
      }
      case 'subscribed': {
        subscribedDeviceIds.value = msg.deviceIds;
        break;
      }
      case 'update': {
        const existing = snapshots.value.get(msg.deviceId);
        if (!existing) break;

        if (msg.dataType === 'telemetry') {
          // In-place merge to reduce allocations/GC pressure under high frequency updates.
          Object.assign(existing.telemetry, msg.values ?? {});
          addHint(
            msg.deviceId,
            'telemetry',
            undefined,
            Object.keys(msg.values ?? {}),
          );
        } else if (msg.dataType === 'attributes') {
          const values = msg.values ?? {};
          Object.assign(existing.clientAttributes, values.client ?? {});
          Object.assign(existing.sharedAttributes, values.shared ?? {});
          Object.assign(existing.serverAttributes, values.server ?? {});
          addHint(
            msg.deviceId,
            'attributes',
            'client',
            Object.keys(values.client ?? {}),
          );
          addHint(
            msg.deviceId,
            'attributes',
            'shared',
            Object.keys(values.shared ?? {}),
          );
          addHint(
            msg.deviceId,
            'attributes',
            'server',
            Object.keys(values.server ?? {}),
          );
        }

        existing.lastUpdate = msg.timestamp;
        // snapshots.value.set(existing.deviceId, { ...existing });
        // Map holds reference, no need to set again if we modified object in place.
        // But wait, existing is a reference to the object inside the map?
        // Yes, existing = snapshots.value.get(...) returns reference.
        // But we modified existing in place above (existing.telemetry = ...).
        // So we just need to trigger.
        scheduleTrigger();
        break;
      }
    }
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
