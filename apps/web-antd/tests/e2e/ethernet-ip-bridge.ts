import type { Server, Socket } from 'node:net';

import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const MAX_FRAME_BYTES = 24 + 65_535;
const MAX_CONNECTIONS = 16;
const ENCAPSULATION_SEND_RR_DATA = 111;
const CPF_UNCONNECTED_DATA = 178;
const CIP_UNCONNECTED_SEND = 82;
const CIP_UNCONNECTED_SEND_REPLY = 210;
const CIP_WRITE_TAG = 77;
const CIP_WRITE_TAG_REPLY = 205;

/** One bounded frame at a time; no product codec is reused by this fault oracle. */
class FrameReader {
  private readonly iterator: AsyncIterator<Buffer>;
  private pending = Buffer.alloc(0);

  constructor(socket: Socket) {
    this.iterator = socket[Symbol.asyncIterator]();
  }

  async next(): Promise<Buffer | undefined> {
    for (;;) {
      if (this.pending.length >= 24) {
        const bytes = 24 + this.pending.readUInt16LE(2);
        if (this.pending.length >= bytes) {
          const frame = this.pending.subarray(0, bytes);
          this.pending = this.pending.subarray(bytes);
          return frame;
        }
      }
      const next = await this.iterator.next();
      if (next.done) {
        if (this.pending.length > 0)
          throw new Error('Truncated encapsulation frame');
        return undefined;
      }
      if (
        !Buffer.isBuffer(next.value) ||
        this.pending.length + next.value.length > 2 * MAX_FRAME_BYTES
      )
        throw new Error('Bridge receive capacity exceeded');
      this.pending = Buffer.concat([this.pending, next.value]);
    }
  }
}

function cipData(frame: Buffer): Buffer | undefined {
  if (frame.readUInt16LE(0) !== ENCAPSULATION_SEND_RR_DATA) return undefined;
  if (frame.length < 32) throw new Error('Truncated CPF header');
  const count = frame.readUInt16LE(30);
  if (count !== 2) throw new Error('Unexpected native CPF profile');
  let cursor = 32;
  let data: Buffer | undefined;
  for (let index = 0; index < count; index++) {
    if (cursor + 4 > frame.length) throw new Error('Truncated CPF item');
    const kind = frame.readUInt16LE(cursor);
    const length = frame.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > frame.length) throw new Error('Truncated CPF body');
    if (kind === CPF_UNCONNECTED_DATA) {
      if (data) throw new Error('Duplicate unconnected data');
      data = frame.subarray(cursor, cursor + length);
    }
    cursor += length;
  }
  if (cursor !== frame.length || !data) throw new Error('Incomplete CPF');
  return data;
}

function innerService(frame: Buffer): number | undefined {
  const cip = cipData(frame);
  if (!cip) return undefined;
  if (cip[0] !== CIP_UNCONNECTED_SEND) return cip[0];
  if (cip.length < 2) throw new Error('Truncated Unconnected Send');
  const start = 2 + cip.readUInt8(1) * 2 + 4;
  if (start > cip.length || start + cip.readUInt16LE(start - 2) > cip.length)
    throw new Error('Truncated embedded request');
  return cip[start];
}

function timeoutAfterConfirmedForward(
  request: Buffer,
  response: Buffer,
): Buffer {
  let cip = cipData(response);
  if (
    !cip ||
    response.readUInt32LE(8) !== 0 ||
    response.readUInt32LE(20) !== 0 ||
    !request.subarray(4, 8).equals(response.subarray(4, 8)) ||
    !request.subarray(12, 20).equals(response.subarray(12, 20))
  )
    throw new Error('Reference reply correlation failed');
  if (cip[0] === CIP_UNCONNECTED_SEND_REPLY && cip[2] === 0)
    cip = cip.subarray(4 + cip.readUInt8(3) * 2);
  if (
    cip.length !== 4 ||
    cip[0] !== CIP_WRITE_TAG_REPLY ||
    cip[1] !== 0 ||
    cip[2] !== 0 ||
    cip[3] !== 0
  )
    throw new Error(
      'Fault requires an actual successful native Write Tag reply',
    );
  const body = Buffer.from([
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    CPF_UNCONNECTED_DATA,
    0,
    6,
    0,
    CIP_UNCONNECTED_SEND_REPLY,
    0,
    1,
    1,
    4,
    2,
  ]);
  const result = Buffer.concat([response.subarray(0, 24), body]);
  result.writeUInt16LE(body.length, 2);
  return result;
}

