import type { ChildProcess } from 'node:child_process';
import type { Server, Socket } from 'node:net';

import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_IEC61850_CONTROL_PEER_BIN;
const peerSource = process.env.NG_IEC61850_PEER_SOURCE;
const opcuaProbeBinary = process.env.NG_OPCUA_WRITE_PROBE_BIN;
test.skip(
  !peerBinary || !peerSource || !opcuaProbeBinary,
  'Requires the fixed-commit IEC peer and prebuilt independent OPC UA client',
);

async function reservePort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  listener.close();
  await once(listener, 'close');
  return address.port;
}

async function startPeer(port: number): Promise<ChildProcess> {
  if (!peerBinary) throw new Error('Missing IEC control peer');
  const peer = spawn(peerBinary, ['server', 'ed2', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  peer.stderr?.on('data', (bytes) => (stderr += String(bytes)));
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        let output = '';
        peer.stdout?.on('data', (bytes) => {
          output += String(bytes);
          if (output.includes('READY\n')) resolve();
        });
        peer.once('exit', (code) =>
          reject(new Error(`Peer exited ${code}: ${stderr}`)),
        );
      }),
      delay(5000).then(() => {
        throw new Error(`IEC control peer startup timed out: ${stderr}`);
      }),
    ]);
    return peer;
  } catch (error) {
    peer.kill('SIGTERM');
    throw error;
  }
}

async function stopPeer(peer: ChildProcess): Promise<void> {
  if (peer.exitCode !== null || peer.signalCode !== null) return;
  const exited = once(peer, 'exit');
  peer.kill('SIGTERM');
  await Promise.race([
    exited,
    delay(5000).then(() => {
      peer.kill('SIGKILL');
      throw new Error('IEC control peer did not confirm shutdown');
    }),
  ]);
}

async function probeAnonymousOpcUa(
  endpoint: string,
  namespaceUri: string,
  nodePath: string,
  mode: 'absent' | 'present' | 'write',
): Promise<void> {
  if (!opcuaProbeBinary) throw new Error('Missing prebuilt OPC UA client');
  const probe = spawn(opcuaProbeBinary, ['--ignored', '--nocapture'], {
    env: {
      ...process.env,
      NG_UA_TEST_ENDPOINT: endpoint,
      NG_UA_TEST_NAMESPACE_URI: namespaceUri,
      NG_UA_TEST_NODE_PATH: nodePath,
      NG_UA_TEST_MODE: mode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const pipe of [probe.stdout, probe.stderr]) {
    pipe?.on('data', (bytes) => {
      output += String(bytes);
      if (output.length > 1_000_000) probe.kill('SIGTERM');
    });
  }
  const exited = once(probe, 'exit');
  const result = await Promise.race([
    exited,
    delay(30_000).then(() => {
      probe.kill('SIGKILL');
      throw new Error(
        `Anonymous OPC UA probe timed out: ${output.slice(-4000)}`,
      );
    }),
  ]);
  const marker =
    mode === 'write'
      ? 'OPC_UA_ANONYMOUS_WRITE=Good'
      : `OPC_UA_SCOPE_${mode.toUpperCase()}=`;
  if (result[0] !== 0 || !output.includes(marker)) {
    throw new Error(
      `Anonymous OPC UA ${mode} probe failed: ${output.slice(-8000)}`,
    );
  }
}

function encodedLength(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 128;
    bytes.push(digit);
  } while (value > 0);
  return Buffer.from(bytes);
}

function mqttPacket(header: number, body: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([header]),
    encodedLength(body.length),
    body,
  ]);
}

interface Publication {
  topic: string;
  value: unknown;
}

class MqttPeer {
  readonly publications: Publication[] = [];
  readonly subscriptions = new Set<string>();
  private readonly clients = new Set<Socket>();
  private current?: Socket;
  private failure?: Error;
  private packetId = 1;
  private server?: Server;

  publish(topic: string, value: unknown): void {
    if (this.failure) throw this.failure;
    const client = this.current;
    if (!client || client.destroyed)
      throw new Error('MQTT gateway is disconnected');
    const name = Buffer.from(topic);
    const payload = Buffer.from(JSON.stringify(value));
    const id = this.packetId++;
    const body = Buffer.concat([
      Buffer.from([name.length >> 8, name.length & 255]),
      name,
      Buffer.from([id >> 8, id & 255]),
      payload,
    ]);
    client.write(mqttPacket(50, body));
  }

  response(id: number): any {
    if (this.failure) throw this.failure;
    return this.publications.find(
      (message) =>
        message.topic === 'v1/gateway/rpc' &&
        typeof message.value === 'object' &&
        message.value !== null &&
        (message.value as { id?: number }).id === id,
    )?.value;
  }

