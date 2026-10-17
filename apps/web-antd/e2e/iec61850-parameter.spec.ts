import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_IEC61850_PEER_BIN;
const peerSource = process.env.NG_IEC61850_PEER_SOURCE;
test.skip(
  !peerBinary || !peerSource,
  'Requires the fixed-commit independent libIEC61850 peer',
);

test('IEC parameter Write uses durable control authority and appears in operator history', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  if (!peerBinary || !peerSource)
    throw new Error('Missing independent peer inputs');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('No peer port');
  const port = address.port;
  reservation.close();
  await once(reservation, 'close');
  const peer = spawn(peerBinary, ['server-parameter', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let peerErrors = '';
  peer.stderr.on('data', (chunk) => {
    peerErrors += String(chunk);
  });
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        let output = '';
        peer.stdout.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('READY\n')) resolve();
        });
        peer.once('exit', (code) =>
          reject(
            new Error(`Independent peer exited early: ${code} ${peerErrors}`),
          ),
        );
      }),
      delay(5000).then(() => {
        throw new Error(`Independent peer did not become ready: ${peerErrors}`);
      }),
    ]);

    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const driver = drivers.find(
      (candidate: { driverType: string }) =>
        candidate.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();

    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'iec-parameter-loopback',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) =>
        candidate.name === 'iec-parameter-loopback',
    );
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'IEC parameter IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'SampleIEDDevice1' },
      }),
    ).toBe(true);
    const devices = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/${channel.id}/sub-devices`,
    );
    const device = devices.find(
      (candidate: { deviceName: string }) =>
        candidate.deviceName === 'IEC parameter IED',
    );
    expect(device).toBeTruthy();
    const pointBase = {
      deviceId: device.id,
      dataType: 5,
      unit: null,
      minValue: null,
      maxValue: null,
      transformDataType: null,
      transformScale: null,
      transformOffset: null,
      transformNegate: false,
    };
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        ...pointBase,
        name: 'Setpoint observation',
        key: 'setpoint-read',
        type: 1,
        accessMode: 0,
        driverConfig: {
          kind: 'read',
          configuration: {
            objectReference: 'SampleIEDDevice1/LLN0.Setpoint.setVal',
            functionalConstraint: 'SP',
            valuePath: [],
          },
        },
      }),
    ).toBe(true);
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        ...pointBase,
        name: 'Setpoint write',
        key: 'setpoint-write',
        type: 0,
        accessMode: 1,
        driverConfig: {
          kind: 'parameterWrite',
          configuration: {
            objectReference: 'SampleIEDDevice1/LLN0.Setpoint.setVal',
            functionalConstraint: 'SP',
          },
        },
      }),
    ).toBe(true);
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const point = points.find(
      (candidate: { key: string }) => candidate.key === 'setpoint-write',
    );
    expect(point).toBeTruthy();
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
            current.configuration?.appliedRevision ===
              current.configuration?.desiredRevision
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const active = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${channel.id}`,
    );

    const authorityId = randomUUID();
    const authority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      { authorityId, label: 'Fixed libIEC61850 parameter peer' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed-commit local MMS peer verified',
        evidence: { commit, port },
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
        reason: 'Bind IEC parameter FCDA to the verified peer',
        routeSnapshot: { logicalDevice: 'SampleIEDDevice1', port },
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
        reason: 'SP setVal FCDA verified online',
        evidence: { fcda: 'LLN0$SP$Setpoint$setVal' },
      },
    );

    const key = randomUUID();
    const intent = {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: point.id,
      value: 123,
      idempotencyKey: key,
      timeoutMs: 3000,
    };
    const accepted = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    await expect
      .poll(
        async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${accepted.operationId}`,
          );
          return details.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('serviceAccepted');
    const retry = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    expect(retry.operationId).toBe(accepted.operationId);
    const conflict = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...intent, value: 124 },
    });
    expect(conflict.status()).toBe(409);
    const history = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=mine',
    );
    expect(
      history.items.some(
        (operation: { operationId: string }) =>
          operation.operationId === accepted.operationId,
      ),
    ).toBe(true);

    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await expect(page.getByText('操作历史与未决记录')).toBeVisible();
  } finally {
    if (peer.exitCode === null && peer.signalCode === null) {
      const exited = once(peer, 'exit');
      peer.kill('SIGTERM');
      await exited;
    }
  }
});
