import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerPath = process.env.NG_CJT188_REFERENCE_PEER;
test.skip(
  !peerPath,
  'Requires the independent original CJ/T188 plaintext peer',
);

for (const profile of [
  'standard2004',
  'standard2018',
  'yiduWaterV12',
] as const) {
  test(`CJ/T188 ${profile} closes native collection, aliases, source quality and read-only API`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    if (!peerPath) throw new Error('Missing independent CJ/T188 peer');
    const peer = spawn('python3', ['-u', peerPath, '--profile', profile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    let completed = false;
    try {
      await expect
        .poll(() => rows().some((row) => typeof row.port === 'number'))
        .toBe(true);
      const port = rows().find((row) => typeof row.port === 'number')?.port;
      if (typeof port !== 'number')
        throw new Error('Independent peer has no port');
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_cjt188',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'cjt188',
      );
      expect(driver).toBeTruthy();
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      const old = await request.post(`${gateway.origin}/api/channel`, {
        headers,
        data: {
          name: 'retired-cjt188-config',
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
            version: 'V2018',
            connection: { type: 'Tcp', host: '127.0.0.1', port },
          },
        },
      });
      expect(old.status(), await old.text()).toBe(422);
      const name = `cjt188-${profile}-native`;
      await api(request, gateway, token, 'POST', '/channel', {
        name,
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
          profile,
          connection: { kind: 'tcp', host: '127.0.0.1', port },
          wakeupPreamble: [254, 254, 254, 254],
          idleMs: 30,
          maxNoiseBytes: 1024,
          maxPendingRequests: 32,
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
        (entry: { name: string }) => entry.name === name,
      );
      expect(channel).toBeTruthy();
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Independent CJ/T188 meter',
        deviceType: 'independent-peer',
        driverConfig: { meterType: 16, address: '00000000000001' },
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
        unit: 'm3',
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformOffset: null,
        transformNegate: false,
        dataType: 10,
        accessMode: 2,
      };
      for (const point of [
        {
          name: 'Scaled native volume',
          key: 'cjt188-scaled',
          transformScale: 2,
        },
        {
          name: 'Same DI alias',
          key: 'cjt188-alias',
          transformScale: 3,
          accessMode: 0,
        },
      ]) {
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
          driverConfig: { di: '901F', fieldKey: 'current_flow' },
        });
      }
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 0,
      });
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
              detail.configuration.appliedRevision ===
                detail.configuration.desiredRevision &&
              detail.connectionState?.phase === 'Connected'
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
        (entry: { key: string }) => entry.key === 'cjt188-scaled',
      );
      expect(point).toBeTruthy();
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
        .getByText(name, { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(device.deviceName, { exact: true })
        .click();
      const row = page
        .locator('tr')
        .filter({ has: page.getByText('cjt188-scaled', { exact: true }) });
      await expect(row).toContainText('24.68');
      await expect(row).toContainText('未知');
      await expect(
        page
          .locator('tr')
          .filter({ has: page.getByText('cjt188-alias', { exact: true }) }),
      ).toContainText(String(12.34 * 3));
      await page.screenshot({
        path: testInfo.outputPath('cjt188-native-collection.png'),
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
          label: 'Owned read-only CJ/T188 fixture',
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
          reason: 'Independent memory fixture has no physical control outputs',
          evidence: { profile, port },
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
          reason: 'Owned independent native meter route',
          routeSnapshot: {
            profile,
            host: '127.0.0.1',
            port,
            meterType: 16,
            address: '00000000000001',
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
          reason:
            'Review driver capability after the governed route is fully verified',
          evidence: { profile, port },
        },
      );
      const denied = await request.post(`${gateway.origin}/api/point/write`, {
        headers,
        data: {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          timeoutMs: 3000,
          pointId: point.id,
          value: 20,
          idempotencyKey: randomUUID(),
        },
      });
      expect(denied.status(), await denied.text()).toBe(422);
      expect(await denied.text()).toContain(
        'CJ/T188 downlink is not implemented',
      );
      const action = await request.post(`${gateway.origin}/api/action`, {
        headers,
        data: {
          deviceId: device.id,
          name: 'Unsupported native downlink',
          command: 'unqualified-control',
          inputs: [],
        },
      });
      expect(action.status(), await action.text()).toBe(422);
      await writeFile(
        testInfo.outputPath('cjt188-readonly-denials.json'),
        JSON.stringify(
          {
            point: { status: denied.status(), body: await denied.json() },
            action: { status: action.status(), body: await action.json() },
          },
          null,
          2,
        ),
      );
      await expect(row).toContainText('24.68');
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
      expect(errors).toEqual([]);
      completed = true;
    } finally {
      const exited =
        peer.exitCode === null ? once(peer, 'exit') : Promise.resolve();
      if (peer.exitCode === null) peer.kill('SIGTERM');
      await exited;
      expect(peer.exitCode).toBe(0);
      if (completed) {
        const final = rows().findLast((row) => typeof row.reads === 'number');
        expect(final?.active).toBe(0);
        expect(final?.writes).toBe(0);
        expect(Number(final?.reads)).toBeGreaterThan(0);
      }
      await writeFile(
        testInfo.outputPath('cjt188-independent-peer.log'),
        output,
      );
    }
  });
}
