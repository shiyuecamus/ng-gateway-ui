import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

test('real Modbus control evidence is discoverable and an unresolved operation stays visible', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const registers = new Uint16Array(16);
  const writes: { address: number; value: number }[] = [];
  const sockets = new Set<import('node:net').Socket>();
  let disconnectNextWrite = false;
  const peer = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 7) {
        const length = pending.readUInt16BE(4);
        if (pending.readUInt16BE(2) !== 0 || length < 2 || length > 253) {
          socket.destroy();
          return;
        }
        const frameLength = 6 + length;
        if (pending.length < frameLength) return;
        const frame = pending.subarray(0, frameLength);
        pending = pending.subarray(frameLength);
        const functionCode = frame[7];
        if (frame.length < 12 || functionCode === undefined) {
          socket.destroy();
          return;
        }
        const address = frame.readUInt16BE(8);
        const quantity = frame.readUInt16BE(10);
        let response: Buffer;
        if (
          functionCode === 3 &&
          quantity > 0 &&
          address + quantity <= registers.length
        ) {
          response = Buffer.alloc(2 + quantity * 2);
          response[0] = 3;
          response[1] = quantity * 2;
          for (let index = 0; index < quantity; index += 1) {
            response.writeUInt16BE(
              registers[address + index] ?? 0,
              2 + index * 2,
            );
          }
        } else if (functionCode === 6 && address < registers.length) {
          registers[address] = quantity;
          writes.push({ address, value: quantity });
          if (disconnectNextWrite) {
            disconnectNextWrite = false;
            socket.destroy();
            return;
          }
          response = frame.subarray(7, 12);
        } else {
          response = Buffer.from([functionCode | 0x80, 2]);
        }
        const reply = Buffer.alloc(7 + response.length);
        frame.copy(reply, 0, 0, 4);
        reply.writeUInt16BE(response.length + 1, 4);
        reply[6] = frame[6] ?? 1;
        response.copy(reply, 7);
        socket.write(reply);
      }
      if (pending.length > 1024) socket.destroy();
    });
  });
  peer.listen(0, '127.0.0.1');
  await once(peer, 'listening');
  const address = peer.address();
  if (!address || typeof address === 'string')
    throw new Error('No Modbus peer port');
  try {
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
      (candidate: { driverType: string }) => candidate.driverType === 'modbus',
    );
    expect(driver).toBeTruthy();

    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'history-loopback',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 1000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          byteOrder: 0,
          wordOrder: 0,
          connection: { kind: 'tcp', host: '127.0.0.1', port: address.port },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) => candidate.name === 'history-loopback',
    );
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'loopback-meter',
        deviceType: 'isolated-peer',
        driverConfig: { slaveId: 1 },
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
        candidate.deviceName === 'loopback-meter',
    );
    expect(device).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: 'writable register',
        key: 'register0',
        type: 0,
        dataType: 4,
        accessMode: 2,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: { address: 0, functionCode: 3, quantity: 1 },
      }),
    ).toBe(true);
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const point = points.find(
      (candidate: { key: string }) => candidate.key === 'register0',
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
      {
        authorityId,
        label: 'isolated Modbus register peer',
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
        reason: 'Local protocol peer and address were independently inspected',
        evidence: { host: '127.0.0.1', port: address.port, unitId: 1 },
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
        reason: 'Bind the configured channel to the verified local peer',
        routeSnapshot: { host: '127.0.0.1', port: address.port, unitId: 1 },
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
        reason: 'Device unit ID and writable register confirmed',
        evidence: { unitId: 1, register: 0 },
      },
    );

    const write = (value: number) =>
      api(request, gateway, token, 'POST', '/point/write', {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        pointId: point.id,
        value,
        idempotencyKey: randomUUID(),
        timeoutMs: 2000,
      });
    const accepted = await write(123);
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
    expect(writes).toEqual([{ address: 0, value: 123 }]);

    disconnectNextWrite = true;
    const uncertain = await write(234);
    await expect
      .poll(
        async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${uncertain.operationId}`,
          );
          return details.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('indeterminate');
    expect(writes).toEqual([
      { address: 0, value: 123 },
      { address: 0, value: 234 },
    ]);
    const pending = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=mine&unresolvedOnly=true',
    );
    expect(
      pending.items.map((item: { operationId: string }) => item.operationId),
    ).toEqual([uncertain.operationId]);
    const history = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=mine&limit=1',
    );
    expect(history.items[0].operationId).toBe(uncertain.operationId);
    expect(history.nextCursor).toBeTruthy();
    const older = await api(
      request,
      gateway,
      token,
      'GET',
      `/control/operations?audience=mine&limit=1&beforeSequence=${history.nextCursor.sequence}`,
    );
    expect(older.items[0].operationId).toBe(accepted.operationId);

    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    const historyCard = page
      .locator('.ant-card')
      .filter({ hasText: '操作历史与未决记录' });
    await expect(historyCard.getByText(uncertain.operationId)).toBeVisible();
    await historyCard
      .getByRole('button', { name: uncertain.operationId })
      .click();
    await expect(
      page.getByText('结果未知。请核实现场', { exact: false }),
    ).toBeVisible();
    expect(registers[0]).toBe(234);
    await page
      .getByRole('checkbox', { name: /我已核实这里显示的原操作目标/ })
      .check();
    await page
      .getByPlaceholder('核实原因')
      .fill('Isolated peer write log reviewed');
    await page
      .getByPlaceholder('现场核实依据、结果和参考记录')
      .fill(
        'Test peer recorded register 0 = 234 once; the Modbus response was deliberately withheld.',
      );
    await page.getByRole('button', { name: '记录核实并解除占用' }).click();
    await expect
      .poll(async () => {
        const current = await api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${uncertain.operationId}`,
        );
        return current.operation.state;
      })
      .toBe('resolvedByOperator');
    const details = await api(
      request,
      gateway,
      token,
      'GET',
      `/control/operations/${uncertain.operationId}`,
    );
    expect(
      details.events.some(
        (event: { state: string }) => event.state === 'indeterminate',
      ),
    ).toBe(true);
    await historyCard.getByRole('button', { name: '查询历史' }).click();
    await expect(
      historyCard.getByText('当前筛选条件下没有操作记录。'),
    ).toBeVisible();
    await historyCard.locator('.ant-select').nth(1).click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('全部状态', { exact: true })
      .click();
    await historyCard.getByRole('button', { name: '查询历史' }).click();
    await expect(historyCard.getByText(uncertain.operationId)).toBeVisible();
    await expect(historyCard.getByText(accepted.operationId)).toBeVisible();
    await historyCard
      .getByRole('button', { name: accepted.operationId })
      .click();
    await expect(
      page.locator('code').filter({ hasText: accepted.operationId }),
    ).toBeVisible();
  } finally {
    const closed = once(peer, 'close');
    for (const socket of sockets) socket.destroy();
    peer.close();
    await closed;
  }
});
