import type { MonitorPointEntry } from '@vben/types';

import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { BrokerTimePeers } from './broker-time-peer';
import { api, initializeAdmin, installNativeArtifact, test } from './gateway';
import { MqttTimePeer } from './mqtt-time-peer';

for (const protocol of ['modbus', 'iec104'] as const) {
  const suppliedTime = protocol === 'iec104';
  const probePython = process.env.NG_TIME_OPCUA_PYTHON;
  const binary = suppliedTime
    ? process.env.NG_IEC104_REFERENCE_PEER_BIN
    : process.env.NG_MODBUS_REFERENCE_PEER;

  test(`native ${protocol} keeps collection, source, state and disconnect times distinct through Core/WebSocket/UI`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.skip(
      !binary || !probePython,
      'Requires a qualified native protocol peer and a pinned independent asyncua Python environment',
    );
    if (!binary || !probePython)
      throw new Error('Missing independent native protocol tools');
    test.setTimeout(300_000);
    const brokerPeers = BrokerTimePeers.fromEnvironment();
    let port: number | undefined;
    if (suppliedTime) {
      const listener = createServer();
      listener.listen(0, '127.0.0.1');
      await once(listener, 'listening');
      const address = listener.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing owned TCP port');
      port = address.port;
      listener.close();
      await once(listener, 'close');
    }
    const peer = spawn(
      binary,
      suppliedTime ? [String(port), '65543', 'time'] : [],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > 8 * 1024 * 1024)
          throw new Error('Peer evidence exceeded its byte limit');
        output += data.toString();
      });
    const broker = new MqttTimePeer();
    const samples: MonitorPointEntry[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        if (typeof frame.payload !== 'string') return;
        const decoded: unknown = JSON.parse(frame.payload);
        const messages = Array.isArray(decoded)
          ? decoded
          : ((decoded as { messages?: unknown[] }).messages ?? [decoded]);
        for (const message of messages) {
          if (
            message?.type === 'snapshot' &&
            message.telemetry?.['steady-value']
          )
            samples.push(message.telemetry['steady-value']);
        }
      }),
    );
    try {
      const records = () =>
        output
          .split('\n')
          .filter((line) => line.startsWith('{') && line.endsWith('}'))
          .map((line) => JSON.parse(line));
      if (suppliedTime) {
        await expect.poll(() => output).toContain('ready');
      } else {
        await expect
          .poll(() =>
            records().some((record) => typeof record.port === 'number'),
          )
          .toBe(true);
        const ready = records().find(
          (record) => typeof record.port === 'number',
        );
        expect(ready.library).toBe('3.2.0');
        port = ready.port;
      }
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        `ng_driver_${protocol}`,
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === protocol,
      );
      expect(driver).toBeTruthy();
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'time-semantics-native',
        driverId: driver.id,
        status: 1,
        collectionType: suppliedTime ? 0 : 1,
        period: suppliedTime ? null : 250,
        reportType: 1,
        connectionPolicy: {
          connectTimeoutMs: 1000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
          // Hold the source state fixed while independently restarting both brokers.
          ...(brokerPeers ? { backoff: { maxAttempts: 0 } } : {}),
        },
        driverConfig: suppliedTime
          ? {
              host: '127.0.0.1',
              port,
              t0Ms: 10_000,
              t1Ms: 15_000,
              t2Ms: 10_000,
              t3Ms: 20_000,
              sourceTime: { kind: 'utc', century: 2000 },
              autoStartupGeneralInterrogation: false,
              autoStartupCounterInterrogation: false,
              periodicGiIntervalSecs: 0,
              periodicCiIntervalSecs: 0,
            }
          : {
              connection: { kind: 'tcp', host: '127.0.0.1', port },
              byteOrder: 0,
              wordOrder: 0,
              maxBatchRegisters: 125,
              maxGapRegisters: 0,
              maxGapBits: 0,
              maxPendingOperations: 32,
              maxPendingBytes: 33_554_432,
            },
      });
      const channels = await api(
        request,
        gateway,
        token,
        'GET',
        '/channel/list',
      );
      const channel = channels.find(
        (entry: { name: string }) => entry.name === 'time-semantics-native',
      );
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Clock provenance oracle',
        deviceType: 'libmodbus',
        driverConfig: suppliedTime ? { ca: 1 } : { slaveId: 1 },
      });
      const [device] = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/${channel.id}/sub-devices`,
      );
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: 'Steady native register',
        key: 'steady-value',
        type: 1,
        dataType: suppliedTime ? 0 : 4,
        accessMode: 0,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: suppliedTime
          ? { ioa: 65_543, typeId: 30 }
          : { functionCode: 3, address: 10, quantity: 1 },
      });
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 0,
      });
      await page.goto(`${gateway.origin}/#/auth/login`);
      await page
        .getByPlaceholder('请输入用户名', { exact: true })
        .fill('system_admin');
      await page.getByPlaceholder('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'login', exact: true }).click();
      await expect(page).toHaveURL(/\/home/);
      await page.goto(`${gateway.origin}/#/maintenance/monitor`);
      await page.getByRole('combobox').nth(0).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText('time-semantics-native', { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText('Clock provenance oracle', { exact: true })
        .click();
      const row = page
        .locator('tr')
        .filter({ has: page.getByText('steady-value', { exact: true }) });
      await expect(row).toContainText(suppliedTime ? 'true' : '10');
      await (suppliedTime
        ? expect(row).toContainText('2026-06-05')
        : expect(row.getByText('未提供', { exact: true })).toBeVisible());
      await expect(
        page.getByText('最近采集时间', { exact: true }),
      ).toBeInViewport();
      await expect(page.getByText('源时间', { exact: true })).toBeInViewport();
      await expect
        .poll(
          () => {
            const current = samples.filter(
              (sample) => sample.freshness === 'current',
            );
            return suppliedTime
              ? current.length
              : new Set(current.map((sample) => sample.receivedTime)).size;
          },
          { timeout: 20_000 },
        )
        .toBeGreaterThan(suppliedTime ? 0 : 1);
      const observed = samples.filter(
        (sample) => sample.freshness === 'current',
      );
      const first = observed[0];
      if (!first) throw new Error('Missing current native observation');
      const next = suppliedTime
        ? first
        : observed.find((sample) => sample.receivedTime !== first.receivedTime);
      if (!next) throw new Error('No repeated native observation');
      for (const sample of [first, next]) {
        expect(sample.value).toBe(suppliedTime ? true : 10);
        expect(sample.sourceTime).toBe(
          suppliedTime ? '2026-06-05T03:18:01.234Z' : null,
        );
        expect(sample.sourceTimeStatus).toBe(
          suppliedTime ? 'provided' : 'notProvided',
        );
        expect(sample.dataTime).toMatchObject({
          time: suppliedTime ? sample.sourceTime : sample.receivedTime,
          origin: suppliedTime ? 'source' : 'gatewayReceived',
          fallback: suppliedTime
            ? null
            : { kind: 'unavailable', status: 'notProvided' },
        });
      }
      expect(next.stateChangedAt).toBe(first.stateChangedAt);
      const brokerPort = await broker.start();
      await installNativeArtifact(
        request,
        gateway,
        token,
        'plugin',
        'ng_plugin_thingsboard',
      );
      const plugins = await api(request, gateway, token, 'GET', '/plugin/list');
      const plugin = plugins.find(
        (item: { pluginType: string }) => item.pluginType === 'thingsboard',
      );
      expect(plugin).toBeTruthy();
      await api(request, gateway, token, 'POST', '/northward-app', {
        pluginId: plugin.id,
        name: 'time-output',
        description: 'Native time provenance verification',
        config: {
          connection: {
            mode: 'none',
            host: '127.0.0.1',
            port: brokerPort,
            client_id: 'time-output',
          },
          communication: { qos: 1 },
        },
        retryPolicy: {},
        queuePolicy: {
          latestCapacity: 10_000,
          latestMaxBytes: 32 * 1024 * 1024,
          deliveryMaxInFlight: 16,
          deliveryMaxPayloadBytes: 256 * 1024,
          deliveryTimeoutMs: 30_000,
          deliveryRetryMs: 1000,
        },
      });
      const apps = await api(
        request,
        gateway,
        token,
        'GET',
        '/northward-app/list',
      );
      const app = apps.find(
        (item: { name: string }) => item.name === 'time-output',
      );
      expect(app).toBeTruthy();
      await api(request, gateway, token, 'POST', '/northward-sub', {
        appId: app.id,
        allDevices: true,
        deviceIds: null,
        priority: 0,
      });
      await expect
        .poll(
          () =>
            broker
              .observations()
              .some((entry) => entry.sample.freshness === 'current'),
          { timeout: 20_000 },
        )
        .toBe(true);
      const publication = broker
        .observations()
        .find((entry) => entry.sample.freshness === 'current');
      if (!publication?.sample.dataTime)
        throw new Error('Missing real MQTT data-time evidence');
      expect(publication.ts).toBe(Date.parse(publication.sample.dataTime.time));
      expect(publication.sample.sourceTime).toBe(first.sourceTime);
      expect(publication.sample.dataTime.origin).toBe(
        suppliedTime ? 'source' : 'gatewayReceived',
      );
      const listener = createServer();
      listener.listen(0, '127.0.0.1');
      await once(listener, 'listening');
      const address = listener.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing OPC UA port');
      const uaPort = address.port;
      listener.close();
      await once(listener, 'close');
      await installNativeArtifact(
        request,
        gateway,
        token,
        'plugin',
        'ng_plugin_opcua_server',
      );
      const nativePlugins = await api(
        request,
        gateway,
        token,
        'GET',
        '/plugin/list',
      );
      const uaPlugin = nativePlugins.find(
        (item: { pluginType: string }) => item.pluginType === 'opcua-server',
      );
      expect(uaPlugin).toBeTruthy();
      await api(request, gateway, token, 'POST', '/northward-app', {
        pluginId: uaPlugin.id,
        name: 'time-opcua',
        description: 'Independent OPC UA clock evidence',
        config: {
          bind_addr: `127.0.0.1:${uaPort}`,
          advertised_endpoints: [`opc.tcp://127.0.0.1:${uaPort}/`],
          application_uri: 'urn:ng:time:server',
          product_uri: 'urn:ng:time:product',
          namespace_uri: 'urn:ng:time:points',
          trusted_client_certs: [],
          allow_no_security_endpoint: true,
          drop_policy: 'discard_oldest',
        },
        retryPolicy: {},
        queuePolicy: {
          latestCapacity: 10_000,
          latestMaxBytes: 32 * 1024 * 1024,
          deliveryMaxInFlight: 16,
          deliveryMaxPayloadBytes: 256 * 1024,
          deliveryTimeoutMs: 30_000,
          deliveryRetryMs: 1000,
        },
      });
      const running = await api(
        request,
        gateway,
        token,
        'GET',
        '/northward-app/list',
      );
      const uaApp = running.find(
        (item: { name: string }) => item.name === 'time-opcua',
      );
      expect(uaApp).toBeTruthy();
      await api(request, gateway, token, 'POST', '/northward-sub', {
        appId: uaApp.id,
        allDevices: false,
        deviceIds: [device.id],
        priority: 0,
      });
      async function uaFacts(freshness: 'current' | 'stale') {
        if (!probePython)
          throw new Error('Missing independent OPC UA client environment');
        const result = await promisify(execFile)(
          probePython,
          [
            resolve(import.meta.dirname, 'fixtures/opcua_time_probe.py'),
            `opc.tcp://127.0.0.1:${uaPort}/`,
            'urn:ng:time:points',
            'time-semantics-native/Clock provenance oracle/steady-value',
            freshness,
          ],
          { timeout: 30_000, maxBuffer: 256 * 1024, encoding: 'utf8' },
        );
        return JSON.parse(result.stdout) as {
          metadata: Omit<MonitorPointEntry, 'pointId' | 'pointKey' | 'value'>;
          serverTimestamp: string;
          sourceTimestamp: null | string;
        };
      }
      const uaCurrent = await uaFacts('current');
      expect(uaCurrent.metadata.sourceTime).toBe(first.sourceTime);
      expect(
        uaCurrent.sourceTimestamp
          ? Date.parse(uaCurrent.sourceTimestamp)
          : null,
      ).toBe(first.sourceTime ? Date.parse(first.sourceTime) : null);
      expect(Date.parse(uaCurrent.serverTimestamp)).toBe(
        Date.parse(uaCurrent.metadata.receivedTime ?? ''),
      );
      await writeFile(
        testInfo.outputPath('northward-opcua-current.json'),
        JSON.stringify(uaCurrent, null, 2),
      );
      await page.screenshot({
        path: testInfo.outputPath('current-time-semantics.png'),
        fullPage: true,
      });
      if (brokerPeers) {
        await brokerPeers.install(request, gateway, token, device.id);
        await brokerPeers.observe('current', first, testInfo);
        await brokerPeers.interrupt();
      }
      const exit = once(peer, 'exit');
      peer.kill('SIGTERM');
      await exit;
      await expect
        .poll(() => samples.some((sample) => sample.freshness === 'stale'), {
          timeout: 20_000,
        })
        .toBe(true);
      const stale = samples.find((sample) => sample.freshness === 'stale');
      if (!stale) throw new Error('Missing stale state');
      if (brokerPeers) {
        const resumedAt = Date.now();
        await writeFile(
          testInfo.outputPath('broker-recovery-boundary.json'),
          JSON.stringify({ resumedAt, stale }, null, 2),
        );
        await brokerPeers.resume();
        await brokerPeers.observe('stale', stale, testInfo, resumedAt);
      }
      expect(stale.sourceTime).toBe(first.sourceTime);
      expect(
        samples.some(
          (sample) =>
            sample.freshness === 'current' &&
            sample.receivedTime === stale.receivedTime,
        ),
      ).toBe(true);
      await expect
        .poll(
          () =>
            broker
              .observations()
              .some((entry) => entry.sample.freshness === 'stale'),
          { timeout: 20_000 },
        )
        .toBe(true);
      const stalePublication = broker
        .observations()
        .find((entry) => entry.sample.freshness === 'stale');
      if (!stalePublication)
        throw new Error('Missing real MQTT freshness evidence');
      expect(stalePublication.sample.receivedTime).toBe(stale.receivedTime);
      expect(stalePublication.sample.sourceTime).toBe(stale.sourceTime);
      expect(stalePublication.ts).toBe(Date.parse(stale.stateChangedAt));
      const uaStale = await uaFacts('stale');
      expect(uaStale.metadata.receivedTime).toBe(stale.receivedTime);
      expect(uaStale.metadata.sourceTime).toBe(stale.sourceTime);
      expect(Date.parse(uaStale.serverTimestamp)).toBe(
        Date.parse(stale.stateChangedAt),
      );
      await writeFile(
        testInfo.outputPath('northward-opcua-stale.json'),
        JSON.stringify(uaStale, null, 2),
      );
      expect(stale.updateKind).toBe('freshness');
      expect(stale.dataTime).toMatchObject({
        time: stale.stateChangedAt,
        origin: 'gatewayStateChanged',
        fallback: null,
      });
      await expect(row.getByText('陈旧', { exact: true })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('stale-time-semantics.png'),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } finally {
      try {
        await Promise.all([
          writeFile(
            testInfo.outputPath('time-samples.json'),
            JSON.stringify(samples, null, 2),
          ),
          writeFile(
            testInfo.outputPath('northward-mqtt-samples.json'),
            JSON.stringify(broker.observations(), null, 2),
          ),
          writeFile(testInfo.outputPath('independent-native-peer.log'), output),
        ]);
      } finally {
        try {
          await brokerPeers?.resume();
        } finally {
          await broker.stop();
          if (peer.exitCode === null && peer.signalCode === null) {
            const exit = once(peer, 'exit');
            peer.kill('SIGTERM');
            await exit;
          }
        }
      }
    }
  });
}
