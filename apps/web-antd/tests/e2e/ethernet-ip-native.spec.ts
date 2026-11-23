import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { CipTimeoutBridge } from './ethernet-ip-bridge';
import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

type CompletionEvent = {
  completionFingerprint: null | string;
  evidence: null | {
    driverCompletion?: {
      evidence?: Record<string, unknown>;
      kind: string;
    };
  };
};

for (const direct of [false, true]) {
  const binary = direct
    ? process.env.NG_EIP_DIRECT_REFERENCE_PEER
    : process.env.NG_EIP_REFERENCE_PEER;
  test(`EtherNet/IP native ${direct ? 'direct' : 'UCMM slot zero'} collection and governed controls through Core/UI`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.skip(
      !binary,
      'Requires the pinned explicitly qualified native libplctag fixture',
    );
    test.setTimeout(180_000);
    if (!binary) throw new Error('Missing native CIP fixture');
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing owned port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn(
      binary,
      [
        '--plc=Omron',
        '--path=1,0',
        `--port=${port}`,
        '--tag=Counter:DINT[1]',
        '--tag=Rate:REAL[1]',
        '--tag=Exact:LINT[1]',
        '--tag=Text:STRING[1]',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const errors: string[] = [];
    const records: unknown[] = [];
    let bridge: CipTimeoutBridge | undefined;
    let bridgeFailure: unknown;
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > 8 * 1024 * 1024) {
          errors.push('Native log capacity exceeded');
          peer.kill('SIGINT');
        } else output += data.toString();
      });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await expect
        .poll(async () => {
          if (peer.exitCode !== null)
            throw new Error(`Native fixture exited: ${output}`);
          return await new Promise<boolean>((resolve) => {
            const socket = createConnection({ host: '127.0.0.1', port });
            socket.once('connect', () => {
              socket.end();
              resolve(true);
            });
            socket.once('error', () => {
              socket.destroy();
              resolve(false);
            });
          });
        })
        .toBe(true);
      if (!direct) bridge = await CipTimeoutBridge.start(port);
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_ethernet_ip',
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const driver = drivers.find(
        (entry: { driverType: string }) => entry.driverType === 'ethernet-ip',
      );
      expect(driver).toBeTruthy();
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      const configuration = {
        name: `eip-native-${direct ? 'direct' : 'slot-zero'}`,
        driverId: driver.id,
        status: 1,
        collectionType: 1,
        reportType: 1,
        period: 200,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 3000,
          writeTimeoutMs: 3000,
        },
        driverConfig: {
          controllerProfile: 'countedScalar',
          controllerIdentity: {
            vendorId: 1,
            deviceType: 14,
            productCode: 4660,
            revisionMajor: 32,
            revisionMinor: 2,
            serialNumber: 1_985_229_328,
          },
          host: '127.0.0.1',
          port: bridge?.port ?? port,
          backplaneSlot: direct ? null : 0,
          messageMode: direct ? 'directCip' : 'unconnectedSend',
          stringEncoding: 'latin1',
          maxStringBytes: 255,
          timeout: 1500,
          poolSize: 2,
          batchSize: 1,
          maxPoints: 64,
          maxResponseBytes: 65_535,
          maxPendingBytes: 8 * 1024 * 1024,
        },
      };
      for (const driverConfig of [
        { ...configuration.driverConfig, slot: 0 },
        { ...configuration.driverConfig, maxTimeouts: 3 },
        {
          ...configuration.driverConfig,
          messageMode: 'directCip',
          backplaneSlot: 0,
        },
      ]) {
        const invalid = await request.post(`${gateway.origin}/api/channel`, {
          headers,
          data: { ...configuration, driverConfig },
        });
        expect(invalid.status(), await invalid.text()).toBe(422);
      }
      const overHostCapacity = await request.post(
        `${gateway.origin}/api/channel`,
        {
          headers,
          data: {
            ...configuration,
            name: 'Refuse aggregate catalog capacity before commit',
            driverConfig: {
              ...configuration.driverConfig,
              host: 'catalog-budget.invalid',
              poolSize: 32,
              maxMetadataBytes: 8 * 1024 * 1024,
            },
          },
        },
      );
      expect(overHostCapacity.status(), await overHostCapacity.text()).toBe(
        429,
      );
      expect(
        await api(request, gateway, token, 'GET', '/channel/list'),
      ).toEqual([]);
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
      expect(channel).toBeTruthy();
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Owned native CIP memory',
        deviceType: 'Qualified libplctag software fixture',
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
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        accessMode: 2,
      };
      for (const point of [
        {
          name: 'Counter engineering',
          key: 'eip-counter',
          dataType: 5,
          transformDataType: 10,
          transformScale: 2,
          driverConfig: { tagName: 'Counter' },
        },
        {
          name: 'Counter alias',
          key: 'eip-alias',
          dataType: 5,
          transformDataType: 10,
          transformScale: 3,
          driverConfig: { tagName: 'Counter' },
        },
        {
          name: 'Counter bit',
          key: 'eip-bit0',
          dataType: 0,
          driverConfig: { tagName: 'Counter.0' },
        },
        {
          name: 'Rate engineering',
          key: 'eip-rate',
          dataType: 9,
          transformDataType: 10,
          transformScale: 4,
          driverConfig: { tagName: 'Rate' },
        },
        {
          name: 'Exact LINT',
          key: 'eip-exact',
          dataType: 7,
          driverConfig: { tagName: 'Exact' },
        },
        {
          name: 'Latin1 text',
          key: 'eip-text',
          dataType: 11,
          driverConfig: { tagName: 'Text' },
        },
      ])
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          ...point,
        });
      const invalidPoint = await request.post(`${gateway.origin}/api/point`, {
        headers,
        data: {
          ...base,
          name: 'Ambiguous layout',
          key: 'eip-ambiguous',
          dataType: 0,
          driverConfig: { tagName: 'Flags[32]' },
        },
      });
      expect(invalidPoint.status(), await invalidPoint.text()).toBe(422);
      const input = {
        name: 'Value',
        required: true,
        defaultValue: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
      };
      for (const action of [
        {
          name: 'Set two scalars',
          command: 'set-scalars',
          inputs: [
            {
              ...input,
              key: 'counter',
              dataType: 5,
              transformDataType: 10,
              transformScale: 2,
              driverConfig: { tagName: 'Counter' },
            },
            {
              ...input,
              key: 'rate',
              dataType: 9,
              transformDataType: 10,
              transformScale: 2,
              driverConfig: { tagName: 'Rate' },
            },
          ],
        },
        {
          name: 'Known partial acceptance',
          command: 'partial-scalars',
          inputs: [
            {
              ...input,
              key: 'counter',
              dataType: 5,
              transformDataType: 10,
              transformScale: 2,
              driverConfig: { tagName: 'Counter' },
            },
            {
              ...input,
              key: 'text',
              dataType: 11,
              driverConfig: { tagName: 'Counter' },
            },
          ],
        },
        {
          name: 'Known unsent text',
          command: 'unsent-text',
          inputs: [
            {
              ...input,
              key: 'text',
              dataType: 11,
              driverConfig: { tagName: 'Counter' },
            },
          ],
        },
      ])
        await api(request, gateway, token, 'POST', '/action', {
          deviceId: device.id,
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
      const actions = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
      const pointId = (key: string) => {
        const entry = points.find(
          (point: { key: string }) => point.key === key,
        );
        expect(entry).toBeTruthy();
        return entry.id;
      };
      const actionId = (command: string) => {
        const entry = actions.find(
          (action: { command: string }) => action.command === command,
        );
        expect(entry).toBeTruthy();
        return entry.id;
      };
      await page.goto(`${gateway.origin}/#/auth/login`);
      await page
        .getByPlaceholder('请输入用户名', { exact: true })
        .fill('system_admin');
      await page.getByPlaceholder('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'login', exact: true }).click();
      await expect(page).toHaveURL(/\/home/);
      const select = async (label: string, value: string) => {
        const control = page.locator(
          `.ant-select[aria-label="${label}"]:visible`,
        );
        await expect(control).toBeVisible();
        const selected = control.locator('.ant-select-selection-item');
        let current: string | undefined;
        if ((await selected.count()) > 0) {
          const text = await selected.textContent();
          current = text?.trim();
        }
        if (current !== value) {
          const input = control.getByRole('combobox');
          await expect(input).toBeEnabled();
          await control.locator('.ant-select-selector').click();
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(value, { exact: true })
            .click();
        }
        await expect(selected).toHaveText(value);
      };
      const showMonitor = async () => {
        await page.goto(`${gateway.origin}/#/maintenance/monitor`);
        await select('通道', configuration.name);
        await select('设备', device.deviceName);
      };
      await showMonitor();
      const valueCell = (key: string) =>
        page
          .locator('tr')
          .filter({ has: page.getByText(key, { exact: true }) })
          .locator('td')
          .nth(2);
      await expect(valueCell('eip-counter')).toHaveText('0');
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        { authorityId, label: 'Owned native CIP fixture' },
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
          evidence: { port, fixture: 'libplctag-2.7.2-qualified' },
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
          reason: 'Bind owned native endpoint',
          routeSnapshot: configuration.driverConfig,
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
          reason: 'Verify explicit software route',
          evidence: { port, direct },
        },
      );
      const expected = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        timeoutMs: 3000,
      };
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
            return {
              completionRecorded: detail.events.some(
                (event: CompletionEvent) =>
                  typeof event.completionFingerprint === 'string',
              ),
              state: detail.operation.state,
            };
          })
          .toEqual({ completionRecorded: true, state });
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
      const write = async (key: string, value: unknown) =>
        await api(request, gateway, token, 'POST', '/point/write', {
          ...expected,
          pointId: pointId(key),
          value,
          idempotencyKey: randomUUID(),
        });
      await terminal(await write('eip-counter', 18), 'serviceAccepted');
      await expect(valueCell('eip-counter')).toHaveText('18');
      await expect(valueCell('eip-alias')).toHaveText('27');
      await expect(valueCell('eip-bit0')).toHaveText('true');
      await terminal(
        await write('eip-exact', '9007199254740993'),
        'serviceAccepted',
      );
      await expect(valueCell('eip-exact')).toHaveText('9007199254740993');
      await terminal(await write('eip-text', 'café'), 'serviceAccepted');
      await expect(valueCell('eip-text')).toHaveText('café');
      const runAction = async (command: string, params: unknown) =>
        await api(
          request,
          gateway,
          token,
          'POST',
          `/action/${actionId(command)}/debug`,
          { ...expected, params, idempotencyKey: randomUUID() },
        );
      await terminal(
        await runAction('set-scalars', { counter: 36, rate: 25.5 }),
        'serviceAccepted',
      );
      await expect(valueCell('eip-counter')).toHaveText('36');
      await expect(valueCell('eip-alias')).toHaveText('54');
      await expect(valueCell('eip-rate')).toHaveText('51');
      const unsent = await terminal(
        await runAction('unsent-text', { text: 'a'.repeat(83) }),
        'failedBeforeDispatch',
      );
      const unsentCompletion = unsent.events.find(
        (event: CompletionEvent) =>
          typeof event.completionFingerprint === 'string',
      )?.evidence?.driverCompletion;
      expect(unsentCompletion).toMatchObject({
        evidence: {
          acceptedRequests: 0,
          indeterminateRequests: 0,
          rejectedRequests: 0,
          requestIndex: 0,
          totalRequests: 1,
          unsentRequests: 1,
          writerBoundaryEntered: false,
        },
        kind: 'notSent',
      });
      const partialReceipt = await runAction('partial-scalars', {
        counter: 44,
        text: 'a'.repeat(83),
      });
      const partial = await terminal(partialReceipt, 'partialServiceAccepted');
      const partialCompletion = partial.events.find(
        (event: CompletionEvent) =>
          typeof event.completionFingerprint === 'string',
      )?.evidence?.driverCompletion;
      expect(partialCompletion).toMatchObject({
        evidence: {
          acceptedRequests: 1,
          indeterminateRequests: 0,
          rejectedRequests: 0,
          requestIndex: 1,
          totalRequests: 2,
          unsentRequests: 1,
          writerBoundaryEntered: false,
        },
        kind: 'partialServiceAcceptance',
      });
      await expect(valueCell('eip-counter')).toHaveText('44');
      await expect(valueCell('eip-alias')).toHaveText('66');
      await terminal(await write('eip-counter', 46), 'serviceAccepted');
      await expect(valueCell('eip-counter')).toHaveText('46');
      await page.screenshot({
        path: testInfo.outputPath('ethernet-ip-native-monitor.png'),
        fullPage: true,
      });
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(partialReceipt.operationId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: partialReceipt.operationId }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('ethernet-ip-native-receipts.png'),
        fullPage: true,
      });
      if (bridge) {
        const previousControls = bridge.controlForwards;
        bridge.armTimeout();
        const uncertainReceipt = await write('eip-counter', 50);
        const unknown = await terminal(uncertainReceipt, 'indeterminate');
        const completion = unknown.events.find(
          (event: CompletionEvent) =>
            typeof event.completionFingerprint === 'string',
        )?.evidence?.driverCompletion;
        expect(completion).toMatchObject({
          evidence: {
            acceptedRequests: 0,
            indeterminateRequests: 1,
            nativeFailureStatus: {
              additionalStatus: [0x02_04],
              generalStatus: 1,
              service: 210,
            },
            rejectedRequests: 0,
            totalRequests: 1,
            unsentRequests: 0,
            writerBoundaryEntered: true,
          },
          kind: 'indeterminate',
        });
        expect(bridge.injectedTimeouts).toBe(1);
        expect(bridge.controlForwards).toBe(previousControls + 1);
        await showMonitor();
        await expect(valueCell('eip-counter')).toHaveText('50');
        await expect(valueCell('eip-alias')).toHaveText('75');
        const blocked = await request.post(
          `${gateway.origin}/api/point/write`,
          {
            headers,
            data: {
              ...expected,
              pointId: pointId('eip-counter'),
              value: 52,
              idempotencyKey: randomUUID(),
            },
          },
        );
        const blockedBody = await blocked.text();
        expect(blocked.status(), blockedBody).toBe(409);
        expect(bridge.controlForwards).toBe(previousControls + 1);
        await expect(valueCell('eip-counter')).toHaveText('50');
        await page.screenshot({
          path: testInfo.outputPath('ethernet-ip-native-ucmm-unknown.png'),
          fullPage: true,
        });
        records.push({
          bridgeTimeout: {
            blockedBody,
            blockedStatus: blocked.status(),
            forwardedControls: bridge.controlForwards,
            injectedTimeouts: bridge.injectedTimeouts,
          },
        });
        const disable = await request.put(
          `${gateway.origin}/api/channel/change-status`,
          { headers, data: { id: channel.id, status: 1 } },
        );
        expect(disable.status(), await disable.text()).toBe(409);
        await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
        await page
          .getByPlaceholder('操作 ID')
          .fill(uncertainReceipt.operationId);
        await page
          .getByRole('button', { name: '查询操作', exact: true })
          .click();
        await expect(
          page.getByText('结果未知。请核实现场', { exact: false }),
        ).toBeVisible();
        await page
          .getByRole('checkbox', { name: /我已核实这里显示的原操作目标/ })
          .check();
        await page
          .getByPlaceholder('核实原因')
          .fill(
            'Owned native memory was read back after the single forwarded write',
          );
        await page
          .getByPlaceholder('现场核实依据、结果和参考记录')
          .fill(
            'The native C peer confirmed the write before the test bridge replaced its reply. A new session observed Counter=25 (logical50). This explicit operator action releases lab occupancy without inventing a timely protocol confirmation or field-device completion.',
          );
        await page.screenshot({
          path: testInfo.outputPath(
            'ethernet-ip-native-ucmm-reconciliation.png',
          ),
          fullPage: true,
        });
        await page.getByRole('button', { name: '记录核实并解除占用' }).click();
        const resolved = await terminal(uncertainReceipt, 'resolvedByOperator');
        expect(
          resolved.events.find(
            (event: CompletionEvent) =>
              typeof event.completionFingerprint === 'string',
          )?.evidence?.driverCompletion,
        ).toEqual(completion);
        await terminal(await write('eip-counter', 52), 'serviceAccepted');
        expect(bridge.controlForwards).toBe(previousControls + 2);
        expect(bridge.injectedTimeouts).toBe(1);
        await showMonitor();
        await expect(valueCell('eip-counter')).toHaveText('52');
        await expect(valueCell('eip-alias')).toHaveText('78');
      }
      const beforeRestart = await terminal(
        await write('eip-counter', 54),
        'serviceAccepted',
      );
      await showMonitor();
      await expect(valueCell('eip-counter')).toHaveText('54');
      const controlsBeforeRestart = bridge?.controlForwards;
      await gateway.restart();
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
      const restored = await api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${beforeRestart.operation.operationId}`,
      );
      expect(restored.operation.state).toBe('serviceAccepted');
      expect(restored.events).toEqual(beforeRestart.events);
      if (bridge) expect(bridge.controlForwards).toBe(controlsBeforeRestart);
      await showMonitor();
      await expect(valueCell('eip-counter')).toHaveText('54');
      await expect(valueCell('eip-alias')).toHaveText('81');
      await terminal(await write('eip-counter', 56), 'serviceAccepted');
      await expect(valueCell('eip-counter')).toHaveText('56');
      await expect(valueCell('eip-alias')).toHaveText('84');
      if (bridge)
        expect(bridge.controlForwards).toBe((controlsBeforeRestart ?? 0) + 1);
      await page.screenshot({
        path: testInfo.outputPath(
          'ethernet-ip-restored-after-clean-restart.png',
        ),
        fullPage: true,
      });
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
      await writeFile(
        testInfo.outputPath('ethernet-ip-governed-operations.json'),
        JSON.stringify(records, null, 2),
      );
    } finally {
      try {
        await bridge?.stop();
      } catch (error) {
        bridgeFailure = error;
      }
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        peer.kill('SIGINT');
        const timer = new AbortController();
        try {
          await Promise.race([
            exited,
            delay(5000, undefined, { signal: timer.signal }).then(() => {
              peer.kill('SIGKILL');
              throw new Error('Native peer normal shutdown timed out');
            }),
          ]);
        } finally {
          timer.abort();
        }
      }
      await writeFile(
        testInfo.outputPath('ethernet-ip-native-peer.log'),
        output,
      );
    }
    if (bridgeFailure) throw bridgeFailure;
  });
}
