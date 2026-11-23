import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerPath = process.env.NG_DLT645_REFERENCE_PEER;
test.skip(!peerPath, 'Requires the independently encoded DL/T645 manual peer');

for (const [version, di, rejectedDi, controlFault] of [
  [1997, '9010', 'FFFF', 'normal'],
  [2007, '00000100', 'FFFFFFFF', 'normal'],
  [2007, '00000100', 'FFFFFFFF', 'silent'],
] as const) {
  test(`DL/T645 ${version}/${controlFault} closes native continuation, exact BCD, point/Action and operator history`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    if (!peerPath) throw new Error('Missing independent DL/T645 peer');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('No reference port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn(
      'python3',
      [
        '-u',
        peerPath,
        '--version',
        String(version),
        '--port',
        String(port),
        '--control-fault',
        controlFault,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    peer.stdout.on('data', (value: Buffer) => {
      output += value.toString();
    });
    peer.stderr.on('data', (value: Buffer) => {
      output += value.toString();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let completed = false;
    const rows = () =>
      output
        .split('\n')
        .slice(0, -1)
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line));
    const writes = () => rows().filter((row) => row.state === 'write').length;
    try {
      await expect.poll(() => output).toContain('"state":"ready"');
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_dlt645',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'dlt645',
      );
      expect(driver).toBeTruthy();
      await api(request, gateway, token, 'POST', '/channel', {
        name: `dlt645-${version}-native`,
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
          version,
          connection: { kind: 'tcp', host: '127.0.0.1', port },
          wakeupPreamble: [254, 254, 254, 254],
          maxResponseFrames: 8,
          maxResponseBytes: 1600,
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
        (entry: { name: string }) => entry.name === `dlt645-${version}-native`,
      );
      expect(channel).toBeTruthy();
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Independent DL/T645 meter',
        deviceType: 'independent-peer',
        driverConfig: {
          address: '000000000001',
          password: '00000000',
          operatorCode: '00000000',
        },
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
        transformOffset: null,
        transformNegate: false,
        dataType: 10,
        accessMode: 2,
      };
      for (const point of [
        {
          name: 'Scaled BCD',
          key: 'dlt645-scaled',
          transformScale: 2,
          driverConfig: { di, decimals: 2, bcdBytes: 4, bcdSigned: false },
        },
        {
          name: 'Same DI alias',
          key: 'dlt645-alias',
          transformScale: 3,
          accessMode: 0,
          driverConfig: { di, decimals: 2, bcdBytes: 4, bcdSigned: false },
        },
        {
          name: 'Rejected original DI',
          key: 'dlt645-rejected',
          transformScale: null,
          driverConfig: {
            di: rejectedDi,
            decimals: 2,
            bcdBytes: 4,
            bcdSigned: false,
          },
        },
      ])
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
        });
      await api(request, gateway, token, 'POST', '/action', {
        deviceId: device.id,
        name: 'Exact BCD Action',
        command: 'exact-bcd',
        inputs: [
          {
            name: 'Value',
            key: 'value',
            dataType: 10,
            required: true,
            defaultValue: null,
            minValue: null,
            maxValue: null,
            transformDataType: null,
            transformScale: 2,
            transformOffset: null,
            transformNegate: false,
            driverConfig: {
              functionCode: 20,
              di,
              decimals: 2,
              bcdBytes: 4,
              bcdSigned: false,
            },
          },
        ],
      });
      for (const service of [
        { command: 'freeze', code: 22, dataType: 11, name: 'Frozen snapshot' },
        {
          command: 'clear-maximum',
          code: 25,
          dataType: 0,
          name: 'Clear maximum',
        },
        { command: 'clear-meter', code: 26, dataType: 0, name: 'Clear meter' },
        {
          command: 'clear-events',
          code: 27,
          dataType: 11,
          name: 'Clear event class',
        },
      ]) {
        await api(request, gateway, token, 'POST', '/action', {
          deviceId: device.id,
          name: service.name,
          command: service.command,
          inputs: [
            {
              name: 'Execution input',
              key: 'input',
              dataType: service.dataType,
              required: true,
              defaultValue: null,
              minValue: null,
              maxValue: null,
              transformDataType: null,
              transformScale: null,
              transformOffset: null,
              transformNegate: false,
              driverConfig: { functionCode: service.code },
            },
          ],
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
        (entry: { key: string }) => entry.key === 'dlt645-scaled',
      );
      const rejected = points.find(
        (entry: { key: string }) => entry.key === 'dlt645-rejected',
      );
      const actions = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
      expect(actions).toHaveLength(5);
      const numericAction = actions.find(
        (entry: { command: string }) => entry.command === 'exact-bcd',
      );
      expect(numericAction).toBeTruthy();
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
        .getByText(`dlt645-${version}-native`, { exact: true })
        .click();
      await page.getByRole('combobox').nth(1).press('ArrowDown');
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(device.deviceName, { exact: true })
        .click();
      const row = page
        .locator('tr')
        .filter({ has: page.getByText('dlt645-scaled', { exact: true }) });
      await expect(row).toContainText('24.68');
      await expect(
        page
          .locator('tr')
          .filter({ has: page.getByText('dlt645-alias', { exact: true }) }),
      ).toContainText(String(12.34 * 3));
      await expect(row).toContainText('未知');
      await expect(
        page.getByText('dlt645-rejected', { exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath('dlt645-native-collection.png'),
        fullPage: true,
      });
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        { authorityId, label: 'Owned independent meter fixture' },
      );
      await api(
        request,
        gateway,
        token,
        'POST',
        `/control/authorities/${authorityId}/verify`,
        {
          expectedRevision: authority.revision,
          reason: 'Independent memory fixture has no physical outputs',
          evidence: {
            source: 'Original DL/T645 frame tables and independent C vectors',
            port,
          },
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
          reason: 'Owned laboratory meter',
          routeSnapshot: {
            host: '127.0.0.1',
            port,
            version,
            address: '000000000001',
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
          reason: 'Owned independent native route',
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
      const written = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        pointIntent,
      );
      const terminal = async (
        receipt: { operationId: string },
        state: string,
      ) => {
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
        return api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        );
      };
      const records = [await terminal(written, 'serviceAccepted')];
      await expect(row).toContainText('20');
      const action = await api(
        request,
        gateway,
        token,
        'POST',
        `/action/${numericAction.id}/debug`,
        { ...expectation, params: { value: 30 }, idempotencyKey: randomUUID() },
      );
      records.push(await terminal(action, 'serviceAccepted'));
      await expect(row).toContainText('30');
      const rejection = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          ...expectation,
          pointId: rejected.id,
          value: 1,
          idempotencyKey: randomUUID(),
        },
      );
      records.push(await terminal(rejection, 'protocolRejected'));
      const duplicate = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        pointIntent,
      );
      expect(duplicate.operationId).toBe(written.operationId);
      const before = writes();
      const fractional = await request.post(
        `${gateway.origin}/api/point/write`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: { ...pointIntent, value: 20.001, idempotencyKey: randomUUID() },
        },
      );
      expect(fractional.status(), await fractional.text()).toBe(422);
      expect(writes()).toBe(before);
      const serviceCount = () =>
        rows().filter((record) =>
          ['clearEvents', 'clearMaximum', 'clearMeter', 'freeze'].includes(
            record.state,
          ),
        ).length;
      const serviceAction = (command: string) => {
        const configured = actions.find(
          (entry: { command: string }) => entry.command === command,
        );
        expect(configured).toBeTruthy();
        return configured;
      };
      const invalidService = async (command: string, input: unknown) => {
        const before = serviceCount();
        const response = await request.post(
          `${gateway.origin}/api/action/${serviceAction(command).id}/debug`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            data: {
              ...expectation,
              params: { input },
              idempotencyKey: randomUUID(),
            },
          },
        );
        expect(response.status(), await response.text()).toBe(422);
        expect(serviceCount()).toBe(before);
      };
      for (const command of ['clear-maximum', 'clear-meter'])
        await invalidService(command, false);
      let lastServiceId = action.operationId;
      if (version === 1997) {
        for (const [command, input] of [
          ['freeze', '99999999'],
          ['clear-meter', true],
          ['clear-events', 'FFFFFFFF'],
        ] as const)
          await invalidService(command, input);
      } else {
        await invalidService('freeze', '04311230');
        await invalidService('clear-events', '90FF');
        await invalidService('clear-events', '03000100');
      }
      const runService = async (
        command: string,
        input: unknown,
        state: string,
      ) => {
        const receipt = await api(
          request,
          gateway,
          token,
          'POST',
          `/action/${serviceAction(command).id}/debug`,
          {
            ...expectation,
            timeoutMs: controlFault === 'silent' ? 250 : 3000,
            params: { input },
            idempotencyKey: randomUUID(),
          },
        );
        records.push(await terminal(receipt, state));
        await expect.poll(() => serviceCount()).toBeGreaterThan(0);
        lastServiceId = receipt.operationId;
        return receipt;
      };
      if (version === 1997 || controlFault === 'silent') {
        await runService('clear-maximum', true, 'indeterminate');
        const before = serviceCount();
        const fenced = await request.post(
          `${gateway.origin}/api/action/${serviceAction('clear-maximum').id}/debug`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            data: {
              ...expectation,
              params: { input: true },
              idempotencyKey: randomUUID(),
            },
          },
        );
        expect(fenced.status(), await fenced.text()).toBe(409);
        expect(serviceCount()).toBe(before);
      } else {
        for (const [command, input] of [
          ['freeze', '99999999'],
          ['clear-maximum', true],
          ['clear-events', '030001FF'],
          ['clear-events', 'FFFFFFFF'],
          ['clear-meter', true],
        ] as const) {
          await runService(command, input, 'serviceAccepted');
        }
        await expect(row).toContainText('0');
      }
      await writeFile(
        testInfo.outputPath('dlt645-governed-operations.json'),
        JSON.stringify(records, null, 2),
      );
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(lastServiceId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: lastServiceId }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('dlt645-action-history.png'),
        fullPage: true,
      });
      expect(errors).toEqual([]);
      if (version === 1997 || controlFault === 'silent') {
        const before = serviceCount();
        const blocked = await request.put(
          `${gateway.origin}/api/channel/change-status`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            data: { id: channel.id, status: 1 },
          },
        );
        expect(blocked.status(), await blocked.text()).toBe(409);
        expect(serviceCount()).toBe(before);
        await expect(
          page.getByText('结果未知。请核实现场', { exact: false }),
        ).toBeVisible();
        await page
          .getByRole('checkbox', { name: /我已核实这里显示的原操作目标/ })
          .check();
        await page
          .getByPlaceholder('核实原因')
          .fill(
            'Owned lab peer received one original clear; unknown application evidence remains',
          );
        await page
          .getByPlaceholder('现场核实依据、结果和参考记录')
          .fill(
            `Synthetic ${version} meter clearMaximum trace reviewed once. No protocol application acknowledgement is asserted. Lab occupancy is released by the operator.`,
          );
        await page.getByRole('button', { name: '记录核实并解除占用' }).click();
        const resolved = await terminal(
          { operationId: lastServiceId },
          'resolvedByOperator',
        );
        expect(
          resolved.events.some(
            (event: { state: string }) => event.state === 'indeterminate',
          ),
        ).toBe(true);
        expect(serviceCount()).toBe(before);
        records.push(resolved);
        await writeFile(
          testInfo.outputPath('dlt645-governed-operations.json'),
          JSON.stringify(records, null, 2),
        );
      }
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
      await expect
        .poll(
          () =>
            rows().findLast((row) => row.state === 'connectionClosed')
              ?.activeConnections,
        )
        .toBe(0);
      completed = true;
    } finally {
      const exited =
        peer.exitCode === null ? once(peer, 'exit') : Promise.resolve();
      if (peer.exitCode === null) peer.kill('SIGTERM');
      await exited;
      expect(peer.exitCode).toBe(0);
      if (completed) {
        const final = rows().find((row) => row.state === 'final');
        expect(final?.activeConnections).toBe(0);
        expect(final?.writes).toBe(2);
        expect(final?.values[String(Number.parseInt(di, 16))]).toBe(
          version === 2007 && controlFault === 'normal'
            ? '00000000'
            : '00150000',
        );
        expect(final?.controls.clearMaximum).toBe(1);
        if (version === 2007 && controlFault === 'normal') {
          expect(final?.controls.freeze).toBe(1);
          expect(final?.controls.clearEvents).toBe(2);
          expect(final?.controls.clearMeter).toBe(1);
        }
      }
      await writeFile(
        testInfo.outputPath('dlt645-independent-peer.log'),
        output,
      );
    }
  });
}