  async start(): Promise<number> {
    this.server = createServer((client) => {
      this.clients.add(client);
      this.current = client;
      let buffered = Buffer.alloc(0);
      client.on('data', (incoming: Buffer) => {
        buffered = Buffer.concat([buffered, incoming]);
        try {
          while (buffered.length > 1) {
            let length = 0;
            let factor = 1;
            let cursor = 1;
            let complete = false;
            for (; cursor < buffered.length && cursor <= 4; cursor += 1) {
              const digit = buffered[cursor];
              if (digit === undefined) break;
              length += (digit & 127) * factor;
              if ((digit & 128) === 0) {
                complete = true;
                cursor += 1;
                break;
              }
              factor *= 128;
            }
            if (!complete) break;
            if (length > 65_536)
              throw new Error('MQTT peer packet budget exceeded');
            if (buffered.length < cursor + length) break;
            this.receive(
              client,
              buffered[0] ?? 0,
              buffered.subarray(cursor, cursor + length),
            );
            buffered = buffered.subarray(cursor + length);
          }
        } catch (error) {
          this.failure =
            error instanceof Error ? error : new Error(String(error));
          client.destroy();
        }
      });
      client.on('close', () => this.clients.delete(client));
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('No broker port');
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
        const topicLength = body.readUInt16BE(0);
        const topicEnd = 2 + topicLength;
        const topic = body.subarray(2, topicEnd).toString();
        const qos = (header >> 1) & 3;
        const payloadStart = topicEnd + (qos > 0 ? 2 : 0);
        if (body.length < payloadStart)
          throw new Error('Short MQTT publish identity');
        if (qos === 1) {
          const id = body.readUInt16BE(topicEnd);
          client.write(Buffer.from([64, 2, id >> 8, id & 255]));
        }
        if (this.publications.length >= 256)
          throw new Error('MQTT peer history budget exceeded');
        this.publications.push({
          topic,
          value: JSON.parse(body.subarray(payloadStart).toString()),
        });
        break;
      }
      case 4:
      case 14: {
        break;
      }
      case 8: {
        if (body.length < 5) throw new Error('Short MQTT subscription');
        const id = body.readUInt16BE(0);
        const granted: number[] = [];
        let cursor = 2;
        while (cursor < body.length) {
          const size = body.readUInt16BE(cursor);
          cursor += 2;
          const topic = body.subarray(cursor, cursor + size).toString();
          cursor += size;
          const qos = body[cursor];
          if (qos === undefined) throw new Error('Short MQTT subscription QoS');
          cursor += 1;
          this.subscriptions.add(topic);
          granted.push(Math.min(qos, 1));
        }
        client.write(
          mqttPacket(144, Buffer.from([id >> 8, id & 255, ...granted])),
        );
        break;
      }
      case 12: {
        client.write(Buffer.from([208, 0]));
        break;
      }
      default: {
        throw new Error(`Unexpected MQTT packet type ${header >> 4}`);
      }
    }
  }
}

