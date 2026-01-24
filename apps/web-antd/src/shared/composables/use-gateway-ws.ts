import type { GatewayWsConnectionStatus } from '@vben/types';

import { computed, ref, shallowRef } from 'vue';

import { useWebSocket } from '@vueuse/core';

import { baseRequestClient } from '#/api/request';

/**
 * Builds the WebSocket URL based on the current API base URL.
 * Defaults to current origin if baseURL is not absolute.
 */
export function buildWsUrl(endpoint: string): string {
  const baseURL = (baseRequestClient as any).defaults?.baseURL as
    | string
    | undefined;

  // If baseURL is not set, use window.location.origin
  const base = baseURL ?? window.location.origin;

  // Handle relative baseURL (e.g. "/api")
  const httpBase = new URL(base, window.location.origin);

  // Construct WS URL
  const wsUrl = new URL(endpoint, httpBase.origin);
  wsUrl.protocol = httpBase.protocol === 'https:' ? 'wss:' : 'ws:';

  return wsUrl.toString();
}

export interface UseGatewayWsOptions<
  ServerMsg extends { type: string },
> {
  endpoint: string;
  autoReconnectDelay?: number;
  /**
   * Optional handler for incoming messages.
   * Return true to indicate the message was handled.
   */
  onMessage?: (msg: ServerMsg) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useGatewayWs<
  ServerMsg extends { type: string } = any,
  ClientMsg extends { type: string } = any,
>(options: UseGatewayWsOptions<ServerMsg>) {
  const status = ref<GatewayWsConnectionStatus>('disconnected');
  const lastError = shallowRef<null | { code: string; message: string }>(null);

  // Ping/Pong RTT
  const lastPongAt = ref<number>(0);
  const lastPongRttMs = ref<null | number>(null);
  let lastPingSentAt: null | number = null;

  const {
    status: wsStatus,
    open: openWs,
    close: closeWs,
    send,
  } = useWebSocket(buildWsUrl(options.endpoint), {
    immediate: false,
    autoReconnect: {
      delay: options.autoReconnectDelay ?? 1000,
    },
    onConnected() {
      status.value = 'connected';
      lastError.value = null;
      options.onConnected?.();
    },
    onDisconnected() {
      // If we were connected, we are now reconnecting (unless manually closed)
      // The wrapper logic for 'reconnecting' vs 'disconnected' is usually
      // handled by the consumer depending on whether *they* called disconnect.
      // But useWebSocket auto-reconnects, so 'reconnecting' is a fair default state
      // if it dropped unexpectedly. However, useWebSocket status goes to CLOSED.
      // We'll let the specific implementation refine this if needed,
      // but generally if we didn't call disconnect(), we are reconnecting.
      status.value =
        status.value === 'connected' ? 'reconnecting' : 'disconnected';
      options.onDisconnected?.();
    },
    onMessage(_, event) {
      try {
        const msg = JSON.parse(event.data);

        // Handle standard messages
        if (msg.type === 'pong') {
          const now = Date.now();
          const base = Number(msg.ts) || lastPingSentAt || now;
          const rtt = Math.max(0, now - base);
          lastPongAt.value = now;
          lastPongRttMs.value = rtt;
        } else if (msg.type === 'error') {
          lastError.value = { code: msg.code, message: msg.message };
        }

        options.onMessage?.(msg);
      } catch {
        // ignore invalid frames
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
    status.value = 'disconnected';
    closeWs();
  }

  function sendMessage(payload: ClientMsg) {
    if (wsStatus.value !== 'OPEN') return;
    send(JSON.stringify(payload));
  }

  function ping() {
    const ts = Date.now();
    lastPingSentAt = ts;
    // We assume the ClientMsg type can handle a ping message, or we cast it
    sendMessage({ type: 'ping', ts } as any);
    return ts;
  }

  const isConnected = computed(() => status.value === 'connected');

  return {
    status,
    isConnected,
    lastError,
    lastPongAt,
    lastPongRttMs,
    connect,
    disconnect,
    sendMessage,
    ping,
    wsStatus, // Expose raw status if needed
  };
}
