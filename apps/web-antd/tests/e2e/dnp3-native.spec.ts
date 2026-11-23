import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerPath = process.env.NG_DNP3_REFERENCE_PEER;
test.skip(!peerPath, 'Requires the pinned independent native OpenDNP3 peer');

for (const slow of [false, true]) {
  test(`DNP3 independent native ${slow ? 'late response remains unresolved' : 'reports and governed services'} closes through Core and UI`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    if (!peerPath) throw new Error('Missing native OpenDNP3 peer');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('No local peer port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn(
      peerPath,
      [String(port), ...(slow ? ['slow-operate'] : [])],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (value: Buffer) => {
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
        .poll(() => rows().some((row) => row.library === 'OpenDNP3-3.1.2'))
        .toBe(true);
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_dnp3',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'dnp3',
      );
      expect(driver).toBeTruthy();
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      const configuration = {
        name: `dnp3-native-${slow ? 'late' : 'normal'}`,
        driverId: driver.id,
        status: 1,
        collectionType: 0,
        reportType: 0,
        period: null,
        connectionPolicy: {
          connectTimeoutMs: 3000,
          readTimeoutMs: 3000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          connection: { type: 'tcp', host: '127.0.0.1', port },
          localAddr: 2,
          remoteAddr: 1,
          responseTimeoutMs: 1000,
          integrityScanIntervalMs: 500,
          eventScanIntervalMs: 100,
          maxPoints: 64,
          maxReadFragments: 16,
          maxReadBytes: 65_536,
          maxFragmentObjects: 128,
          maxFragmentBytes: 65_536,
        },
      };
      for (const invalid of [
        { ...configuration, collectionType: 1, period: 500 },
        {
          ...configuration,
          driverConfig: {
            ...configuration.driverConfig,
            eventScanIntervalMs: 0,
          },
        },
        {
          ...configuration,
          driverConfig: {
            ...configuration.driverConfig,
            responseTimeoutMs: 3_600_001,
          },
        },
        {
          ...configuration,
          driverConfig: { ...configuration.driverConfig, maxReadFragments: 0 },
        },
      ]) {
        const response = await request.post(`${gateway.origin}/api/channel`, {
          headers,
          data: invalid,
        });
        expect(response.status(), await response.text()).toBe(422);
      }
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
        deviceName: 'Owned independent OpenDNP3 memory',
        deviceType: 'OpenDNP3-3.1.2',
        driverConfig: {},
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
          name: 'Original analog',
          key: 'dnp3-ai',
          dataType: 10,
          transformScale: 2,
          driverConfig: { group: 30, index: 0 },
        },
        {
          name: 'Independent alias',
          key: 'dnp3-alias',
          dataType: 10,
          transformScale: 3,
          driverConfig: { group: 30, index: 0 },
        },
        {
          name: 'Governed analog output',
          key: 'dnp3-ao',
          dataType: 10,
          transformScale: 2,
          accessMode: 2,
          driverConfig: {
            group: 40,
            index: 0,
            controlMode: 'selectBeforeOperate',
          },
        },
        {
          name: 'Native binary output',
          key: 'dnp3-bo',
          dataType: 0,
          driverConfig: { group: 10, index: 0 },
        },
      ])
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
        });
      const input = {
        name: 'Value',
        key: 'value',
        required: true,
        defaultValue: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
      };
      const actions = [
        {
          command: 'analog-direct',
          inputs: [
            {
              ...input,
              dataType: 9,
              transformDataType: 10,
              transformScale: 2,
              driverConfig: {
                group: 41,
                index: 0,
                controlMode: 'directOperate',
              },
            },
          ],
        },
        {
          command: 'relay',
          inputs: [
            {
              ...input,
              dataType: 2,
              driverConfig: {
                group: 12,
                index: 0,
                controlMode: 'selectBeforeOperate',
              },
            },
          ],
        },
        {
          command: 'reject-select',
          inputs: [
            {
              ...input,
              dataType: 2,
              driverConfig: {
                group: 12,
                index: 1,
                controlMode: 'selectBeforeOperate',
              },
            },
          ],
        },
        {
          command: 'partial-analog',
          inputs: [0, 1].map((index) => ({
            ...input,
            key: `v${index}`,
            dataType: 5,
            driverConfig: { group: 41, index, controlMode: 'directOperate' },
          })),
        },
        ...[200, 201].map((group) => ({
          command: `restart-${group}`,
          inputs: [
            { ...input, dataType: 0, driverConfig: { group, index: 0 } },
          ],
        })),
      ];
      for (const action of actions)
        await api(request, gateway, token, 'POST', '/action', {
          deviceId: device.id,
          name: action.command,
          ...action,
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
        (entry: { key: string }) => entry.key === 'dnp3-ao',
      );
      const configuredActions = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
      const actionId = (command: string) =>
        configuredActions.find(
          (entry: { command: string }) => entry.command === command,
        ).id;
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
      await expect(row('dnp3-ai')).toContainText('24.68');
      await expect(row('dnp3-ai')).toContainText('可疑');
      await expect(row('dnp3-alias')).toContainText(String(12.34 * 3));
      await page.screenshot({
        path: testInfo.outputPath('dnp3-original-quality-and-aliases.png'),
        fullPage: true,
      });
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        { authorityId, label: 'Owned OpenDNP3 memory' },
      );
      await api(
        request,
        gateway,
        token,
        'POST',
        `/control/authorities/${authorityId}/verify`,
        {
          expectedRevision: authority.revision,
          reason: 'Owned memory has no physical outputs',
          evidence: { port, library: 'OpenDNP3-3.1.2' },
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
          reason: 'Bind owned native memory',
          routeSnapshot: { port, local: 2, remote: 1 },
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
          reason: 'Verify independent native route',
          evidence: { port },
        },
      );
      const expectation = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        timeoutMs: slow ? 250 : 3000,
      };
      const records: unknown[] = [];
      const terminal = async (
        receipt: { operationId: string },
        state: string,
      ) => {
        await expect
          .poll(async () => {
            const detail = await api(
              request,
              gateway,
              token,
              'GET',
              `/control/operations/${receipt.operationId}`,
            );
            return detail.operation.state;
          })
          .toBe(state);
        const detail = await api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        );
        records.push(detail);
        return detail;
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
          value: 20,
          idempotencyKey: randomUUID(),
        },
      );
      const writtenRecord = await terminal(
        written,
        slow ? 'indeterminate' : 'serviceAccepted',
      );
      expect(
        writtenRecord.events.some(
          (event: { state: string }) => event.state === 'selected',
        ),
      ).toBe(true);
      let lastOperation = written.operationId;
      if (slow) {
        await expect
          .poll(
            () =>
              rows().findLast((record) => record.stage === 'operateAnalog')
                ?.operates,
          )
          .toBe(1);
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
          .toBe('Connected');
        const denied = await request.post(`${gateway.origin}/api/point/write`, {
          headers,
          data: {
            ...expectation,
            pointId: point.id,
            value: 30,
            idempotencyKey: randomUUID(),
          },
        });
        expect(denied.status(), await denied.text()).toBe(409);
      } else {
        await expect(row('dnp3-ao')).toContainText('20');
        for (const [command, params, state] of [
          ['analog-direct', { value: 25.5 }, 'serviceAccepted'],
          ['relay', { value: 3 }, 'serviceAccepted'],
          ['reject-select', { value: 3 }, 'protocolRejected'],
          ['partial-analog', { v0: 42, v1: 43 }, 'partialServiceAccepted'],
          ['restart-200', { value: true }, 'serviceAccepted'],
          ['restart-201', { value: true }, 'serviceAccepted'],
        ] as const) {
          const receipt = await api(
            request,
            gateway,
            token,
            'POST',
            `/action/${actionId(command)}/debug`,
            { ...expectation, params, idempotencyKey: randomUUID() },
          );
          await terminal(receipt, state);
          lastOperation = receipt.operationId;
          if (command === 'analog-direct')
            await expect(row('dnp3-ao')).toContainText('25.5');
        }
        for (const group of [200, 201]) {
          const denied = await request.post(
            `${gateway.origin}/api/action/${actionId(`restart-${group}`)}/debug`,
            {
              headers,
              data: {
                ...expectation,
                params: { value: false },
                idempotencyKey: randomUUID(),
              },
            },
          );
          expect(denied.status(), await denied.text()).toBe(422);
        }
        expect(
          rows().findLast((record) => record.restarts === 2)?.restarts,
        ).toBe(2);
      }
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(lastOperation);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: lastOperation }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('dnp3-durable-control-history.png'),
        fullPage: true,
      });
      if (slow) {
        const denied = await request.put(
          `${gateway.origin}/api/channel/change-status`,
          { headers, data: { id: channel.id, status: 1 } },
        );
        expect(denied.status(), await denied.text()).toBe(409);
        await expect(
          page.getByText('结果未知。请核实现场', { exact: false }),
        ).toBeVisible();
        await page
          .getByRole('checkbox', { name: /我已核实这里显示的原操作目标/ })
          .check();
        await page
          .getByPlaceholder('核实原因')
          .fill(
            'Owned native memory applied exactly one original output; late response is not acceptance evidence',
          );
        await page
          .getByPlaceholder('现场核实依据、结果和参考记录')
          .fill(
            'Reviewed native OpenDNP3 callback log. The operator releases this lab occupancy; no timely protocol response or field-device completion is claimed.',
          );
        await page.getByRole('button', { name: '记录核实并解除占用' }).click();
        await terminal(written, 'resolvedByOperator');
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
            rows().findLast((record) => record.stage === 'connectionState')
              ?.active,
        )
        .toBe(0);
      if (slow)
        expect(
          rows().findLast((record) => record.stage === 'operateAnalog')
            ?.operates,
        ).toBe(1);
      expect(errors).toEqual([]);
      await writeFile(
        testInfo.outputPath('dnp3-governed-operations.json'),
        JSON.stringify(records, null, 2),
      );
    } finally {
      const exited =
        peer.exitCode === null && peer.signalCode === null
          ? once(peer, 'exit')
          : Promise.resolve();
      if (peer.exitCode === null && peer.signalCode === null)
        peer.stdin.end('stop\n');
      await exited;
      await writeFile(
        testInfo.outputPath('dnp3-independent-native-peer.log'),
        output,
      );
    }
  });
}
