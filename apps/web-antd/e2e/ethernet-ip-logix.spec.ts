import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

type ReferenceManifest = {
  qualified: {
    cohort: string;
    directory: string;
    files: Record<string, string>;
  };
  toolchain: { dotnet: string; sha256: string };
};

type Operation = {
  events: Array<{
    completionFingerprint: null | string;
    evidence: null | { driverCompletion?: Record<string, unknown> };
  }>;
  operation: { operationId: string; state: string };
};

test.use({
  controlLimits: {
    maxRequestBytes: 12 * 1024,
    maxBindingBytes: 8 * 1024,
    maxPending: 1,
  },
});

for (const direct of [false, true]) {
  test(`Logix ${direct ? 'direct' : 'UCMM'} indexed catalogue, 16 STRING points and governed action through real Core/UI`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    const supplied = process.env.NG_EIP_LOGIX_REFERENCE_MANIFEST;
    test.skip(
      !supplied,
      'Requires the pinned, fully hashed managed reference cohort',
    );
    if (!supplied) throw new Error('Missing Logix reference manifest');
    test.setTimeout(240_000);
    const manifest = JSON.parse(
      await readFile(supplied, 'utf8'),
    ) as ReferenceManifest;
    const verifyReference = async () => {
      for (const [name, digest] of Object.entries(manifest.qualified.files)) {
        const actual = createHash('sha256')
          .update(await readFile(resolve(manifest.qualified.directory, name)))
          .digest('hex');
        expect(actual, `Managed reference artifact ${name}`).toBe(digest);
      }
      expect(
        createHash('sha256')
          .update(await readFile(manifest.toolchain.dotnet))
          .digest('hex'),
      ).toBe(manifest.toolchain.sha256);
    };
    await verifyReference();
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
      manifest.toolchain.dotnet,
      [
        resolve(manifest.qualified.directory, 'TemplatePeer.dll'),
        String(port),
        '--scale',
        '--fault-stdin',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
      },
    );
    let output = '';
    const errors: string[] = [];
    const operations: Operation[] = [];
    for (const stream of [peer.stdout, peer.stderr])
      stream.on('data', (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > 8 * 1024 * 1024) {
          errors.push('Managed reference log exceeded its byte limit');
          peer.kill('SIGINT');
        } else output += data.toString();
      });
    peer.stdin.on('error', (error) =>
      errors.push(`Reference input: ${error.message}`),
    );
    page.on('pageerror', (error) => errors.push(error.message));
    const writes = () => [...output.matchAll(/^WRITE \d+$/gm)].length;
    try {
      await expect
        .poll(() => {
          if (peer.exitCode !== null)
            throw new Error(`Reference exited before READY: ${output}`);
          return output.includes(`READY ${port} `);
        })
        .toBe(true);
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
      const configuration = {
        name: `logix-catalog-${direct ? 'direct' : 'ucmm'}`,
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
          controllerProfile: 'logix5000',
          controllerIdentity: {
            vendorId: 1,
            deviceType: 14,
            productCode: 55,
            revisionMajor: 32,
            revisionMinor: 11,
            serialNumber: 51966,
          },
          host: '127.0.0.1',
          port,
          backplaneSlot: null,
          messageMode: direct ? 'directCip' : 'unconnectedSend',
          stringEncoding: 'utf8',
          maxStringBytes: 255,
          timeout: 3000,
          poolSize: 1,
          batchSize: 50,
          maxPoints: 4096,
          maxResponseBytes: 512,
          maxPendingBytes: 8 * 1024 * 1024,
          maxMetadataBytes: 1024 * 1024,
          maxMetadataEntries: 16_384,
          maxMetadataExchanges: 256,
        },
      };
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
        deviceName: 'Owned Logix catalogue memory',
        deviceType:
          'Qualified reference; controller indicators and faults are simulated',
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
        dataType: 11,
        accessMode: 2,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
      };
      const points = [
        { key: 'logix-root', tag: 'tExT', initial: 'old' },
        { key: 'logix-array', tag: 'rOwS[1]', initial: 'second' },
        { key: 'logix-nested', tag: 'oUtEr.nEsTeD', initial: 'nested' },
        { key: 'logix-program', tag: 'Program:mAiN.tExT', initial: 'program' },
        ...Array.from({ length: 16 }, (_, index) => ({
          key: `logix-scale-${String(index).padStart(2, '0')}`,
          tag: `S${index}`,
          initial: 'scale',
        })),
      ];
      for (const point of points)
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          key: point.key,
          name: point.key,
          driverConfig: { tagName: point.tag },
        });
      const input = {
        required: true,
        dataType: 11,
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
          name: 'Set distinct template targets',
          command: 'set-logix-strings',
          inputs: [
            {
              ...input,
              name: 'Array text',
              key: 'array',
              driverConfig: { tagName: 'rOwS[1]' },
            },
            {
              ...input,
              name: 'Program text',
              key: 'program',
              driverConfig: { tagName: 'Program:mAiN.tExT' },
            },
          ],
        },
        {
          name: 'Prove declared DATA capacity',
          command: 'oversized-logix-text',
          inputs: [
            {
              ...input,
              name: 'Root text',
              key: 'text',
              driverConfig: { tagName: 'tExT' },
            },
          ],
        },
        {
          name: 'Admit resolved defaults before copying',
          command: 'oversized-default-inputs',
          inputs: ['array', 'program'].map((key) => ({
            ...input,
            name: key,
            key,
            required: false,
            defaultValue: 'x'.repeat(8 * 1024),
            driverConfig: {
              tagName: key === 'array' ? 'rOwS[1]' : 'Program:mAiN.tExT',
            },
          })),
        },
        {
          name: 'Admit logical and wire evidence before copying',
          command: 'oversized-default-snapshot',
          inputs: [
            {
              ...input,
              name: 'text',
              key: 'text',
              required: false,
              defaultValue: 'x'.repeat(8 * 1024),
              driverConfig: { tagName: 'tExT' },
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
      const storedPoints = await api(
        request,
        gateway,
        token,
        'GET',
        '/point/list',
      );
      const storedActions = await api(
        request,
        gateway,
        token,
        'GET',
        `/action/by-device/${device.id}`,
      );
      const pointId = (key: string) => {
        const point = storedPoints.find(
          (entry: { key: string }) => entry.key === key,
        );
        expect(point).toBeTruthy();
        return point.id;
      };
      const actionId = (command: string) => {
        const action = storedActions.find(
          (entry: { command: string }) => entry.command === command,
        );
        expect(action).toBeTruthy();
        return action.id;
      };
      const authorityId = randomUUID();
      const authority = await api(
        request,
        gateway,
        token,
        'POST',
        '/control/authorities',
        {
          authorityId,
          label: 'Owned synthetic Logix memory',
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
          reason: 'Owned software has no physical outputs',
          evidence: { port, fixtureCohort: manifest.qualified.cohort },
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
          reason: 'Bind owned loopback reference',
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
          reason: 'Verify exact owned software route',
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
            const detail = (await api(
              request,
              gateway,
              token,
              'GET',
              `/control/operations/${receipt.operationId}`,
            )) as Operation;
            return {
              state: detail.operation.state,
              recorded: detail.events.some(
                (event) => typeof event.completionFingerprint === 'string',
              ),
            };
          })
          .toEqual({ state, recorded: true });
        const detail = (await api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        )) as Operation;
        operations.push(detail);
        return detail;
      };
      const write = async (value: string) =>
        await api(request, gateway, token, 'POST', '/point/write', {
          ...expected,
          pointId: pointId('logix-root'),
          value,
          idempotencyKey: randomUUID(),
        });
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
        const selected = await control.textContent();
        if (selected?.includes(value)) return;
        const input = control.getByRole('combobox');
        await expect(input).toBeEnabled();
        await input.click();
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(value, { exact: true })
          .click();
        await expect(control).toContainText(value);
      };
      const showMonitor = async () => {
        await page.goto(`${gateway.origin}/#/maintenance/monitor`);
        await select('通道', configuration.name);
        await select('设备', device.deviceName);
      };
      const valueCell = (key: string) =>
        page
          .locator('tr')
          .filter({ has: page.getByText(key, { exact: true }) })
          .locator('td')
          .nth(2);
      await showMonitor();
      for (const point of points)
        await expect(valueCell(point.key)).toHaveText(point.initial);
      expect(writes()).toBe(0);
      await page.screenshot({
        path: testInfo.outputPath('logix-cold-catalogue-monitor.png'),
        fullPage: true,
      });
      await terminal(await write('root-中'), 'serviceAccepted');
      await expect(valueCell('logix-root')).toHaveText('root-中');
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await expect(page.getByText('参数列表', { exact: true })).toBeVisible();
      await select('通道', configuration.name);
      await select('设备', device.deviceName);
      await select('动作', 'Set distinct template targets');
      await page.getByLabel('Array text', { exact: false }).fill('array-中');
      await page.getByLabel('Program text', { exact: false }).fill('program-ÿ');
      const submitted = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .endsWith(`/action/${actionId('set-logix-strings')}/debug`),
      );
      await page
        .getByRole('button', { name: '执行设备操作', exact: true })
        .click();
      const response = await submitted;
      expect(response.status(), await response.text()).toBe(200);
      const submittedBody = await response.json();
      const receipt = submittedBody.data as { operationId: string };
      await terminal(receipt, 'serviceAccepted');
      await showMonitor();
      await expect(valueCell('logix-array')).toHaveText('array-中');
      await expect(valueCell('logix-program')).toHaveText('program-ÿ');
      await expect.poll(writes).toBe(3);
      const rejectedKey = randomUUID();
      for (const command of [
        'oversized-default-inputs',
        'oversized-default-snapshot',
      ]) {
        const denied = await request.post(
          `${gateway.origin}/api/action/${actionId(command)}/debug`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Gateway-Contract': 'boot',
            },
            data: {
              ...expected,
              params: {},
              idempotencyKey:
                command === 'oversized-default-inputs'
                  ? rejectedKey
                  : randomUUID(),
            },
          },
        );
        expect(denied.status(), await denied.text()).toBe(503);
        expect(writes()).toBe(3);
      }
      const suppliedOverrides = await api(
        request,
        gateway,
        token,
        'POST',
        `/action/${actionId('oversized-default-inputs')}/debug`,
        {
          ...expected,
          params: { array: 'override-array', program: 'override-program' },
          idempotencyKey: rejectedKey,
        },
      );
      await terminal(suppliedOverrides, 'serviceAccepted');
      await showMonitor();
      await expect(valueCell('logix-array')).toHaveText('override-array');
      await expect(valueCell('logix-program')).toHaveText('override-program');
      await expect.poll(writes).toBe(5);
      const beforeRefusal = writes();
      const refusal = await api(
        request,
        gateway,
        token,
        'POST',
        `/action/${actionId('oversized-logix-text')}/debug`,
        {
          ...expected,
          params: { text: 'x'.repeat(83) },
          idempotencyKey: randomUUID(),
        },
      );
      const refused = await terminal(refusal, 'failedBeforeDispatch');
      expect(
        refused.events.find(
          (event) => typeof event.completionFingerprint === 'string',
        )?.evidence?.driverCompletion,
      ).toMatchObject({
        kind: 'notSent',
        evidence: {
          acceptedRequests: 0,
          unsentRequests: 1,
          writerBoundaryEntered: false,
        },
      });
      expect(writes()).toBe(beforeRefusal);
      if (!peer.stdin.write('ARM_CHANGE\n')) await once(peer.stdin, 'drain');
      await expect.poll(() => output.includes('ARMED_CHANGE')).toBe(true);
      const uncertain = await write('uncertain');
      const unknown = await terminal(uncertain, 'indeterminate');
      const completion = unknown.events.find(
        (event) => typeof event.completionFingerprint === 'string',
      )?.evidence?.driverCompletion;
      expect(completion).toMatchObject({
        kind: 'indeterminate',
        evidence: {
          acceptedRequests: 0,
          indeterminateRequests: 1,
          unsentRequests: 0,
          writerBoundaryEntered: true,
        },
      });
      await expect.poll(writes).toBe(beforeRefusal + 1);
      await expect(valueCell('logix-root')).toHaveText('uncertain');
      const blocked = await request.post(`${gateway.origin}/api/point/write`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Gateway-Contract': 'boot',
        },
        data: {
          ...expected,
          pointId: pointId('logix-root'),
          value: 'blocked',
          idempotencyKey: randomUUID(),
        },
      });
      expect(blocked.status(), await blocked.text()).toBe(409);
      expect(writes()).toBe(beforeRefusal + 1);
      await page.screenshot({
        path: testInfo.outputPath('logix-unknown-native-readback.png'),
        fullPage: true,
      });
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      await page.getByPlaceholder('操作 ID').fill(uncertain.operationId);
      await page
        .getByPlaceholder('操作 ID')
        .locator('..')
        .getByRole('button', { name: '查询操作', exact: true })
        .click();
      await expect(
        page.getByText('结果未知。请核实现场', { exact: false }),
      ).toBeVisible();
      const reconciliation = page.locator('form').filter({
        has: page.getByRole('button', {
          name: '记录核实并解除占用',
          exact: true,
        }),
      });
      await expect(reconciliation).toHaveCount(1);
      await reconciliation
        .getByRole('checkbox', { name: /我已核实这里显示的原操作目标/ })
        .check();
      await reconciliation
        .getByPlaceholder('核实原因')
        .fill(
          'Owned reference applied one write and changed its model indicators',
        );
      await reconciliation
        .getByPlaceholder('现场核实依据、结果和参考记录')
        .fill(
          'A fresh native session read back uncertain. The reference saw exactly one control write; the original indeterminate completion remains unchanged. This is controlled software fault evidence.',
        );
      await reconciliation
        .getByRole('button', { name: '记录核实并解除占用' })
        .click();
      const resolved = await terminal(uncertain, 'resolvedByOperator');
      expect(
        resolved.events.find(
          (event) => typeof event.completionFingerprint === 'string',
        )?.evidence?.driverCompletion,
      ).toEqual(completion);
      await terminal(await write('confirmed'), 'serviceAccepted');
      await showMonitor();
      await expect(valueCell('logix-root')).toHaveText('confirmed');
      await expect.poll(writes).toBe(beforeRefusal + 2);
      for (const point of points.filter((point) =>
        point.key.startsWith('logix-scale-'),
      ))
        await expect(valueCell(point.key)).toHaveText('scale');
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
        testInfo.outputPath('logix-governed-operations.json'),
        JSON.stringify(
          { cohort: manifest.qualified.cohort, operations },
          null,
          2,
        ),
      );
    } finally {
      peer.stdin.end();
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        peer.kill('SIGINT');
        const timer = new AbortController();
        try {
          const status = await Promise.race([
            exited,
            delay(8000, undefined, { signal: timer.signal }).then(() => {
              peer.kill('SIGKILL');
              throw new Error(
                'Managed reference did not join its input/network owners',
              );
            }),
          ]);
          expect(status[0]).toBe(0);
        } finally {
          timer.abort();
        }
      }
      await writeFile(testInfo.outputPath('logix-owned-reference.log'), output);
      await verifyReference();
    }
  });
}