test('ThingsBoard point RPC reaches IEC CO once per business intent', async ({
  gateway,
  request,
}) => {
  test.setTimeout(360_000);
  if (!peerSource) throw new Error('Missing fixed IEC peer checkout');
  expect(
    execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
  ).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const broker = new MqttPeer();
  const brokerPort = await broker.start();
  const peerPort = await reservePort();
  const peer = await startPeer(peerPort);
  try {
    const { token } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    await installNativeArtifact(
      request,
      gateway,
      token,
      'plugin',
      'ng_plugin_thingsboard',
    );
    await installNativeArtifact(
      request,
      gateway,
      token,
      'plugin',
      'ng_plugin_opcua_server',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const driver = drivers.find(
      (item: { driverType: string }) => item.driverType === 'iec61850',
    );
    const plugins = await api(request, gateway, token, 'GET', '/plugin/list');
    const plugin = plugins.find(
      (item: { pluginType: string }) => item.pluginType === 'thingsboard',
    );
    const opcuaPlugin = plugins.find(
      (item: { pluginType: string }) => item.pluginType === 'opcua-server',
    );
    expect(driver).toBeTruthy();
    expect(plugin).toBeTruthy();
    expect(opcuaPlugin).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'tb-iec-loopback',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port: peerPort },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (item: { name: string }) => item.name === 'tb-iec-loopback',
    );
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'TB IEC IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
      }),
    ).toBe(true);
    const devices = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/${channel.id}/sub-devices`,
    );
    const device = devices.find(
      (item: { deviceName: string }) => item.deviceName === 'TB IEC IED',
    );
    expect(device).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: 'Enhanced control',
        key: 'trip',
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: 'simpleIOGenericIO/GGIO1.SPCSO4',
            expectedControlModel: 4,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            sboClass: 'operateOnce',
            selectionTimeoutMs: 2000,
            terminationTimeoutMs: 5000,
          },
        },
      }),
    ).toBe(true);
    await expect
      .poll(
        async () => {
          const detail = await api(
            request,
            gateway,
            token,
            'GET',
            `/channel/detail/${channel.id}`,
          );
          return (
            detail.configuration?.state === 'active' &&
            detail.configuration?.desiredRevision ===
              detail.configuration?.appliedRevision
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const active = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${channel.id}`,
    );
    const authorityId = randomUUID();
    const authority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      {
        authorityId,
        label: 'Fixed ThingsBoard IEC peer',
      },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed-commit control peer verified',
        evidence: { peerPort },
      },
    );
    const route = await api(
      request,
      gateway,
      token,
      'PUT',
      `/control/routes/${device.id}`,
      {
        authorityId,
        channelId: channel.id,
        expectedRevision: null,
        reason: 'Bind exact IEC control object',
        routeSnapshot: { peerPort },
      },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/routes/${device.id}/verify`,
      {
        expectedRevision: route.revision,
        reason: 'SBOw control verified online',
        evidence: { object: 'GGIO1.SPCSO4' },
      },
    );
    const queuePolicy = {
      latestCapacity: 10_000,
      latestMaxBytes: 32 * 1024 * 1024,
      deliveryMaxInFlight: 16,
      deliveryMaxPayloadBytes: 256 * 1024,
      deliveryTimeoutMs: 30_000,
      deliveryRetryMs: 1000,
    };
    expect(
      await api(request, gateway, token, 'POST', '/northward-app', {
        pluginId: plugin.id,
        name: 'tb-iec-app',
        description: 'Fixed MQTT control peer',
        config: {
          connection: {
            mode: 'none',
            host: '127.0.0.1',
            port: brokerPort,
            client_id: 'tb-iec-e2e',
          },
          communication: { qos: 1 },
        },
        retryPolicy: {},
        queuePolicy,
      }),
    ).toBe(true);
    const apps = await api(
      request,
      gateway,
      token,
      'GET',
      '/northward-app/list',
    );
    const app = apps.find(
      (item: { name: string }) => item.name === 'tb-iec-app',
    );
    expect(app).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/northward-sub', {
        appId: app.id,
        allDevices: true,
        deviceIds: null,
        priority: 0,
      }),
    ).toBe(true);
    await expect
      .poll(() => broker.subscriptions.has('v1/gateway/rpc'), {
        timeout: 15_000,
      })
      .toBe(true);

    async function invoke(
      id: number,
      businessKey: string,
      value: boolean,
      device = 'TB IEC IED',
    ) {
      broker.publish('v1/gateway/rpc', {
        device,
        data: {
          id,
          method: 'ng.point.write',
          params: {
            idempotencyKey: businessKey,
            pointKey: 'trip',
            value,
          },
        },
      });
      await expect
        .poll(() => broker.response(id), { timeout: 15_000 })
        .toBeTruthy();
      return broker.response(id) as {
        data: {
          accepted: boolean;
          error?: string;
          operation?: { operationId: string; state: string };
        };
      };
    }

    const businessKey = randomUUID();
    const first = await invoke(11, businessKey, true);
    expect(first.data.accepted).toBe(true);
    const operationId = first.data.operation?.operationId;
    expect(operationId).toBeTruthy();
    expect(Object.keys(first.data.operation ?? {}).toSorted()).toEqual([
      'operationId',
      'state',
    ]);
    await expect
      .poll(
        async () => {
          const detail = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${operationId}`,
          );
          return detail.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('protocolSucceeded');
    const replay = await invoke(12, businessKey, true);
    expect(replay.data.accepted).toBe(true);
    expect(replay.data.operation?.operationId).toBe(operationId);
    expect(replay.data.operation?.state).toBe('protocolSucceeded');
    const conflict = await invoke(13, businessKey, false);
    expect(conflict.data.accepted).toBe(false);
    const history = await api(
      request,
      gateway,
      token,
      'GET',
      `/control/operations/${operationId}`,
    );
    expect(history.operation.configurationRevision).toBe(
      active.configuration.appliedRevision,
    );
    expect(
      history.events.filter(
        (event: { state: string }) => event.state === 'dispatching',
      ),
    ).toHaveLength(2);
    const rejected = await invoke(14, randomUUID(), false);
    expect(rejected.data.accepted).toBe(true);
    const rejectedId = rejected.data.operation?.operationId;
    await expect
      .poll(
        async () => {
          const detail = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${rejectedId}`,
          );
          return detail.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('protocolRejected');
    const wrongDevice = await invoke(15, randomUUID(), true, 'Unknown IED');
    expect(wrongDevice.data.accepted).toBe(false);
    const operations = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=all',
    );
    expect(operations.items).toHaveLength(2);

    const opcuaPort = await reservePort();
    expect(
      await api(request, gateway, token, 'POST', '/northward-app', {
        pluginId: opcuaPlugin.id,
        name: 'scoped-iec-opcua',
        description: 'Control-only OPC UA node scope',
        config: {
          bind_addr: `127.0.0.1:${opcuaPort}`,
          advertised_endpoints: [`opc.tcp://127.0.0.1:${opcuaPort}/`],
          application_uri: 'urn:ng:iec:control-server',
          product_uri: 'urn:ng:iec:product',
          namespace_uri: 'urn:ng:iec:points',
          trusted_client_certs: [],
          allow_no_security_endpoint: true,
          drop_policy: 'discard_oldest',
        },
        retryPolicy: {},
        queuePolicy,
      }),
    ).toBe(true);
    const runningApps = await api(
      request,
      gateway,
      token,
      'GET',
      '/northward-app/list',
    );
    const opcuaApp = runningApps.find(
      (item: { name: string }) => item.name === 'scoped-iec-opcua',
    );
    expect(opcuaApp).toBeTruthy();
    await expect
      .poll(
        async () => {
          const current = await api(
            request,
            gateway,
            token,
            'GET',
            '/northward-app/list',
          );
          return current.find((item: { id: number }) => item.id === opcuaApp.id)
            ?.connectionState?.phase;
        },
        { timeout: 15_000 },
      )
      .toBe('Connected');
    expect(
      await api(request, gateway, token, 'POST', '/northward-sub', {
        appId: opcuaApp.id,
        allDevices: false,
        deviceIds: [device.id],
        priority: 0,
      }),
    ).toBe(true);

    async function exportedNodes(): Promise<string> {
      const response = await request.get(
        `${gateway.origin}/api/northward-app/${opcuaApp.id}/opcua-server/export-points.xlsx`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      expect(response.status()).toBe(200);
      const workbook = await response.body();
      return execFileSync(
        'python3',
        [
          '-c',
          String.raw`import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); sys.stdout.buffer.write(b"\n".join(z.read(n) for n in z.namelist() if n.endswith(".xml")))`,
        ],
        { input: workbook, maxBuffer: 8 * 1024 * 1024 },
      ).toString();
    }

    const nodePath = 'tb-iec-loopback/TB IEC IED/trip';
    await expect
      .poll(
        async () => {
          const nodes = await exportedNodes();
          return nodes.includes(nodePath);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await probeAnonymousOpcUa(
      `opc.tcp://127.0.0.1:${opcuaPort}/`,
      'urn:ng:iec:points',
      nodePath,
      'write',
    );
    const afterUaWrite = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=all',
    );
    expect(
      afterUaWrite.items.some(
        (operation: { principal: string; state: string }) =>
          operation.principal === `app:${opcuaApp.id}` &&
          operation.state === 'protocolSucceeded',
      ),
    ).toBe(true);
    const subscriptions = await api(
      request,
      gateway,
      token,
      'GET',
      '/northward-sub/list',
    );
    const opcuaSub = subscriptions.find(
      (item: { appId: number }) => item.appId === opcuaApp.id,
    );
    expect(opcuaSub).toBeTruthy();
    expect(
      await api(
        request,
        gateway,
        token,
        'DELETE',
        `/northward-sub/${opcuaSub.id}`,
      ),
    ).toBe(true);
    await expect
      .poll(
        async () => {
          const nodes = await exportedNodes();
          return nodes.includes(nodePath);
        },
        { timeout: 15_000 },
      )
      .toBe(false);
    await probeAnonymousOpcUa(
      `opc.tcp://127.0.0.1:${opcuaPort}/`,
      'urn:ng:iec:points',
      nodePath,
      'absent',
    );
    expect(
      await api(request, gateway, token, 'POST', '/northward-sub', {
        appId: opcuaApp.id,
        allDevices: false,
        deviceIds: [device.id],
        priority: 0,
      }),
    ).toBe(true);
    await expect
      .poll(
        async () => {
          const nodes = await exportedNodes();
          return nodes.includes(nodePath);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await probeAnonymousOpcUa(
      `opc.tcp://127.0.0.1:${opcuaPort}/`,
      'urn:ng:iec:points',
      nodePath,
      'present',
    );
  } finally {
    await stopPeer(peer);
    await broker.stop();
  }
});
