import { describe, expect, it } from 'vitest';

import { useRequestHandler } from './use-request-handler';

describe('request completion owns asynchronous callbacks', () => {
  it('waits for schema initialization before completing a successful request', async () => {
    let release: () => void = () => {};
    const initialized = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    let finished = false;
    const request = useRequestHandler()
      .handleRequest(
        async () => 17,
        async () => {
          order.push('schema');
          await initialized;
          order.push('defaults');
        },
      )
      .then((result) => {
        finished = true;
        return result;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['schema']);
    expect(finished).toBe(false);
    release();
    expect(await request).toBe(17);
    expect(order).toEqual(['schema', 'defaults']);
  });

  it('waits for failed-write readback before completing recovery', async () => {
    let release: () => void = () => {};
    const readback = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failure = new Error('activation failed after persistence');
    let finished = false;
    let observed: unknown;
    const request = useRequestHandler()
      .handleRequest(
        async () => {
          throw failure;
        },
        undefined,
        async (error) => {
          observed = error;
          await readback;
        },
      )
      .then((result) => {
        finished = true;
        return result;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(observed).toBe(failure);
    expect(finished).toBe(false);
    release();
    expect(await request).toBeNull();
  });

  it('routes an asynchronous success-callback failure through the error callback', async () => {
    const failure = new Error('schema initialization failed');
    let observed: unknown;
    expect(
      await useRequestHandler().handleRequest(
        async () => true,
        async () => {
          await Promise.resolve();
          throw failure;
        },
        async (error) => {
          await Promise.resolve();
          observed = error;
        },
      ),
    ).toBeNull();
    expect(observed).toBe(failure);
  });
});
