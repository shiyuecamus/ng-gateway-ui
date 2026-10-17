import type {
  MonitorClientMessage,
  MonitorDeviceSnapshot,
  MonitorServerMessage,
  MonitorUpdateHint,
} from '@vben/types';

import { shallowRef, triggerRef } from 'vue';

import { requestId as newRequestId } from '../request-id';
import { useGatewayWs } from './use-gateway-ws';

export function useMonitorWs() {
  const snapshots = shallowRef<Map<number, MonitorDeviceSnapshot>>(new Map());
  const subscribedDeviceIds = shallowRef<number[]>([]);
  const updateHints = shallowRef<MonitorUpdateHint[]>([]);
  let channelId: number | undefined;
  let subscriptionId = '';
  const baselineDevices = new Set<number>();
  // Stream currency is distinct from the quality/freshness reported by the gateway.
  const baselineAccepted = shallowRef(false);

  const { status, lastError, connect, disconnect, sendMessage, ping } =
    useGatewayWs<MonitorServerMessage, MonitorClientMessage>({
      endpoint: 'monitor',
      onConnected() {
        baselineAccepted.value = false;
        if (subscribedDeviceIds.value.length > 0) sendSubscription();
      },
      onDisconnected() {
        baselineAccepted.value = false;
        triggerRef(snapshots);
      },
      onMessage(message) {
        handleServerMessage(message);
      },
    });

  function sendSubscription() {
    subscriptionId = newRequestId();
    baselineDevices.clear();
    sendMessage({
      type: 'subscribe',
      channelId,
      deviceIds: [...subscribedDeviceIds.value],
      requestId: subscriptionId,
    });
  }
  function subscribe(ids: number | number[], channel?: number) {
    channelId = channel;
    subscribedDeviceIds.value = Array.isArray(ids) ? [...new Set(ids)] : [ids];
    snapshots.value = new Map();
    updateHints.value = [];
    baselineAccepted.value = false;
    sendSubscription();
  }
  function unsubscribe() {
    subscriptionId = newRequestId();
    baselineDevices.clear();
    subscribedDeviceIds.value = [];
    snapshots.value = new Map();
    updateHints.value = [];
    baselineAccepted.value = false;
    sendMessage({ type: 'unsubscribe', requestId: subscriptionId });
  }
  function handleServerMessage(message: MonitorServerMessage) {
    switch (message.type) {
      case 'error': {
        baselineAccepted.value = false;
        break;
      }
      case 'pong':
      case 'subscribed': {
        break;
      }
      case 'snapshot': {
        // Frames for the previous selection cannot repopulate a newly selected device view.
        if (
          message.requestId !== subscriptionId ||
          !subscribedDeviceIds.value.includes(message.meta.id)
        )
          return;
        snapshots.value.set(message.meta.id, {
          deviceId: message.meta.id,
          deviceName: message.meta.deviceName,
          channelId: message.meta.channelId,
          telemetry: message.telemetry,
          clientAttributes: message.attributes.client,
          sharedAttributes: message.attributes.shared,
          serverAttributes: message.attributes.server,
          lastUpdate: message.lastUpdate ?? '',
        });
        baselineDevices.add(message.meta.id);
        baselineAccepted.value = subscribedDeviceIds.value.every((id) =>
          baselineDevices.has(id),
        );
        updateHints.value = [
          {
            deviceId: message.meta.id,
            dataType: 'telemetry',
            keys: Object.keys(message.telemetry),
          },
          ...(['client', 'shared', 'server'] as const).map((scope) => ({
            deviceId: message.meta.id,
            dataType: 'attributes' as const,
            scope,
            keys: Object.keys(message.attributes[scope]),
          })),
        ];
        triggerRef(snapshots);
        break;
      }
      default: {
        throw new Error('Unknown monitor message');
      }
    }
  }
  return {
    status,
    lastError,
    baselineAccepted,
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
