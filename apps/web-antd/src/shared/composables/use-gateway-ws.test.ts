import { effectScope, nextTick, reactive } from 'vue';

import { useAccessStore } from '@vben/stores';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGatewayWs } from './use-gateway-ws';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  access: { accessToken: 'fixture' },
}));
vi.mock('#/api/request', () => ({ requestClient: { post: mocks.post } }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: 'http://gateway.test/custom-api' }),
}));
vi.mock('@vben/stores', () => {
  const store = reactive(mocks.access);
  return { useAccessStore: () => store };
});

class Socket extends EventTarget {
  static instances: Socket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: unknown[] = [];
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    super();
    Socket.instances.push(this);
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
}
const scopes: ReturnType<typeof effectScope>[] = [];
function setup(
  onMessage = vi.fn<(_: { type: string }) => Promise<void> | void>(),
  onDisconnected = vi.fn(),
) {
  const scope = effectScope();
  scopes.push(scope);
  const api = scope.run(() =>
    useGatewayWs<{ type: string }, { type: 'subscribe' }>({
      endpoint: 'metrics',
      onMessage,
      onDisconnected,
    }),
  );
  if (!api) throw new Error('missing effect scope');
  return api;
}
function lastSocket() {
  const socket = Socket.instances.at(-1);
  if (!socket) throw new Error('missing socket');
  return socket;
}
async function settle() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  useAccessStore().accessToken = 'fixture';
  mocks.post.mockReset().mockResolvedValue({
    protocol: 'ng-gateway-boot',
    ticketProtocol: 'ng-ticket.one',
    expiresInMs: 30_000,
  });
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('gateway stream ownership', () => {
  it('acknowledges only after application acceptance and rejects missing sequence coverage', async () => {
    let accept: (() => void) | undefined;
    const handled = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const api = setup(handled);
    api.connect();
    await settle();
    const socket = lastSocket();
    socket.open();
    expect(socket.url).toBe('ws://gateway.test/custom-api/ws/metrics');
    expect(socket.url).not.toContain('fixture');
    socket.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'snapshot' }],
    });
    await settle();
    expect(socket.sent).toEqual([]);
    accept?.();
    await settle();
    expect(socket.sent).toEqual([{ type: 'ack', sequence: '1' }]);
    socket.receive({
      type: 'batch',
      sequence: '3',
      messages: [{ type: 'snapshot' }],
    });
    await settle();
    expect(api.isConnected.value).toBe(false);
  });

  it('does not open an upgrade after cancellation while its ticket is pending', async () => {
    let grant: ((ticket: unknown) => void) | undefined;
    mocks.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const api = setup();
    api.connect();
    api.disconnect();
    grant?.({
      protocol: 'ng-gateway-boot',
      ticketProtocol: 'ng-ticket.late',
      expiresInMs: 30_000,
    });
    await settle();
    expect(Socket.instances).toHaveLength(0);
    api.connect();
    await settle();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(lastSocket().protocols).toEqual([
      'ng-gateway-boot',
      'ng-ticket.one',
    ]);
  });

  it('ignores late failures from a previous connection after a new baseline is admitted', async () => {
    let reject: ((error: Error) => void) | undefined;
    const disconnected = vi.fn();
    const handler = vi
      .fn<(_: { type: string }) => Promise<void> | void>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          }),
      );
    const api = setup(handler, disconnected);
    api.connect();
    await settle();
    const old = lastSocket();
    old.open();
    old.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'snapshot' }],
    });
    api.disconnect();
    api.connect();
    await settle();
    const current = lastSocket();
    current.open();
    current.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'snapshot' }],
    });
    await settle();
    expect(current.sent).toEqual([{ type: 'ack', sequence: '1' }]);
    disconnected.mockClear();
    reject?.(new Error('old consumer failed'));
    await settle();
    expect(api.isConnected.value).toBe(true);
    expect(api.lastError.value).toBeNull();
    expect(disconnected).not.toHaveBeenCalled();
    expect(old.sent).toEqual([]);
  });

  it('discards late acceptance and the remaining messages of an obsolete batch', async () => {
    let accept: (() => void) | undefined;
    const handler = vi
      .fn<(_: { type: string }) => Promise<void> | void>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            accept = resolve;
          }),
      );
    const api = setup(handler);
    api.connect();
    await settle();
    const old = lastSocket();
    old.open();
    old.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'first' }, { type: 'obsolete' }],
    });
    api.disconnect();
    api.connect();
    await settle();
    const current = lastSocket();
    current.open();
    current.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'current' }],
    });
    await settle();
    accept?.();
    await settle();
    expect(handler.mock.calls.map(([message]) => message.type)).toEqual([
      'first',
      'current',
    ]);
    expect(old.sent).toEqual([]);
    expect(current.sent).toEqual([{ type: 'ack', sequence: '1' }]);
    expect(api.isConnected.value).toBe(true);
  });

  it('ignores late callbacks after a transport close while reconnect is pending', async () => {
    let reject: ((error: Error) => void) | undefined;
    const disconnected = vi.fn();
    const api = setup(
      vi.fn(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          }),
      ),
      disconnected,
    );
    api.connect();
    await settle();
    const old = lastSocket();
    old.open();
    old.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'snapshot' }],
    });
    old.close();
    disconnected.mockClear();
    old.dispatchEvent(new Event('error'));
    old.dispatchEvent(new Event('close'));
    reject?.(new Error('closed consumer'));
    await settle();
    expect(api.status.value).toBe('reconnecting');
    expect(api.lastError.value).toBeNull();
    expect(disconnected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(Socket.instances).toHaveLength(2);
  });

  it('invalidates a rejected current batch without acknowledging it', async () => {
    const api = setup(
      vi.fn().mockRejectedValue(new Error('snapshot rejected')),
    );
    api.connect();
    await settle();
    const socket = lastSocket();
    socket.open();
    socket.receive({
      type: 'batch',
      sequence: '1',
      messages: [{ type: 'snapshot' }],
    });
    await settle();
    expect(socket.sent).toEqual([]);
    expect(socket.readyState).toBe(3);
    expect(api.lastError.value?.code).toBe('snapshot_required');
    expect(api.isConnected.value).toBe(false);
  });

  it('closes immediately when its login identity changes and stops reconnecting', async () => {
    const api = setup();
    api.connect();
    await settle();
    const socket = lastSocket();
    socket.open();
    useAccessStore().accessToken = null;
    await settle();
    expect(socket.readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});
