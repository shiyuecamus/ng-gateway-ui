import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

for (const mode of [
  'capacity',
  'rejected',
  'delayed',
  'uncorrelated',
  'healthy',
  'polling',
] as const) {
  test(`OPC UA ${mode} subscription establishment through Core and independent server`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    const python = process.env.NG_A4_OPCUA_PYTHON;
    test.skip(!python, 'Requires the pinned independent asyncua 1.1.5 server');
    if (!python) throw new Error('Missing independent OPC UA peer');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing owned OPC UA port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn(
      python,
      [
        resolve(import.meta.dirname, 'fixtures/opcua_subscription_peer.py'),
        String(port),
        mode,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const records = () =>
      output
        .split('\n')
        .filter((line) => line.startsWith('{') && line.endsWith('}'))
        .map((line) => JSON.parse(line));
    const writes = () =>
      records().filter((record) => record.event === 'writeValues').length;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let admin: string | undefined;
    let channelId: number | undefined;
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > 8 * 1024 * 1024) {
          peer.kill('SIGTERM');
          throw new Error('OPC UA peer exceeded its evidence limit');
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
        status: 1,
        collectionType: mode === 'polling' ? 1 : 0,
        period: mode === 'polling' ? 250 : null,
        reportType: 1,
        connectionPolicy: {
          connectTimeoutMs: 2500,
          readTimeoutMs: 2000,
          writeTimeoutMs: 2000,
          backoff: {
            maxAttempts: mode === 'healthy' || mode === 'polling' ? 10 : 0,
          },
        },
        driverConfig: {
          applicationName: 'A4 subscription acceptance',
          maxPendingPublishRequests: 2,
          applicationUri: 'urn:ng:a4:client',
          url: `opc.tcp://127.0.0.1:${port}/`,
          auth: { kind: 'anonymous' },
          securityPolicy: 0,
          securityMode: 1,
          subscribeBatchSize: 2,
          sessionTimeout: 10_000,
          keepAliveInterval: 1000,
        },
      };
      const legacy = await request.post(`${gateway.origin}/api/channel`, {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: {
          ...configuration,
          driverConfig: { ...configuration.driverConfig, readMode: 0 },
        },
      });
      expect(legacy.status(), await legacy.text()).toBe(422);
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
        channelId: channel.id,
        deviceName: 'Independent OPC UA memory',
        deviceType: 'FreeOpcUa 1.1.5',
        driverConfig: {},
      });
      const [device] = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/${channel.id}/sub-devices`,
      );
      for (const name of ['First', 'Second'])
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name,
          key: name.toLowerCase(),
          type: 1,
          dataType: 5,
          accessMode: 2,
          transformNegate: false,
          transformDataType:
            (mode === 'healthy' || mode === 'polling') && name === 'First'
              ? 10
              : null,
          transformScale:
            (mode === 'healthy' || mode === 'polling') && name === 'First'
              ? 2
              : null,
          driverConfig: { nodeId: `nsu=urn:ng:a4:physical-device;s=${name}` },
        });
      if (mode === 'healthy' || mode === 'polling') {
        for (const [name, dataType] of [
          ['Exact', 7],
          ['Unsigned', 8],
          ['Extended', 14],
        ] as const)
          await api(request, gateway, token, 'POST', '/point', {
            deviceId: device.id,
            name,
            key: name.toLowerCase(),
            type: 1,
            dataType,
            accessMode: 2,
            transformNegate: false,
            driverConfig: { nodeId: `nsu=urn:ng:a4:physical-device;s=${name}` },
          });
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name: 'First alias',
          key: 'alias',
          type: 1,
          dataType: 5,
          accessMode: 0,
          transformNegate: false,
          transformDataType: 10,
          transformScale: 3,
          driverConfig: { nodeId: 'nsu=urn:ng:a4:physical-device;s=First' },
        });
        await api(request, gateway, token, 'POST', '/action', {
          deviceId: device.id,
          name: 'Set independent native scalars',
          command: 'set-scalars',
          inputs: [
            {
              name: 'Value',
              key: 'value',
              required: true,
              defaultValue: null,
              dataType: 5,
              transformDataType: 10,
              transformScale: 2,
              transformNegate: false,
              driverConfig: { nodeId: 'nsu=urn:ng:a4:physical-device;s=First' },
            },
          ],
        });
      }
      await api(request, gateway, token, 'PUT', '/channel/change-status', {
        id: channel.id,
        status: 0,
      });
      if (mode === 'healthy' || mode === 'polling') {
        const connected = async () => {
          const detail = await api(
            request,
            gateway,
            token,
            'GET',
            `/channel/detail/${channel.id}`,
          );
          return detail.connectionState?.phase;
        };
        await expect.poll(connected, { timeout: 20_000 }).toBe('Connected');
        await page.goto(`${gateway.origin}/#/auth/login`);
        await page
          .getByPlaceholder('请输入用户名', { exact: true })
          .fill('system_admin');
        await page.getByPlaceholder('密码', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'login', exact: true }).click();
        await expect(page).toHaveURL(/\/home/);
        const monitor = async () => {
          await page.goto(`${gateway.origin}/#/maintenance/monitor`);
          await page.getByRole('combobox').nth(0).press('ArrowDown');
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(`opcua-${mode}`, { exact: true })
            .click();
          await page.getByRole('combobox').nth(1).press('ArrowDown');
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText('Independent OPC UA memory', { exact: true })
            .click();
          await page.getByRole('combobox').nth(1).press('Escape');
        };
        const valueCell = (key: string) =>
          page
            .locator('tr')
            .filter({ has: page.getByText(key, { exact: true }) })
            .locator('td')
            .nth(2);
        await monitor();
        await expect(valueCell('first')).toHaveText('14');
        await expect(valueCell('alias')).toHaveText('21');
        await expect(valueCell('second')).toHaveText('7');
        await expect(valueCell('exact')).toHaveText('9007199254740993');
        await expect(valueCell('unsigned')).toHaveText('18446744073709551615');
        await expect(valueCell('extended')).toHaveText(
          '170141183460469231731687303715884105727',
        );
        const authorityId = randomUUID();
        const authority = await api(
          request,
          gateway,
          token,
          'POST',
          '/control/authorities',
          { authorityId, label: 'Independent OPC UA software memory' },
        );
        await api(
          request,
          gateway,
          token,
          'POST',
          `/control/authorities/${authorityId}/verify`,
          {
            expectedRevision: authority.revision,
            reason: 'Owned software memory has no physical outputs',
            evidence: { endpoint: port, library: 'FreeOpcUa 1.1.5' },
          },
        );
        const detail = await api(
          request,
          gateway,
          token,
          'GET',
          `/channel/detail/${channel.id}`,
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
            reason: 'Bind independent OPC UA memory',
            routeSnapshot: detail.driverConfig,
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
            reason: 'Verify the owned software endpoint',
            evidence: { port },
          },
        );
        const points = await api(request, gateway, token, 'GET', '/point/list');
        const first = points.find(
          (point: { key: string }) => point.key === 'first',
        );
        const [action] = await api(
          request,
          gateway,
          token,
          'GET',
          `/action/by-device/${device.id}`,
        );
        const expected = {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: detail.configuration.appliedRevision,
          timeoutMs: 2000,
        };
        const controls: unknown[] = [];
        const completed = async (
          receipt: { operationId: string },
          state = 'serviceAccepted',
        ) => {
          await expect
            .poll(async () => {
              const operation = await api(
                request,
                gateway,
                token,
                'GET',
                `/control/operations/${receipt.operationId}`,
              );
              return {
                state: operation.operation.state,
                recorded: operation.events.some(
                  (event: { completionFingerprint?: null | string }) =>
                    typeof event.completionFingerprint === 'string',
                ),
              };
            })
            .toEqual({ state, recorded: true });
          const result = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${receipt.operationId}`,
          );
          controls.push(result);
          return result;
        };
        const exact = points.find(
          (point: { key: string }) => point.key === 'exact',
        );
        await completed(
          await api(request, gateway, token, 'POST', '/point/write', {
            ...expected,
            pointId: exact.id,
            value: '9223372036854775807',
            idempotencyKey: randomUUID(),
          }),
        );
        await expect(valueCell('exact')).toHaveText('9223372036854775807');
        await completed(
          await api(request, gateway, token, 'POST', '/point/write', {
            ...expected,
            pointId: first.id,
            value: 28,
            idempotencyKey: randomUUID(),
          }),
        );
        await expect(valueCell('first')).toHaveText('28');
        await expect(valueCell('alias')).toHaveText('42');
        const second = points.find(
          (point: { key: string }) => point.key === 'second',
        );
        await completed(
          await api(request, gateway, token, 'POST', '/point/write', {
            ...expected,
            pointId: second.id,
            value: 12,
            idempotencyKey: randomUUID(),
          }),
          'protocolRejected',
        );
        await expect(valueCell('second')).toHaveText('7');
        const original = await completed(
          await api(
            request,
            gateway,
            token,
            'POST',
            `/action/${action.id}/debug`,
            {
              ...expected,
              params: { value: 36 },
              idempotencyKey: randomUUID(),
            },
          ),
        );
        await expect(valueCell('first')).toHaveText('36');
        await expect(valueCell('alias')).toHaveText('54');
        if (mode === 'healthy') {
          const created = records().filter(
            (record) => record.event === 'createItems',
          ).length;
          const originalWrites = writes();
          peer.kill('SIGUSR2');
          await expect
            .poll(
              () =>
                records().filter((record) => record.event === 'createItems')
                  .length,
              { timeout: 20_000 },
            )
            .toBeGreaterThan(created);
          await expect.poll(connected, { timeout: 20_000 }).toBe('Connected');
          await monitor();
          await expect(valueCell('first')).toHaveText('36');
          await expect(valueCell('alias')).toHaveText('54');
          expect(writes()).toBe(originalWrites);
        }
        const writesBeforeReindex = writes();
        peer.kill('SIGUSR1');
        await expect
          .poll(() => output, { timeout: 20_000 })
          .toContain('"namespace": 3');
        await expect
          .poll(() => output, { timeout: 30_000 })
          .toContain('ns=3;s=First');
        await expect.poll(connected, { timeout: 30_000 }).toBe('Connected');
        await monitor();
        await expect(valueCell('first')).toHaveText('36');
        await expect(valueCell('alias')).toHaveText('54');
        expect(output).toContain('ns=3;s=First');
        expect(writes()).toBe(writesBeforeReindex);
        await gateway.restart();
        await expect.poll(connected, { timeout: 20_000 }).toBe('Connected');
        const restored = await api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${original.operation.operationId}`,
        );
        expect(restored.events).toEqual(original.events);
        expect(writes()).toBe(writesBeforeReindex);
        await completed(
          await api(request, gateway, token, 'POST', '/point/write', {
            ...expected,
            pointId: first.id,
            value: 40,
            idempotencyKey: randomUUID(),
          }),
        );
        await monitor();
        await expect(valueCell('first')).toHaveText('40');
        await expect(valueCell('alias')).toHaveText('60');
        await completed(
          await api(
            request,
            gateway,
            token,
            'POST',
            `/action/${action.id}/debug`,
            {
              ...expected,
              params: { value: 44 },
              idempotencyKey: randomUUID(),
            },
          ),
        );
        await expect(valueCell('first')).toHaveText('44');
        await expect(valueCell('alias')).toHaveText('66');
        await expect(valueCell('exact')).toHaveText('9223372036854775807');
        if (mode === 'polling') {
          const reads = records().filter(
            (record) => record.event === 'readValues',
          );
          expect(reads.length).toBeGreaterThan(0);
          for (const record of reads)
            expect(new Set(record.nodes).size).toBe(record.nodes.length);
        }
        const publishQueue = records().filter(
          (record) => record.event === 'publishQueue',
        );
        if (mode === 'healthy') {
          expect(publishQueue.length).toBeGreaterThan(0);
          const sizes = publishQueue.map((record) => Number(record.queued));
          expect(Math.max(...sizes)).toBeGreaterThan(0);
          expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
        } else {
          expect(publishQueue).toEqual([]);
        }
        await writeFile(
          testInfo.outputPath('publish-window-observations.json'),
          JSON.stringify(publishQueue, null, 2),
        );
        await writeFile(
          testInfo.outputPath('opcua-governed-controls.json'),
          JSON.stringify(controls, null, 2),
        );
        expect(errors).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath(
            'opcua-subscriptions-reindexed-and-restored.png',
          ),
          fullPage: true,
        });
        return;
      }
      const phases: string[] = [];
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
            const phase = detail.connectionState?.phase;
            if (typeof phase === 'string') phases.push(phase);
            return detail.configuration?.state;
          },
          { timeout: 7000 },
        )
        .toBe('failed');
      expect(phases).not.toContain('Connected');
      const detail = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/detail/${channel.id}`,
      );
      expect(detail.connectionState?.phase).not.toBe('Connected');
      const failurePatterns = {
        capacity: /MaxMonitoredItems/,
        delayed: /deadline|Timeout|timed out/,
        rejected: /monitored item/,
        uncorrelated: /NamespaceArray read failed/,
      };
      expect(detail.configuration.lastError).toMatch(failurePatterns[mode]);
      await writeFile(
        testInfo.outputPath('subscription-initialization.json'),
        JSON.stringify({ phases, detail, peer: output }, null, 2),
      );
      if (mode === 'rejected') expect(output).toContain('2150891520');
    } finally {
      if (admin && channelId)
        await api(request, gateway, admin, 'PUT', '/channel/change-status', {
          id: channelId,
          status: 1,
        });
      await writeFile(testInfo.outputPath('independent-peer.log'), output);
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        peer.kill('SIGTERM');
        const timer = new AbortController();
        try {
          const result = await Promise.race([
            exited,
            delay(10_000, undefined, { signal: timer.signal }).then(() => {
              peer.kill('SIGKILL');
              throw new Error('Independent OPC UA server did not stop');
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
