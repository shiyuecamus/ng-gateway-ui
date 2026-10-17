import type { Server, Socket } from 'node:net';

import type { MonitorPointEntry } from '@vben/types';

import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { createServer } from 'node:net';

/** A bounded MQTT 3.1.1 peer records real QoS 1 publications from the native plugin. */
export class MqttTimePeer {
  private readonly clients = new Set<Socket>();
  private readonly entries: { sample: MonitorPointEntry; ts: number }[] = [];
  private failure?: Error;
  private server?: Server;

  observations() {
    if (this.failure) throw this.failure;
    return this.entries;
  }

  async start(): Promise<number> {
    this.server = createServer((client) => {
      if (this.clients.size >= 4) {
        client.destroy();
        return;
      }
      this.clients.add(client);
      let buffered = Buffer.alloc(0);
      client.on('data', (bytes: Buffer) => {
        try {
          if (buffered.length + bytes.length > 131_072)
            throw new Error('MQTT receive byte budget exceeded');
          buffered = Buffer.concat([buffered, bytes]);
          while (buffered.length > 1) {
            let size = 0;
            let factor = 1;
            let cursor = 1;
            let complete = false;
            for (; cursor < buffered.length && cursor <= 4; cursor += 1) {
              const byte = buffered[cursor];
              if (byte === undefined) break;
              size += (byte & 127) * factor;
              if ((byte & 128) === 0) {
                cursor += 1;
                complete = true;
                break;
              }
              factor *= 128;
            }
            if (!complete) break;
            if (size > 65_536)
              throw new Error('MQTT packet byte budget exceeded');
            if (buffered.length < cursor + size) break;
            this.receive(
              client,
              buffered[0] ?? 0,
              buffered.subarray(cursor, cursor + size),
            );
            buffered = buffered.subarray(cursor + size);
          }
        } catch (error) {
          this.failure =
            error instanceof Error ? error : new Error(String(error));
          client.destroy();
        }
      });
      client.on('error', (error) => {
        this.failure = error;
        client.destroy();
      });
      client.on('close', () => this.clients.delete(client));
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing MQTT peer port');
    return address.port;
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.destroy();
    if (this.server) {
      const closed = once(this.server, 'close');
      this.server.close();
      await closed;
    }
  }

  private receive(client: Socket, header: number, body: Buffer): void {
    switch (header >> 4) {
      case 1: {
        client.write(Buffer.from([32, 2, 0, 0]));
        break;
      }
      case 3: {
        if (body.length < 2) throw new Error('Short MQTT publication');
        const end = 2 + body.readUInt16BE(0);
        const qos = (header >> 1) & 3;
        const start = end + (qos > 0 ? 2 : 0);
        if (body.length < start)
          throw new Error('Short MQTT publication identity');
        if (qos === 1) {
          const id = body.readUInt16BE(end);
          client.write(Buffer.from([64, 2, id >> 8, id & 255]));
        }
        if (body.subarray(2, end).toString() === 'v1/gateway/telemetry') {
          const data = JSON.parse(body.subarray(start).toString()) as Record<
            string,
            { ts: number; values: Record<string, MonitorPointEntry> }[]
          >;
          for (const group of Object.values(data).flat()) {
            const sample = group.values['steady-value'];
            if (sample) {
              if (this.entries.length >= 256)
                throw new Error('MQTT observation count budget exceeded');
              this.entries.push({ sample, ts: group.ts });
            }
          }
        }
        break;
      }
      case 8: {
        if (body.length < 5) throw new Error('Short MQTT subscription');
        const id = body.readUInt16BE(0);
        const grants: number[] = [];
        let cursor = 2;
        while (cursor < body.length) {
          if (cursor + 2 > body.length) throw new Error('Short MQTT topic');
          const size = body.readUInt16BE(cursor);
          cursor += size + 2;
          const qos = body[cursor];
          if (qos === undefined) throw new Error('Short MQTT QoS');
          grants.push(Math.min(qos, 1));
          cursor += 1;
        }
        const reply = Buffer.from([id >> 8, id & 255, ...grants]);
        client.write(Buffer.concat([Buffer.from([144, reply.length]), reply]));
        break;
      }
      case 12: {
        client.write(Buffer.from([208, 0]));
        break;
      }
      case 14: {
        break;
      }
      default: {
        throw new Error(`Unexpected MQTT packet type ${header >> 4}`);
      }
    }
  }
}
