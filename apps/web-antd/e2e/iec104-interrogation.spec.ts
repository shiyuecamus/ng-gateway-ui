import type { APIRequestContext, Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

import type { Gateway } from './gateway';

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_IEC104_INTERROGATION_PEER_BIN;
const capability = 'ng:southward:iec104:interrogation:boot';
test.skip(
  !peerBinary,
  'Requires the freshly source-pinned threadless lib60870 interrogation peer',
);

async function startPeer(silent: boolean) {
  if (!peerBinary) throw new Error('Missing interrogation peer');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No peer port');
  const port = address.port;
  listener.close();
  await once(listener, 'close');
  const args = [String(port), '65543'];
  if (silent) args.push('silent');
  const child = spawn(peerBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString();
  });
  await expect.poll(() => output, { timeout: 5000 }).toContain('ready');
  return { child, port, output: () => output };
}

async function stopPeer(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = new AbortController();
    try {
      await Promise.race([
        exited,
        delay(5000, undefined, { signal: timer.signal }).then(async () => {
          child.kill('SIGKILL');
          await exited;
          throw new Error('Interrogation peer did not join');
        }),
      ]);
    } finally {
      timer.abort();
    }
  }
  expect(child.exitCode).toBe(0);
}

async function login(page: Page, gateway: Gateway, password: string) {
  await page.goto(`${gateway.origin}/#/auth/login`);
  await page
    .getByPlaceholder('请输入用户名', { exact: true })
    .fill('system_admin');
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function configure(
  request: APIRequestContext,
  gateway: Gateway,
  port: number,
  scenario: string,
) {
  const { token, password } = await initializeAdmin(request, gateway);
  await installNativeArtifact(
    request,
    gateway,
    token,
    'driver',
    'ng_driver_iec104',
  );
  const drivers = await api(request, gateway, token, 'GET', '/driver/list');
  const driver = drivers.find(
    (entry: { driverType: string }) => entry.driverType === 'iec104',
  );
  expect(driver).toBeTruthy();
  const name = `iec104-read-${scenario}`;
  await api(request, gateway, token, 'POST', '/channel', {
    name,
    driverId: driver.id,
    status: 1,
    collectionType: 0,
    period: null,
    reportType: 0,
    connectionPolicy: {
      connectTimeoutMs: 3000,
      readTimeoutMs: 15_000,
      writeTimeoutMs: 1000,
    },
    driverConfig: {
      host: '127.0.0.1',
      port,
      t0Ms: 3000,
      t1Ms: 1500,
      t2Ms: 500,
      t3Ms: 5000,
      autoStartupGeneralInterrogation: scenario !== 'operator',
      autoStartupCounterInterrogation: scenario === 'background',
      periodicGiIntervalSecs: scenario === 'background' ? 1 : 0,
      periodicCiIntervalSecs: 0,
      dataSilenceTimeoutSecs: scenario === 'silent' ? 1 : 0,
      interrogationQoi: 20,
      counterGroup: 5,
      interrogationParallelism: 4,
    },
  });
  const channels = await api(request, gateway, token, 'GET', '/channel/list');
  const channel = channels.find(
    (entry: { name: string }) => entry.name === name,
  );
  expect(channel).toBeTruthy();
  const deviceName = 'Independent interrogation RTU';
  await api(request, gateway, token, 'POST', '/device', {
    channelId: channel.id,
    deviceName,
    deviceType: 'independent-peer',
    driverConfig: { ca: 0x12_34 },
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
  await api(request, gateway, token, 'POST', '/point', {
    ...base,
    name: 'Read service pulse',
    key: 'service-pulse',
    dataType: 0,
    accessMode: 0,
    driverConfig: { ioa: 65_559, typeId: 1 },
  });
  await api(request, gateway, token, 'POST', '/point', {
    ...base,
    name: 'Concurrent normalized control',
    key: 'concurrent-control',
    dataType: 10,
    accessMode: 2,
    driverConfig: { ioa: 65_543, typeId: 9 },
  });
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
          detail.configuration?.appliedRevision ===
            detail.configuration?.desiredRevision &&
          detail.connectionState?.phase === 'Connected'
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const detail = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channel.id}`,
  );
  const points = await api(request, gateway, token, 'GET', '/point/list');
  const control = points.find(
    (entry: { key: string }) => entry.key === 'concurrent-control',
  );
  const headers = {
    'X-Gateway-Contract': 'boot',
    Authorization: `Bearer ${token}`,
    Origin: gateway.origin,
  };
  const inventoryResponse = await request.get(
    `${gateway.origin}/api/channel/${channel.id}/capabilities`,
    { headers },
  );
  expect(inventoryResponse.status()).toBe(200);
  const inventory = await inventoryResponse.json();
  expect(
    inventory.definitions.some(
      (entry: { id: string }) => entry.id === capability,
    ),
  ).toBe(true);
  expect(inventory.configurationRevision).toBe(
    detail.configuration.appliedRevision,
  );
  return {
    token,
    password,
    channel,
    device,
    detail,
    control,
    inventory,
    headers,
  };
}

async function invoke(
  request: APIRequestContext,
  gateway: Gateway,
  channelId: number,
  revision: string,
  payload: unknown,
  token?: string,
) {
  const headers: Record<string, string> = {
    'X-Gateway-Contract': 'boot',
    'X-Gateway-Configuration-Revision': revision,
    Origin: gateway.origin,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return request.post(
    `${gateway.origin}/api/channel/${channelId}/capabilities/${encodeURIComponent(capability)}`,
    { headers, data: payload },
  );
}

function currentAssociation(output: string) {
  return output.slice(output.lastIndexOf('ASSOCIATION:'));
}

function associationCount(output: string) {
  return output.split('ASSOCIATION:').length - 1;
}

for (const scenario of ['background', 'operator', 'silent'] as const) {
  test(`IEC104 ${scenario} interrogation keeps source and authority semantics`, async ({
    gateway,
    request,
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const peer = await startPeer(scenario === 'silent');
    try {
      const lab = await configure(request, gateway, peer.port, scenario);
      if (scenario === 'silent') {
        await expect
          .poll(
            () => currentAssociation(peer.output()).split('SYSTEM_ONLY').length,
          )
          .toBeGreaterThan(2);
        const baselineAssociations = associationCount(peer.output());
        await expect
          .poll(
            async () => readFile(`${gateway.directory}/gateway.log`, 'utf8'),
            { timeout: 15_000 },
          )
          .toContain('qualified process-data silence; requesting reconnect');
        await expect
          .poll(() => associationCount(peer.output()), { timeout: 15_000 })
          .toBeGreaterThan(baselineAssociations);
        expect(peer.output()).toContain('SYSTEM_ONLY');
        expect(peer.output()).not.toContain(':PROCESS');
        const detail = await api(
          request,
          gateway,
          lab.token,
          'GET',
          `/channel/detail/${lab.channel.id}`,
        );
        const sourceLog = await readFile(
          `${gateway.directory}/gateway.log`,
          'utf8',
        );
        const silenceEvents = sourceLog
          .split('\n')
          .filter((line) =>
            line.includes(
              'qualified process-data silence; requesting reconnect',
            ),
          );
        expect(silenceEvents.length).toBeGreaterThan(0);
        await writeFile(
          testInfo.outputPath('system-traffic-silence.json'),
          JSON.stringify(
            {
              detail,
              baselineAssociations,
              silenceEvents,
              associationsAfterSilence: associationCount(peer.output()),
            },
            null,
            2,
          ),
        );
        return;
      }
      await login(page, gateway, lab.password);
      if (scenario === 'background') {
        await expect.poll(() => peer.output()).toContain('GI_HELD');
        const activeAssociation = associationCount(peer.output());
        const frames: string[] = [];
        page.on('websocket', (socket) =>
          socket.on('framereceived', ({ payload }) => {
            if (
              typeof payload === 'string' &&
              payload.includes('service-pulse')
            )
              frames.push(payload);
          }),
        );
        await page.goto(`${gateway.origin}/#/maintenance/monitor`);
        await page.getByRole('combobox').nth(0).press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(lab.channel.name, { exact: true })
          .click();
        await page.getByRole('combobox').nth(1).press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(lab.device.deviceName, { exact: true })
          .click();
        const row = page
          .locator('tr')
          .filter({ has: page.getByText('service-pulse', { exact: true }) });
        await expect(row.getByText('当前', { exact: true })).toBeVisible();
        await expect
          .poll(() => frames.length, { timeout: 5000 })
          .toBeGreaterThan(1);
        expect(peer.output()).not.toContain('GI_COMPLETED');
        expect(associationCount(peer.output())).toBe(activeAssociation);
        expect(
          currentAssociation(peer.output()).split('GI_REQUEST:20:OK'),
        ).toHaveLength(2);
        const authorityId = randomUUID();
        const authority = await api(
          request,
          gateway,
          lab.token,
          'POST',
          '/control/authorities',
          { authorityId, label: 'Independent held-GI controller' },
        );
        await api(
          request,
          gateway,
          lab.token,
          'POST',
          `/control/authorities/${authorityId}/verify`,
          {
            expectedRevision: authority.revision,
            reason: 'Owned independent peer has no physical outputs',
            evidence: { port: peer.port },
          },
        );
        const route = await api(
          request,
          gateway,
          lab.token,
          'PUT',
          `/control/routes/${lab.device.id}`,
          {
            authorityId,
            channelId: lab.channel.id,
            expectedRevision: null,
            reason: 'Exact CA and normalized object',
            routeSnapshot: { ca: 0x12_34, ioa: 65_543, port: peer.port },
          },
        );
        await api(
          request,
          gateway,
          lab.token,
          'POST',
          `/control/routes/${lab.device.id}/verify`,
          {
            expectedRevision: route.revision,
            reason: 'Pinned public peer decodes native request',
            evidence: { commit: '7a388e3e133999e1ca77ba7521d55d074b7cd2bc' },
          },
        );
        const receipt = await api(
          request,
          gateway,
          lab.token,
          'POST',
          '/point/write',
          {
            expectedChannelId: lab.channel.id,
            expectedDeviceId: lab.device.id,
            expectedConfigurationRevision:
              lab.detail.configuration.appliedRevision,
            pointId: lab.control.id,
            value: 0.5,
            idempotencyKey: randomUUID(),
            timeoutMs: 5000,
          },
        );
        await expect
          .poll(async () => {
            const result = await api(
              request,
              gateway,
              lab.token,
              'GET',
              `/control/operations/${receipt.operationId}`,
            );
            return result.operation.state;
          })
          .toBe('protocolSucceeded');
        expect(peer.output()).toContain('CONTROL:48:OK');
        expect(peer.output()).not.toContain('GI_COMPLETED');
        expect(peer.child.kill('SIGUSR1')).toBe(true);
        await expect.poll(() => peer.output()).toContain('GI_COMPLETED');
        await writeFile(
          testInfo.outputPath('monitoring-during-interrogation.json'),
          JSON.stringify(
            frames.map((frame) => JSON.parse(frame)),
            null,
            2,
          ),
        );
        await page.screenshot({
          path: testInfo.outputPath('monitoring-during-interrogation.png'),
        });
        return;
      }
      const read = { kind: 'counter', ca: 0x12_34, qualifier: 5 };
      const anonymous = await invoke(
        request,
        gateway,
        lab.channel.id,
        lab.inventory.configurationRevision,
        read,
      );
      expect(anonymous.status()).toBe(401);
      for (const payload of [
        { kind: 'counter', ca: 0x12_34, qualifier: 69 },
        { kind: 'counter', ca: 0x12_34, qualifier: 133 },
        { kind: 'counter', ca: 0x12_34, qualifier: 197 },
        { kind: 'general', ca: 0x12_35, qualifier: 20 },
        { kind: 'general', ca: 0x12_34, qualifier: 20, freeze: true },
      ]) {
        const denied = await invoke(
          request,
          gateway,
          lab.channel.id,
          lab.inventory.configurationRevision,
          payload,
          lab.token,
        );
        expect(denied.status(), await denied.text()).toBe(422);
      }
      const stale = await invoke(
        request,
        gateway,
        lab.channel.id,
        (BigInt(lab.inventory.configurationRevision) + 1n).toString(),
        read,
        lab.token,
      );
      expect(stale.status(), await stale.text()).toBe(409);
      expect(peer.output()).not.toContain('CI_REQUEST');
      const initialPassword = `Reader ${randomUUID()}`;
      await api(request, gateway, lab.token, 'POST', '/user', {
        username: 'interrogation_reader',
        nickname: 'Read service operator',
        password: initialPassword,
      });
      const users = await api(request, gateway, lab.token, 'GET', '/user/list');
      const reader = users.find(
        (entry: { username: string }) =>
          entry.username === 'interrogation_reader',
      );
      await api(request, gateway, lab.token, 'POST', '/role', {
        name: 'Channel observation only',
        code: 'INTERROGATION_READER',
        type: 1,
      });
      const roles = await api(request, gateway, lab.token, 'GET', '/role/list');
      const role = roles.find(
        (entry: { code: string }) => entry.code === 'INTERROGATION_READER',
      );
      await api(
        request,
        gateway,
        lab.token,
        'PUT',
        `/role/${role.id}/permissions`,
        [{ kind: 'scope', resource: 'channel:read', operation: 'access' }],
      );
      await api(
        request,
        gateway,
        lab.token,
        'PUT',
        `/user/${reader.id}/roles`,
        [role.id],
      );
      async function readerLogin(password: string) {
        const response = await request.post(
          `${gateway.origin}/api/auth/login`,
          {
            headers: { 'X-Gateway-Contract': 'boot' },
            data: {
              username: 'interrogation_reader',
              password,
              requestId: randomUUID(),
            },
          },
        );
        expect(response.status()).toBe(200);
        const body = await response.json();
        return body.data.token as string;
      }
      const bootstrap = await readerLogin(initialPassword);
      const changedPassword = `Changed reader ${randomUUID()}`;
      await api(request, gateway, bootstrap, 'PUT', '/auth/password', {
        oldPassword: initialPassword,
        newPassword: changedPassword,
      });
      const readerToken = await readerLogin(changedPassword);
      const allowed = await invoke(
        request,
        gateway,
        lab.channel.id,
        lab.inventory.configurationRevision,
        read,
        readerToken,
      );
      expect(allowed.status(), await allowed.text()).toBe(200);
      const rejected = await allowed.json();
      expect(rejected.result).toBe('rejected');
      expect(rejected.acceptance).toBeNull();
      expect(rejected.termination[0]).toBe(71);
      const forbidden = await request.post(
        `${gateway.origin}/api/point/write`,
        {
          headers: { ...lab.headers, Authorization: `Bearer ${readerToken}` },
          data: {
            expectedChannelId: lab.channel.id,
            expectedDeviceId: lab.device.id,
            expectedConfigurationRevision:
              lab.detail.configuration.appliedRevision,
            pointId: lab.control.id,
            value: 0.5,
            idempotencyKey: randomUUID(),
            timeoutMs: 5000,
          },
        },
      );
      expect(forbidden.status()).toBe(403);
      await api(
        request,
        gateway,
        lab.token,
        'PUT',
        `/role/${role.id}/permissions`,
        [],
      );
      const revoked = await invoke(
        request,
        gateway,
        lab.channel.id,
        lab.inventory.configurationRevision,
        read,
        readerToken,
      );
      expect(revoked.status()).toBe(403);
      await page.goto(`${gateway.origin}/#/southward/channel`);
      const row = page.getByRole('row').filter({ hasText: lab.channel.name });
      await row
        .getByRole('button', { name: 'IEC104 只读召唤', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('button', { name: '发起只读召唤', exact: true }),
      ).toBeEnabled();
      await dialog.getByRole('radio', { name: '计数量', exact: true }).click();
      await dialog
        .getByRole('button', { name: '发起只读召唤', exact: true })
        .click();
      await expect(
        dialog.getByText('设备拒绝了这次召唤', { exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole('radio', { name: '当前信息', exact: true })
        .click();
      await expect(
        dialog.getByRole('region', { name: '召唤结果', exact: true }),
      ).toHaveCount(0);
      await dialog
        .getByRole('button', { name: '发起只读召唤', exact: true })
        .click();
      await expect.poll(() => peer.output()).toContain('GI_HELD');
      expect(peer.child.kill('SIGUSR1')).toBe(true);
      await expect(
        dialog.getByText('远端召唤已结束', { exact: true }),
      ).toBeVisible();
      await dialog.getByText('协议回执', { exact: true }).click();
      await expect(dialog.locator('pre')).toContainText('"completed"');
      await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath('operator-interrogation-completed.png'),
      });
      await writeFile(
        testInfo.outputPath('read-only-authority.json'),
        JSON.stringify(
          {
            rejected,
            anonymous: anonymous.status(),
            stale: stale.status(),
            forbiddenControl: forbidden.status(),
            revoked: revoked.status(),
          },
          null,
          2,
        ),
      );
      expect(peer.output().split('CI_REQUEST:5:READ_ONLY')).toHaveLength(3);
      expect(peer.output()).not.toContain('CONTROL:');
    } finally {
      await stopPeer(peer.child);
      await writeFile(
        testInfo.outputPath('interrogation-peer.log'),
        peer.output(),
      );
    }
  });
}
