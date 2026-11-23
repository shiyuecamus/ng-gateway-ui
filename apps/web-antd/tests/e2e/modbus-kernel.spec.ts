import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerPath = process.env.NG_MODBUS_REFERENCE_PEER;
test.skip(
  !peerPath,
  'Requires the digest-qualified independent native libmodbus peer',
);

for (const order of [0, 1]) {
  test(`Modbus order ${order} closes native collection, governed point/action writes and readbacks`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    if (!peerPath) throw new Error('Missing native libmodbus peer');
    const peer = spawn(peerPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    peer.stdout.on('data', (value: Buffer) => {
      output += value.toString();
    });
    peer.stderr.on('data', (value: Buffer) => {
      output += value.toString();
    });
    const rows = (): Record<string, unknown>[] =>
      output
        .split('\n')
        .slice(0, -1)
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await expect
        .poll(() => rows().some((row) => typeof row.port === 'number'))
        .toBe(true);
      const ready = rows().find((row) => typeof row.port === 'number');
      const port = ready?.port;
      if (typeof port !== 'number') throw new Error('Native peer has no port');
      expect(ready?.library).toBe('3.2.0');
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_modbus',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'modbus',
      );
      expect(driver).toBeTruthy();
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      const configuration = {
        name: `modbus-${order}-native`,
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
          connection: { kind: 'tcp', host: 'localhost', port },
          byteOrder: order,
          wordOrder: order,
          maxBatchRegisters: 125,
          maxGapRegisters: 0,
          maxGapBits: 0,
          maxPendingOperations: 32,
          maxPendingBytes: 33_554_432,
        },
      };
      const retired = await request.post(`${gateway.origin}/api/channel`, {
        headers,
        data: {
          ...configuration,
          driverConfig: { ...configuration.driverConfig, tcpPoolSize: 2 },
        },
      });
      expect(retired.status(), await retired.text()).toBe(422);
      await api(request, gateway, token, 'POST', '/channel', configuration);
      const channels = await api(
        request,
        gateway,
        token,
        'GET',
        '/channel/list',
      );
      const channel = channels.find(
        (entry: { name: string }) => entry.name === configuration.name,
      );
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Independent native Modbus memory',
        deviceType: 'libmodbus-oracle',
        driverConfig: { slaveId: 1 },
      });
      const [device] = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/${channel.id}/sub-devices`,
      );
      const base = {
        deviceId: device.id,
        type: 1,
        minValue: null,
        maxValue: null,
        unit: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        accessMode: 0,
      };
      for (const point of [
        {
          name: 'Scaled original register',
          key: 'modbus-scaled',
          dataType: 4,
          transformDataType: 10,
          transformScale: 2,
          accessMode: 2,
          driverConfig: { functionCode: 3, address: 10, quantity: 1 },
        },
        {
          name: 'Same register alias',
          key: 'modbus-alias',
          dataType: 4,
          driverConfig: { functionCode: 3, address: 10, quantity: 1 },
        },
        {
          name: 'Native action register',
          key: 'modbus-action-register',
          dataType: 4,
          driverConfig: { functionCode: 3, address: 13, quantity: 1 },
        },
        {
          name: 'Native multiple registers',
          key: 'modbus-multiple',
          dataType: 6,
          driverConfig: { functionCode: 3, address: 20, quantity: 2 },
        },
        {
          name: 'Native single coil',
          key: 'modbus-coil',
          dataType: 0,
          driverConfig: { functionCode: 1, address: 10, quantity: 1 },
        },
        {
          name: 'Native coil range readback',
          key: 'modbus-coils',
          dataType: 0,
          driverConfig: { functionCode: 1, address: 30, quantity: 1 },
        },
      ])
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
        });
      const invalid = await request.post(`${gateway.origin}/api/point`, {
        headers,
        data: {
          ...base,
          name: 'Invalid scalar width',
          key: 'invalid',
          dataType: 9,
          driverConfig: { functionCode: 3, address: 65_535, quantity: 3 },
        },
      });
      expect(invalid.status(), await invalid.text()).toBe(422);
      const inputs = [
        {
          name: 'Single coil',
          key: 'coil',
          dataType: 0,
          driverConfig: { functionCode: 5, address: 10, quantity: 1 },
        },
        {
          name: 'Single register',
          key: 'register',
          dataType: 4,
          driverConfig: { functionCode: 6, address: 13, quantity: 1 },
        },
        {
          name: 'Multiple coils',
          key: 'coils',
          dataType: 0,
          driverConfig: { functionCode: 15, address: 30, quantity: 9 },
        },
        {
          name: 'Multiple registers',
          key: 'registers',
          dataType: 6,
          driverConfig: { functionCode: 16, address: 20, quantity: 2 },
        },
      ].map((input) => ({
        required: true,
        defaultValue: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        ...input,
      }));
      await api(request, gateway, token, 'POST', '/action', {
        deviceId: device.id,
        name: 'Original native write services',
        command: 'native-writes',
        inputs,
      });
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 0,
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
          return (
            detail.configuration?.state === 'active' &&
            detail.configuration.appliedRevision ===
              detail.configuration.desiredRevision &&
            detail.connectionState?.phase === 'Connected'
          );
        })
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
        (entry: { key: string }) => entry.key === 'modbus-scaled',
      );
      const [action] = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
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
        .getByText(configuration.name, { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(device.deviceName, { exact: true })
        .click();
      const row = (key: string) =>
        page
          .locator('tr')
          .filter({ has: page.getByText(key, { exact: true }) });
      await expect(row('modbus-scaled')).toContainText(
        String(order === 0 ? 20 : 5120),
      );
      await expect(row('modbus-scaled')).toContainText('未知');
      await page.screenshot({
        path: testInfo.outputPath('modbus-native-collection.png'),
        fullPage: true,
      });
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        { authorityId, label: 'Owned independent native libmodbus fixture' },
      );
      await api(
        request,
        gateway,
        token,
        'POST',
        `/control/authorities/${authorityId}/verify`,
        {
          expectedRevision: authority.revision,
          reason: 'Independent native memory fixture has no physical outputs',
          evidence: { port, library: ready?.library },
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
          reason: 'Bind owned native Modbus memory',
          routeSnapshot: {
            host: 'localhost',
            port,
            unit: 1,
            byteOrder: order,
            wordOrder: order,
          },
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
          reason: 'Verify the original native memory route',
          evidence: { port, order },
        },
      );
      const expectation = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        timeoutMs: 3000,
      };
      const terminal = async (receipt: { operationId: string }) => {
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
          .toBe('serviceAccepted');
        return api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        );
      };
      const written = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          ...expectation,
          pointId: point.id,
          value: 9320,
          idempotencyKey: randomUUID(),
        },
      );
      const records = [await terminal(written)];
      await expect(row('modbus-scaled')).toContainText('9320');
      await expect(row('modbus-alias')).toContainText('4660');
      const actionResult = await api(
        request,
        gateway,
        token,
        'POST',
        `/action/${action.id}/debug`,
        {
          ...expectation,
          params: {
            coil: true,
            register: 22_136,
            coils: true,
            registers: 287_454_020,
          },
          idempotencyKey: randomUUID(),
        },
      );
      records.push(await terminal(actionResult));
      await expect(row('modbus-action-register')).toContainText('22136');
      await expect(row('modbus-multiple')).toContainText('287454020');
      await writeFile(
        testInfo.outputPath('modbus-governed-operations.json'),
        JSON.stringify(records, null, 2),
      );
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(actionResult.operationId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: actionResult.operationId }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('modbus-native-action-history.png'),
        fullPage: true,
      });
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 1,
      });
      await expect
        .poll(async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/channel/detail/${channel.id}`,
          );
          return details.connectionState?.phase;
        })
        .toBe('Disconnected');
      await expect
        .poll(() => rows().findLast((row) => row.active === 0)?.active)
        .toBe(0);
      const report = rows().findLast((row) => row.active === 0);
      expect(report?.writes).toBe(5);
      expect(
        rows()
          .filter((row) => [5, 6, 15, 16].includes(Number(row.function)))
          .map((row) => row.function),
      ).toEqual([6, 5, 6, 15, 16]);
      expect(errors).toEqual([]);
    } finally {
      const exited =
        peer.exitCode === null && peer.signalCode === null
          ? once(peer, 'exit')
          : Promise.resolve();
      if (peer.exitCode === null && peer.signalCode === null)
        peer.kill('SIGTERM');
      await exited;
      await writeFile(
        testInfo.outputPath('modbus-independent-native-peer.log'),
        output,
      );
    }
  });
}