/** A native peer applies the write; this bridge replaces only its returned envelope. */
export class CipTimeoutBridge {
  controlForwards = 0;
  readonly errors: string[] = [];
  injectedTimeouts = 0;
  get port(): number {
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Bridge has no owned listener');
    return address.port;
  }
  private armed = false;
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private stopping = false;

  private readonly tasks = new Set<Promise<void>>();

  private constructor(private readonly peerPort: number) {
    this.server = createServer({ highWaterMark: 64 * 1024 }, (front) => {
      if (this.stopping) {
        front.destroy();
        return;
      }
      if (this.tasks.size >= MAX_CONNECTIONS) {
        this.record('Bridge connection capacity exceeded');
        front.destroy();
        return;
      }
      const task = this.forward(front).finally(() => this.tasks.delete(task));
      this.tasks.add(task);
    });
  }

  static async start(peerPort: number): Promise<CipTimeoutBridge> {
    const bridge = new CipTimeoutBridge(peerPort);
    bridge.server.listen(0, '127.0.0.1');
    await once(bridge.server, 'listening');
    return bridge;
  }

  armTimeout(): void {
    if (this.armed || this.injectedTimeouts)
      throw new Error('The bridge fault can only be armed once');
    this.armed = true;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const closed = new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
    for (const socket of this.sockets) socket.destroy();
    const timer = new AbortController();
    try {
      await Promise.race([
        Promise.all([closed, ...this.tasks]),
        delay(5000, undefined, { signal: timer.signal }).then(() => {
          throw new Error('Bridge did not drain its owned transports');
        }),
      ]);
    } finally {
      timer.abort();
    }
    if (this.errors.length > 0) throw new Error(this.errors.join('\n'));
  }

  private async forward(front: Socket): Promise<void> {
    const back = createConnection({ host: '127.0.0.1', port: this.peerPort });
    for (const socket of [front, back]) {
      this.sockets.add(socket);
      socket.on('error', (error) => {
        if (!this.stopping && !front.destroyed) this.record(error.message);
      });
    }
    try {
      await once(back, 'connect', { signal: AbortSignal.timeout(2000) });
      const incoming = new FrameReader(front);
      const outgoing = new FrameReader(back);
      for (;;) {
        const request = await incoming.next();
        if (!request) break;
        const control = innerService(request) === CIP_WRITE_TAG;
        if (control) this.controlForwards++;
        await new Promise<void>((resolve, reject) => {
          back.write(request, (error) => (error ? reject(error) : resolve()));
        });
        let response = await outgoing.next();
        if (!response) throw new Error('Native peer ended before its reply');
        if (control && this.armed) {
          this.armed = false;
          response = timeoutAfterConfirmedForward(request, response);
          this.injectedTimeouts++;
        }
        await new Promise<void>((resolve, reject) => {
          front.write(response, (error) => (error ? reject(error) : resolve()));
        });
      }
    } catch (error) {
      if (!this.stopping && !front.destroyed)
        this.record(error instanceof Error ? error.message : String(error));
    } finally {
      front.destroy();
      back.destroy();
      this.sockets.delete(front);
      this.sockets.delete(back);
    }
  }

  private record(message: string): void {
    if (this.errors.length < 32) this.errors.push(message.slice(0, 1024));
  }
}
