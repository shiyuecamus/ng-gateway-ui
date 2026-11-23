import type { MonitorPointEntry, MonitorServerMessage } from '@vben/types';

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

for (const mode of ['readWindow', 'tooManyOperations'] as const) {
  test(`OPC UA ${mode} retains a bounded original Read journey`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    const python = process.env.NG_A4_OPCUA_PYTHON;
    test.skip(!python, 'Requires pinned independent FreeOpcUa 1.1.5');
    if (!python) throw new Error('Missing independent OPC UA peer');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing owned peer port');
    listener.close();
    await once(listener, 'close');
    const peer = spawn(
      python,
      [
        resolve(import.meta.dirname, 'fixtures/opcua_subscription_peer.py'),
        String(address.port),
        mode,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    let admin: string | undefined;
    let channelId: number | undefined;
    const samples = new Map<string, MonitorPointEntry>();
    page.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== '/api/ws/monitor') return;
      socket.on('framereceived', (frame) => {
        if (typeof frame.payload !== 'string') return;
        const decoded = JSON.parse(frame.payload) as
          | MonitorServerMessage
          | MonitorServerMessage[]
          | { messages: MonitorServerMessage[] };
        let messages: MonitorServerMessage[];
        if (Array.isArray(decoded)) messages = decoded;
        else if ('messages' in decoded) messages = decoded.messages;
        else messages = [decoded];
        for (const message of messages) {
          if (message.type !== 'snapshot') continue;
          for (let index = 0; index < 16; index += 1) {
            const key = `wide-${index}`;
            const entry = message.telemetry[key];
            if (entry) samples.set(key, entry);
          }
        }
      });
    });
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > 8 * 1024 * 1024) {
          peer.kill('SIGTERM');
          throw new Error('Independent peer evidence limit exceeded');
        }
        output += data.toString();
      });
    try {
      await expect.poll(() => output).toContain('"event": "ready"');
      const { token, password } = await initializeAdmin(request, gateway);
      admin = token;
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_opcua',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'opcua',
      );
      expect(driver).toBeTruthy();
      const configuration = {
        name: `opcua-${mode}`,
        driverId: driver.id,
        collectionType: 1,
        reportType: 1,
        period: 1000,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 10_000,
          writeTimeoutMs: 2000,
        },
        driverConfig: {
          applicationName: 'Read window qualification',
          maxPendingServiceRequests: 5,
          applicationUri: 'urn:ng:a4:read-window',
          url: `opc.tcp://127.0.0.1:${address.port}/`,
          auth: { kind: 'anonymous' },
          securityPolicy: 0,
          securityMode: 1,
          sessionTimeout: 120_000,
          keepAliveInterval: 60_000,
        },
      };
      for (const maxConcurrentReads of [0, 65]) {
        const invalid = await request.post(`${gateway.origin}/api/channel`, {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            ...configuration,
            driverConfig: { ...configuration.driverConfig, maxConcurrentReads },
          },
        });
        expect(invalid.status(), await invalid.text()).toBe(422);
      }
      for (const maxPendingPublishRequests of [0, 65]) {
        const invalid = await request.post(`${gateway.origin}/api/channel`, {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            ...configuration,
            driverConfig: {
              ...configuration.driverConfig,
              maxPendingPublishRequests,
            },
          },
        });
        expect(invalid.status(), await invalid.text()).toBe(422);
      }
      for (const admission of [
        { maxPendingServiceRequests: 0 },
        { maxPendingServiceRequests: 1 },
        { maxPendingServiceRequests: 257 },
        { maxConcurrentReads: 4, maxPendingServiceRequests: 4 },
        { maxConcurrentReads: 64, maxPendingServiceRequests: 64 },
      ]) {
        const invalid = await request.post(`${gateway.origin}/api/channel`, {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            ...configuration,
            driverConfig: { ...configuration.driverConfig, ...admission },
          },
        });
        expect(invalid.status(), await invalid.text()).toBe(422);
      }
      expect(
        await api(request, gateway, token, 'GET', '/channel/list'),
      ).toEqual([]);
      await api(request, gateway, token, 'POST', '/channel', configuration);
      const [channel] = await api(
        request,
        gateway,
        token,
        'GET',
        '/channel/list',
      );
      channelId = channel.id;
      await api(request, gateway, token, 'POST', '/device', {
        channelId,
        deviceName: 'Bounded Read memory',
        deviceType: 'Independent FreeOpcUa',
        driverConfig: {},
      });
      const [device] = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/${channelId}/sub-devices`,
      );
      for (let index = 0; index < 16; index += 1)
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name: `Wide${index}`,
          key: `wide-${index}`,
          type: 1,
          dataType: 5,
          accessMode: 0,
          transformNegate: false,
          driverConfig: {
            nodeId: `nsu=urn:ng:a4:physical-device;s=Wide${index}`,
          },
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
        .getByText(`opcua-${mode}`, { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText('Bounded Read memory', { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('Escape');
      for (const index of [0, 15])
        await expect(
          page
            .locator('tr')
            .filter({ has: page.getByText(`wide-${index}`, { exact: true }) })
            .locator('td')
            .nth(2),
        ).toHaveText(String(index), { timeout: 20_000 });
      await expect
        .poll(
          () =>
            Array.from({ length: 16 }, (_, index) => {
              const entry = samples.get(`wide-${index}`);
              return {
                value: entry?.value,
                freshness: entry?.freshness,
                quality: entry?.sourceQuality.validity,
              };
            }),
          { timeout: 20_000 },
        )
        .toEqual(
          Array.from({ length: 16 }, (_, index) => ({
            value: index,
            freshness: 'current',
            quality: 'good',
          })),
        );
      await writeFile(
        testInfo.outputPath('complete-read-websocket-values.json'),
        JSON.stringify(Object.fromEntries(samples), null, 2),
      );
      const records = output
        .split('\n')
        .filter((line) => line.startsWith('{') && line.endsWith('}'))
        .map((line) => JSON.parse(line));
      if (mode === 'readWindow') {
        const sizes = records
          .filter((record) => record.event === 'receiveQueue')
          .map((record) => Number(record.size));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
      }
      await page.screenshot({
        path: testInfo.outputPath('bounded-read-values.png'),
        fullPage: true,
      });
      await writeFile(
        testInfo.outputPath('native-read-observations.json'),
        JSON.stringify(records, null, 2),
      );
    } finally {
      if (admin && channelId)
        await api(request, gateway, admin, 'PUT', '/channel/change-status', {
          id: channelId,
          status: 1,
        });
      await writeFile(testInfo.outputPath('independent-peer.log'), output);
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        const timer = new AbortController();
        peer.kill('SIGTERM');
        try {
          const result = await Promise.race([
            exited,
            delay(10_000, undefined, { signal: timer.signal }).then(() => {
              peer.kill('SIGKILL');
              throw new Error('Independent peer did not stop');
            }),
          ]);
          expect(result[0]).toBe(0);
        } finally {
          timer.abort();
        }
      }
    }
  });
}
