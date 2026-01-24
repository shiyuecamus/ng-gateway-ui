import type {
  BaseClientMessage,
  WsPingMessage,
  WsPongMessage,
  WsUnsubscribeMessage,
} from '@vben/types';

import type {
  MonitorDeviceSnapshot,
  MonitorUpdateHint,
} from '#/views/maintenance/monitor/modules/types';

import { shallowRef, triggerRef } from 'vue';

import { useGatewayWs } from './use-gateway-ws';

interface SubscribePayload extends BaseClientMessage {
  type: 'subscribe';
  channelId?: number;
  deviceId?: number;
  deviceIds?: number[];
}

type ClientMessage = SubscribePayload | WsPingMessage | WsUnsubscribeMessage;

type ServerMessage =
  | WsPongMessage
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
    };

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
    ServerMessage,
    ClientMessage
  >({
    endpoint: '/api/ws/monitor',
    onConnected() {
      if (subscribedDeviceIds.value.length > 0) {
        // Re-subscribe on reconnect
        const ids = subscribedDeviceIds.value;
        const payload: SubscribePayload = {
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
    snapshots.value = new Map();
    updateHints.value = [];
    pendingHintKeys.clear();
    sendMessage({ type: 'unsubscribe', requestId: `${Date.now()}` });
  }

  function handleServerMessage(msg: ServerMessage) {
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
