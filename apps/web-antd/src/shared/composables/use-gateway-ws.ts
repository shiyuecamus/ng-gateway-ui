import type { GatewayWsConnectionStatus } from '@vben/types';

import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';

import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';
import { $t } from '#/locales';

export function buildWsUrl(endpoint: 'metrics' | 'monitor'): string {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const base = new URL(apiURL, window.location.origin);
  const url = new URL(base);
  url.pathname = `${base.pathname.replace(/\/$/, '')}/ws/${endpoint}`;
  url.search = '';
  url.hash = '';
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export interface UseGatewayWsOptions<ServerMsg extends { type: string }> {
  endpoint: 'metrics' | 'monitor';
  autoReconnectDelay?: number;
  /** Completion means the data was applied; only then may the batch be acknowledged. */
  onMessage?: (msg: ServerMsg) => Promise<void> | void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

interface Ticket {
  protocol: string;
  ticketProtocol: string;
  expiresInMs: number;
}

/** Each attempt obtains a fresh one-time ticket; neither JWTs nor tickets enter URLs. */
export function useGatewayWs<
  ServerMsg extends { type: string },
  ClientMsg extends { type: string },
>(options: UseGatewayWsOptions<ServerMsg>) {
  const accessStore = useAccessStore();
  const status = ref<GatewayWsConnectionStatus>('disconnected');
  const lastError = shallowRef<null | { code: string; message: string }>(null);
  const lastPongAt = ref(0);
  const lastPongRttMs = ref<null | number>(null);
  const wsStatus = ref<'CLOSED' | 'CONNECTING' | 'OPEN'>('CLOSED');
  let socket: null | WebSocket = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let requested = false;
  let generation = 0;
  let receiving = false;
  let lastSequence = 0n;
  let lastInbound = 0;
  let reconnectAttempts = 0;

  function clearTimers() {
    clearTimeout(timer);
    clearInterval(heartbeat);
    timer = undefined;
    heartbeat = undefined;
  }

  function invalidate() {
    options.onDisconnected?.();
    lastPongAt.value = 0;
    lastPongRttMs.value = null;
  }

  function reconnect() {
    if (!requested || !accessStore.accessToken) return;
    status.value = 'reconnecting';
    const delay = Math.min(
      30_000,
      (options.autoReconnectDelay ?? 1000) *
        2 ** Math.min(reconnectAttempts++, 5),
    );
    timer = setTimeout(() => void open(), delay + Math.random() * 250);
  }

  async function open() {
    if (
      !requested ||
      !accessStore.accessToken ||
      wsStatus.value === 'CONNECTING' ||
      wsStatus.value === 'OPEN'
    )
      return;
    const attempt = ++generation;
    wsStatus.value = 'CONNECTING';
    try {
      const endpoint = options.endpoint;
      const ticket = await requestClient.post<Ticket>('/auth/ws-ticket', {
        endpoint,
      });
      if (attempt !== generation || !requested || !accessStore.accessToken)
        return;
      const current = new WebSocket(buildWsUrl(options.endpoint), [
        ticket.protocol,
        ticket.ticketProtocol,
      ]);
      socket = current;
      current.addEventListener('open', () => {
        if (attempt !== generation) {
          current.close();
          return;
        }
        wsStatus.value = 'OPEN';
        status.value = 'connected';
        receiving = false;
        lastSequence = 0n;
        lastInbound = Date.now();
        reconnectAttempts = 0;
        lastError.value = null;
        options.onConnected?.();
        heartbeat = setInterval(() => {
          // Browser suspension or a lost network path invalidates presentation immediately on resume.
          if (Date.now() - lastInbound > 5000) {
            invalidate();
            current.close();
            return;
          }
          ping();
        }, 2000);
      });
      current.addEventListener('message', async (event: MessageEvent) => {
        if (attempt !== generation || current !== socket) return;
        try {
          if (typeof event.data !== 'string') throw new Error('invalid frame');
          if (Date.now() - lastInbound > 5000)
            throw new Error('stale transport');
          const message = JSON.parse(event.data);
          lastInbound = Date.now();
          if (message.type === 'batch') {
            if (
              receiving ||
              typeof message.sequence !== 'string' ||
              !/^[1-9]\d*$/.test(message.sequence) ||
              !Array.isArray(message.messages) ||
              message.messages.length === 0
            )
              throw new Error('invalid batch');
            const sequence = BigInt(message.sequence);
            if (sequence !== lastSequence + 1n)
              throw new Error('out-of-order batch');
            receiving = true;
            for (const item of message.messages) {
              if (attempt !== generation || current !== socket) return;
              if (typeof item?.type !== 'string')
                throw new Error('invalid message');
              await options.onMessage?.(item as ServerMsg);
            }
            if (
              attempt !== generation ||
              current !== socket ||
              current.readyState !== WebSocket.OPEN
            )
              return;
            lastSequence = sequence;
            current.send(
              JSON.stringify({ type: 'ack', sequence: message.sequence }),
            );
            receiving = false;
          } else {
            if (message.type === 'pong') {
              lastPongAt.value = Date.now();
              lastPongRttMs.value = Math.max(
                0,
                Date.now() - Number(message.ts),
              );
            } else if (message.type === 'error') {
              lastError.value = {
                code: message.code,
                message: $t('authentication.streamSnapshotRequired'),
              };
              if (
                ['invalid_stream_request', 'permission_revoked'].includes(
                  message.code,
                )
              )
                requested = false;
              invalidate();
            }
            await options.onMessage?.(message as ServerMsg);
          }
        } catch {
          // A consumer may finish after disconnect/reconnect; only its own live
          // connection may invalidate presentation or publish an error.
          if (attempt !== generation || current !== socket) return;
          lastError.value = {
            code: 'snapshot_required',
            message: $t('authentication.streamSnapshotRequired'),
          };
          invalidate();
          current.close(1008, 'snapshot_required');
        }
      });
      current.addEventListener('error', () => {
        if (attempt !== generation || current !== socket) return;
        lastError.value = {
          code: 'connection_failed',
          message: $t('authentication.streamConnectionFailed'),
        };
      });
      current.addEventListener('close', () => {
        if (attempt !== generation || current !== socket) return;
        clearTimers();
        socket = null;
        wsStatus.value = 'CLOSED';
        invalidate();
        status.value = 'disconnected';
        reconnect();
      });
    } catch (error) {
      if (attempt !== generation) return;
      wsStatus.value = 'CLOSED';
      invalidate();
      lastError.value = {
        code: 'ticket_failed',
        message: $t('authentication.streamConnectionFailed'),
      };
      const responseStatus = (error as { response?: { status?: number } })
        .response?.status;
      if (responseStatus === 401 || responseStatus === 403) {
        requested = false;
        status.value = 'disconnected';
      } else reconnect();
    }
  }

  function connect() {
    requested = true;
    if (status.value === 'disconnected') status.value = 'connecting';
    void open();
  }
  function disconnect() {
    requested = false;
    ++generation;
    clearTimers();
    socket?.close();
    socket = null;
    wsStatus.value = 'CLOSED';
    status.value = 'disconnected';
    invalidate();
  }
  function sendMessage(payload: ClientMsg) {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(payload));
  }
  function ping() {
    const ts = Date.now();
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'ping', ts }));
    return ts;
  }
  watch(
    () => accessStore.accessToken,
    () => disconnect(),
  );
  onScopeDispose(disconnect);
  return {
    status,
    isConnected: computed(() => status.value === 'connected'),
    lastError,
    lastPongAt,
    lastPongRttMs,
    connect,
    disconnect,
    sendMessage,
    ping,
    wsStatus,
  };
}
