import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_MC_REFERENCE_PEER;
test.skip(
  !peerBinary,
  'Requires the independently source-pinned Mitsubishi manual peer',
);

for (const [series, frame] of [
  ['a', '1e'],
  ['qL', '3e'],
  ['qL', '4e'],
  ['iQR', '4e'],
] as const) {
  test(`MC ${series}/${frame} native kernel keeps collection, point writes and Action on the real governed path`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    if (!peerBinary) throw new Error('Missing independent MC peer');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('No MC peer port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn('python3', ['-u', peerBinary, '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    peer.stdout.on('data', (value: Buffer) => {
      output += value.toString();
    });
    peer.stderr.on('data', (value: Buffer) => {
      output += value.toString();
    });
    let completed = false;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await expect
        .poll(() => output, { timeout: 15_000 })
        .toContain(`"port":${port}`);
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_mc',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'mc',
      );
      expect(driver).toBeTruthy();
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'mc-kernel-native',
        driverId: driver.id,
        status: 1,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 3000,
          readTimeoutMs: 3000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          host: '127.0.0.1',
          port,
          series,
          frame,
          connectionCount: 2,
          maxBytesPerFrame: 256,
          route: { network: 0, pc: 255, moduleIo: 1023, station: 0 },
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
        (entry: { name: string }) => entry.name === 'mc-kernel-native',
      );
      expect(channel).toBeTruthy();
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Independent Mitsubishi manual PLC',
        deviceType: 'independent-peer',
        driverConfig: {},
      });
      const devices = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/${channel.id}/sub-devices`,
      );
      expect(devices).toHaveLength(1);
      const device = devices[0];
      const base = {
        deviceId: device.id,
        type: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
      };
      for (const point of [
        {
          name: 'Scaled word',
          key: 'mc-scaled-word',
          dataType: 4,
          accessMode: 2,
          transformDataType: 10,
          transformScale: 2,
          driverConfig: { address: 'D100' },
        },
        {
          name: 'Native REAL',
          key: 'mc-real',
          dataType: 9,
          transformDataType: 10,
          accessMode: 0,
          driverConfig: { address: 'D110' },
        },
        {
          name: 'Native bit',
          key: 'mc-bit',
          dataType: 0,
          accessMode: 2,
          driverConfig: { address: 'M100' },
        },
        {
          name: 'Fixed STRING',
          key: 'mc-string',
          dataType: 11,
          accessMode: 0,
          driverConfig: { address: 'D130', stringLenBytes: 4 },
        },
        {
          name: 'Signed whole word',
          key: 'mc-int8',
          dataType: 1,
          accessMode: 0,
          driverConfig: { address: 'D120' },
        },
        {
          name: 'Rejected address',
          key: 'mc-rejected-address',
          dataType: 4,
          accessMode: 2,
          driverConfig: { address: 'D9999' },
        },
      ])
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
        });
      await api(request, gateway, token, 'POST', '/action', {
        deviceId: device.id,
        name: 'MC exact scaled Action',
        command: 'write-scaled-word',
        inputs: [
          {
            name: 'Operator word',
            key: 'word',
            dataType: 4,
            required: true,
            defaultValue: null,
            minValue: null,
            maxValue: null,
            transformDataType: 10,
            transformScale: 2,
            transformOffset: null,
            transformNegate: false,
            driverConfig: { address: 'D100' },
          },
        ],
      });
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 0,
      });
      await expect
        .poll(
          async () => {
            const current = await api(
              request,
              gateway,
              token,
              'GET',
              `/channel/detail/${channel.id}`,
            );
            return (
              current.configuration?.state === 'active' &&
              current.configuration.appliedRevision ===
                current.configuration.desiredRevision &&
              current.connectionState?.phase === 'Connected'
            );
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      const active = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/detail/${channel.id}`,
      );
      const points = await api(request, gateway, token, 'GET', '/point/list');
      const point = points.find(
        (entry: { key: string }) => entry.key === 'mc-scaled-word',
      );
      const rejectedPoint = points.find(
        (entry: { key: string }) => entry.key === 'mc-rejected-address',
      );
      expect(rejectedPoint, "configured rejected MC address point").toBeTruthy();
    const actions = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
      expect(actions).toHaveLength(1);
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
        .getByText('mc-kernel-native', { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(device.deviceName, { exact: true })
        .click();
      const locales = JSON.parse(
        await readFile(
          resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
          'utf8',
        ),
      );
      const wordRow = page
        .locator('tr')
        .filter({ has: page.getByText('mc-scaled-word', { exact: true }) });
      await expect(
        wordRow.getByText(locales.monitor.realtime.freshness.current, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(wordRow).toContainText('9320');
      await expect(
        page
          .locator('tr')
          .filter({ has: page.getByText('mc-string', { exact: true }) }),
      ).toContainText('abc');
      await expect(
        page
          .locator('tr')
          .filter({ has: page.getByText('mc-int8', { exact: true }) }),
      ).toContainText('-2');
      await page.screenshot({
        path: testInfo.outputPath('mc-native-collection.png'),
        fullPage: true,
      });
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        {
          authorityId,
          label: 'Owned independent Mitsubishi manual memory fixture',
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
          reason: 'Independent fixture has no physical outputs',
          evidence: { source: 'SHA-pinned Mitsubishi manual reference', port },
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
          reason: 'Bind the owned independent MC memory fixture',
          routeSnapshot: { host: '127.0.0.1', port, series, frame },
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
          reason: 'Owned local Mitsubishi manual fixture route',
          evidence: { port },
        },
      );
      const expectation = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        timeoutMs: 3000,
      };
      const pointIntent = {
        ...expectation,
        pointId: point.id,
        value: 20,
        idempotencyKey: randomUUID(),
      };
      const writeResponse = await request.post(
        `${gateway.origin}/api/point/write`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: pointIntent,
        },
      );
      const writeBody = await writeResponse.text();
      expect(writeResponse.status(), writeBody).toBe(200);
      const written = JSON.parse(writeBody).data;
      await expect
        .poll(async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${written.operationId}`,
          );
          return details.operation.state;
        })
        .toBe('serviceAccepted');
      await expect(wordRow).toContainText('20');

      const action = await api(
        request,
        gateway,
        token,
        'POST',
        `/action/${actions[0].id}/debug`,
        { ...expectation, params: { word: 30 }, idempotencyKey: randomUUID() },
      );
      const rejected = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          ...expectation,
          pointId: rejectedPoint.id,
          value: 1,
          idempotencyKey: randomUUID(),
        },
      );
      const records = [];
      for (const [receipt, state] of [
        [written, 'serviceAccepted'],
        [action, 'serviceAccepted'],
        [rejected, 'protocolRejected'],
      ] as const) {
        await expect
          .poll(async () => {
            const details = await api(
              request,
              gateway,
              token,
              'GET',
              `/control/operations/${receipt.operationId}`,
            );
            return details.operation.state;
          })
          .toBe(state);
        records.push(
          await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${receipt.operationId}`,
          ),
        );
      }
      const duplicate = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        pointIntent,
      );
      expect(duplicate.operationId).toBe(written.operationId);
      await expect(wordRow).toContainText('30');
      const writeCount = () =>
        output
          .split('\n')
          .filter(
            (line) =>
              line.startsWith('EVENT ') &&
              [0x14_01, 0x14_02].includes(JSON.parse(line.slice(6)).command),
          ).length;
      const writesBefore = writeCount();
      const fractional = await request.post(
        `${gateway.origin}/api/point/write`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            ...expectation,
            pointId: point.id,
            value: 14.5,
            idempotencyKey: randomUUID(),
          },
        },
      );
      expect(fractional.status(), await fractional.text()).toBe(422);
      expect(writeCount()).toBe(writesBefore);
      await writeFile(
        testInfo.outputPath('mc-governed-operations.json'),
        JSON.stringify(records, null, 2),
      );
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(action.operationId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: action.operationId }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('mc-action-history.png'),
        fullPage: true,
      });
      expect(errors).toEqual([]);
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 1,
      });
      await expect
        .poll(async () => {
          const detail = await api(
            request,
            gateway,
            token,
            'GET',
            `/channel/detail/${channel.id}`,
          );
          return detail.connectionState?.phase;
        })
        .toBe('Disconnected');
      completed = true;
    } finally {
      const exited =
        peer.exitCode === null ? once(peer, 'exit') : Promise.resolve();
      if (peer.exitCode === null) peer.kill('SIGTERM');
      await exited;
      expect(peer.exitCode).toBe(0);
      const final = output
        .split('\n')
        .find((line) => line.startsWith('FINAL '));
      if (completed) {
        const memory = JSON.parse(final?.slice(6) ?? '{}');
        expect(memory.d100).toBe(15);
        expect(memory.activeConnections).toBe(0);
      }
      await writeFile(testInfo.outputPath('mc-independent-peer.log'), output);
    }
  });
}
