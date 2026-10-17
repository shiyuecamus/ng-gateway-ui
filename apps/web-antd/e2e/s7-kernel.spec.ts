import type { Buffer } from 'node:buffer';

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_S7_REFERENCE_PEER;
test.skip(!peerBinary, 'Requires the independently source-pinned Snap7 peer');

test('S7 native kernel keeps collection, point writes and Action on the real governed path', async ({
  gateway,
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!peerBinary) throw new Error('Missing independent S7 peer');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string')
    throw new Error('No S7 peer port');
  const port = address.port;
  listener.close();
  await once(listener, 'close');
  const peer = spawn(peerBinary, [String(port)], {
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
      .toContain(`READY ${port}`);
    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_s7',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const driver = drivers.find(
      (entry: { driverType: string }) => entry.driverType === 's7',
    );
    expect(driver).toBeTruthy();
    await api(request, gateway, token, 'POST', '/channel', {
      name: 's7-kernel-native',
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
        cpu: 5,
        host: '127.0.0.1',
        port,
        tsap: { kind: 'rackSlot', rack: 0, slot: 1 },
        preferredPduSize: 240,
        preferredAmqCaller: 2,
        preferredAmqCallee: 80,
      },
    });
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (entry: { name: string }) => entry.name === 's7-kernel-native',
    );
    expect(channel).toBeTruthy();
    await api(request, gateway, token, 'POST', '/device', {
      channelId: channel.id,
      deviceName: 'Independent Snap7 PLC',
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
        key: 's7-scaled-word',
        dataType: 10,
        accessMode: 2,
        transformScale: 2,
        driverConfig: { address: 'DB1.DBW0' },
      },
      {
        name: 'Native REAL',
        key: 's7-real',
        dataType: 10,
        accessMode: 0,
        driverConfig: { address: 'DB1.REAL4' },
      },
      {
        name: 'Native bit',
        key: 's7-bit',
        dataType: 0,
        accessMode: 2,
        driverConfig: { address: 'DB1.DBX8.3' },
      },
      {
        name: 'Split STRING',
        key: 's7-string',
        dataType: 11,
        accessMode: 0,
        driverConfig: { address: 'DB1.STRING64' },
      },
      {
        name: 'Split WSTRING',
        key: 's7-wstring',
        dataType: 11,
        accessMode: 0,
        driverConfig: { address: 'DB1.WSTRING512' },
      },
      {
        name: 'Unavailable DB',
        key: 's7-rejected-db',
        dataType: 10,
        accessMode: 2,
        driverConfig: { address: 'DB99.DBW0' },
      },
    ])
      await api(request, gateway, token, 'POST', '/point', {
        ...base,
        ...point,
      });
    await api(request, gateway, token, 'POST', '/action', {
      deviceId: device.id,
      name: 'S7 exact scaled Action',
      command: 'write-scaled-word',
      inputs: [
        {
          name: 'Operator word',
          key: 'word',
          dataType: 10,
          required: true,
          defaultValue: null,
          minValue: null,
          maxValue: null,
          transformDataType: null,
          transformScale: 2,
          transformOffset: null,
          transformNegate: false,
          driverConfig: { address: 'DB1.DBW0' },
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
      (entry: { key: string }) => entry.key === 's7-scaled-word',
    );
    const rejectedPoint = points.find(
      (entry: { key: string }) => entry.key === 's7-rejected-db',
    );
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
      .getByText('s7-kernel-native', { exact: true })
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
      .filter({ has: page.getByText('s7-scaled-word', { exact: true }) });
    await expect(
      wordRow.getByText(locales.monitor.realtime.freshness.current, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(wordRow).toContainText('9320');
    await expect(
      page
        .locator('tr')
        .filter({ has: page.getByText('s7-string', { exact: true }) }),
    ).toContainText('abc');
    await expect(
      page
        .locator('tr')
        .filter({ has: page.getByText('s7-wstring', { exact: true }) }),
    ).toContainText('😀');
    await page.screenshot({
      path: testInfo.outputPath('s7-native-collection.png'),
      fullPage: true,
    });
    const authorityId = randomUUID();
    const authority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      { authorityId, label: 'Owned independent Snap7 memory fixture' },
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
        evidence: { source: 'SHA-pinned Snap7 reference', port },
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
        reason: 'Bind the owned independent S7 memory fixture',
        routeSnapshot: { host: '127.0.0.1', port, tsap: 0x03_01 },
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
        reason: 'Owned local Snap7 fixture route',
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
    const writesBefore = output.split('EVENT 262144 ').length;
    const fractional = await request.post(`${gateway.origin}/api/point/write`, {
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
    });
    expect(fractional.status(), await fractional.text()).toBe(422);
    expect(output.split('EVENT 262144 ').length).toBe(writesBefore);
    await writeFile(
      testInfo.outputPath('s7-governed-operations.json'),
      JSON.stringify(records, null, 2),
    );
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await page.getByPlaceholder('操作 ID').fill(action.operationId);
    await page.getByRole('button', { name: '查询操作', exact: true }).click();
    await expect(
      page.locator('code').filter({ hasText: action.operationId }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('s7-action-history.png'),
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
    if (peer.exitCode === null && process.platform === 'linux')
      peer.kill('SIGTERM');
    else if (peer.exitCode === null)
      await promisify(execFile)('docker', [
        'stop',
        '--time',
        '5',
        `ng-s7-d2-peer-${port}`,
      ]);
    await exited;
    expect(peer.exitCode).toBe(0);
    const final = output.split('\n').find((line) => line.startsWith('FINAL '));
    if (completed) expect(final?.slice(6, 10)).toBe('000f');
    await writeFile(testInfo.outputPath('s7-independent-peer.log'), output);
  }
});
