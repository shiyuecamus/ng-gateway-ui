import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

test('IEC104 operator sees precise timing metadata from the current native driver', async ({
  gateway,
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
    (value: { driverType: string }) => value.driverType === 'iec104',
  );
  expect(driver).toBeTruthy();
  const metadata = await api(
    request,
    gateway,
    token,
    'GET',
    `/driver/metadata/${driver.id}`,
  );
  const encoded = JSON.stringify(metadata);
  for (const purpose of ['point', 'action'] as const) {
    const address = metadata[purpose].find(
      (value: { path?: string }) => value.path === 'ioa',
    );
    expect(address.rules.max.value).toBe(16_777_215);
  }
  for (const text of [
    'TCP 连接建立期限（毫秒）',
    'I/U 帧确认期限（毫秒）',
    '接收确认延迟，必须小于 t1（毫秒）',
    '空闲后 TESTFR 探测间隔（毫秒）',
  ])
    expect(encoded).toContain(text);
  await writeFile(
    testInfo.outputPath('iec104-native-timing-metadata.json'),
    JSON.stringify(metadata, null, 2),
  );
  await api(request, gateway, token, 'POST', '/channel', {
    name: 'timing-review',
    driverId: driver.id,
    collectionType: 1,
    period: 1000,
    reportType: 0,
    connectionPolicy: {
      connectTimeoutMs: 1000,
      readTimeoutMs: 1000,
      writeTimeoutMs: 1000,
    },
    driverConfig: {
      host: '127.0.0.1',
      port: 2404,
      t0Ms: 10_000,
      t1Ms: 15_000,
      t2Ms: 10_000,
      t3Ms: 20_000,
    },
  });
  await page.goto(`${gateway.origin}/#/auth/login`);
  await page
    .getByPlaceholder('请输入用户名', { exact: true })
    .fill('system_admin');
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`${gateway.origin}/#/southward/channel`);
  const row = page.locator('tr').filter({ hasText: 'timing-review' });
  await expect(row).toBeVisible();
  await row.locator('button[code="edit"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 2; step += 1)
    await dialog.getByRole('button', { name: '下一步' }).click();
  const timeMode = dialog.getByRole('combobox', {
    name: '源时间解释',
    exact: true,
  });
  await timeMode.press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('明确为 UTC', { exact: true })
    .click();
  const century = dialog.getByRole('spinbutton', {
    name: /^\*?\s*源时间世纪$/,
    exact: true,
  });
  await expect(century).toBeVisible();
  await century.fill('2000');
  await timeMode.press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('明确本地偏移', { exact: true })
    .click();
  await dialog
    .getByRole('spinbutton', {
      name: /^\*?\s*标准 UTC 偏移（分钟）$/,
      exact: true,
    })
    .fill('480');
  await dialog
    .getByRole('spinbutton', { name: '夏令时 UTC 偏移（分钟）', exact: true })
    .fill('540');
  await timeMode.scrollIntoViewIfNeeded();
  await dialog.getByRole('spinbutton', { name: /^\*?\s*源时间世纪$/ }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('iec104-time-interpretation-desktop.png'),
  });
  await timeMode.press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('未知：保留原始时间', { exact: true })
    .click();
  await expect(century).not.toBeVisible();
  await expect(
    dialog.getByRole('spinbutton', {
      name: /^\*?\s*标准 UTC 偏移（分钟）$/,
      exact: true,
    }),
  ).not.toBeVisible();
  for (const [label, help] of [
    ['t0', 'TCP 连接建立期限（毫秒）'],
    ['t1', 'I/U 帧确认期限（毫秒）'],
  ] as const) {
    const field = dialog
      .locator('label')
      .filter({ hasText: new RegExp(`^${label}$`) });
    await expect(field).toBeVisible();
    await field
      .locator('..')
      .getByRole('button', { name: label, exact: true })
      .hover();
    const tooltip = page
      .locator(
        '[data-reka-popper-content-wrapper] .side-content[data-side]:is([data-state="delayed-open"], [data-state="instant-open"])',
      )
      .filter({ hasText: help });
    await expect(tooltip).toBeVisible();
    await tooltip.evaluate(
      async (element: {
        getAnimations: () => { finished: Promise<unknown> }[];
      }) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      },
    );
    await page.screenshot({
      path: testInfo.outputPath(`iec104-${label}-desktop.png`),
    });
    await page.mouse.move(0, 0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowLayout = await dialog.evaluate((element) => {
    const labels = [...element.querySelectorAll('label')];
    const bounds = (text: string) => {
      const label = labels.find((candidate) => candidate.textContent === text);
      const wrapper = label?.parentElement;
      if (!wrapper) throw new Error(`Missing timer label wrapper: ${text}`);
      const { x, y, width, height } = wrapper.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      t0: bounds('t0'),
      t1: bounds('t1'),
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(narrowLayout.scrollWidth).toBeLessThanOrEqual(narrowLayout.width);
  expect(narrowLayout.t1.x).toBeCloseTo(narrowLayout.t0.x, 0);
  expect(narrowLayout.t1.y).toBeGreaterThan(
    narrowLayout.t0.y + narrowLayout.t0.height,
  );
  expect(narrowLayout.t1.width).toBeGreaterThanOrEqual(100);
  const field = dialog.locator('label').filter({ hasText: /^t1$/ });
  await field.scrollIntoViewIfNeeded();
  const helpButton = field
    .locator('..')
    .getByRole('button', { name: 't1', exact: true });
  await dialog.getByRole('spinbutton', { name: 't0', exact: true }).focus();
  await page.mouse.move(0, 0);
  await expect(
    page.locator(
      '[data-reka-popper-content-wrapper] .side-content[data-side]:is([data-state="delayed-open"], [data-state="instant-open"])',
    ),
  ).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(helpButton).toBeFocused();
  const tooltip = page
    .locator(
      '[data-reka-popper-content-wrapper] .side-content[data-side]:is([data-state="delayed-open"], [data-state="instant-open"])',
    )
    .filter({ hasText: 'I/U 帧确认期限（毫秒）' });
  await expect(tooltip).toBeVisible();
  await tooltip.evaluate(
    async (element: {
      getAnimations: () => { finished: Promise<unknown> }[];
    }) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    },
  );
  const helpBounds = await tooltip.boundingBox();
  const labelBounds = await field.boundingBox();
  if (!helpBounds || !labelBounds) {
    throw new Error('Visible timer help and label must have measurable bounds');
  }
  expect(helpBounds.y + helpBounds.height).toBeLessThanOrEqual(labelBounds.y);
  expect(helpBounds.x).toBeGreaterThanOrEqual(0);
  expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('iec104-t1-narrow.png') });
  await page.keyboard.press('Escape');
  await expect(tooltip).not.toBeVisible();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/channel') &&
      response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: /^提\s*交$/ }).click();
  const savedReply = await saved;
  expect(savedReply.status(), await savedReply.text()).toBe(200);
  expect(savedReply.request().postDataJSON().driverConfig.sourceTime).toEqual({
    kind: 'unknown',
  });
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

const referencePeer = process.env.NG_IEC104_REFERENCE_PEER_BIN;

test('IEC104 monitor retains Unknown when an independent source omits quality', async ({
  gateway,
  page,
  request,
}, testInfo) => {
  test.skip(
    !referencePeer,
    'Requires the freshly built independent lib60870 peer',
  );
  if (!referencePeer) return;
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing peer port');
  const port = address.port;
  listener.close();
  await once(listener, 'close');
  const peer = spawn(referencePeer, [String(port), '65543', 'monitoring'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  peer.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  peer.stderr.on('data', (data: Buffer) => {
    output += data.toString();
  });
  try {
    await expect.poll(() => output, { timeout: 5000 }).toContain('ready');
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
      (value: { driverType: string }) => value.driverType === 'iec104',
    );
    expect(driver).toBeTruthy();
    await api(request, gateway, token, 'POST', '/channel', {
      name: 'iec104-no-quality',
      driverId: driver.id,
      status: 1,
      collectionType: 0,
      period: null,
      reportType: 0,
      connectionPolicy: {
        connectTimeoutMs: 1000,
        readTimeoutMs: 1000,
        writeTimeoutMs: 1000,
      },
      driverConfig: {
        host: '127.0.0.1',
        port,
        t0Ms: 10_000,
        t1Ms: 15_000,
        t2Ms: 10_000,
        t3Ms: 20_000,
        sourceTime: { kind: 'unknown' },
        autoStartupGeneralInterrogation: false,
        autoStartupCounterInterrogation: false,
        periodicGiIntervalSecs: 0,
        periodicCiIntervalSecs: 0,
      },
    });
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (value: { name: string }) => value.name === 'iec104-no-quality',
    );
    expect(channel).toBeTruthy();
    await api(request, gateway, token, 'POST', '/device', {
      channelId: channel.id,
      deviceName: 'Independent no-quality RTU',
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
    await api(request, gateway, token, 'POST', '/point', {
      deviceId: devices[0].id,
      name: 'Normalized without quality',
      key: 'normalized',
      type: 1,
      dataType: 10,
      accessMode: 0,
      unit: null,
      minValue: null,
      maxValue: null,
      transformDataType: null,
      transformScale: null,
      transformOffset: null,
      transformNegate: false,
      driverConfig: { ioa: 65_543, typeId: 21 },
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
              detail.configuration?.desiredRevision
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshots: string[] = [];
    page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        if (
          typeof frame.payload === 'string' &&
          frame.payload.includes('normalized')
        ) {
          snapshots.push(frame.payload);
        }
      }),
    );
    const locales = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
        'utf8',
      ),
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
      .getByText('iec104-no-quality', { exact: true })
      .click();
    await page.getByRole('combobox').nth(1).press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(devices[0].deviceName, { exact: true })
      .click();
    const row = page
      .locator('tr')
      .filter({ has: page.getByText('normalized', { exact: true }) });
    await expect(
      row.getByText(locales.monitor.realtime.freshness.current, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      row.getByText(locales.monitor.realtime.quality.unknown, { exact: true }),
    ).toBeVisible();
    await expect(
      row.getByText(locales.monitor.realtime.quality.good, { exact: true }),
    ).toHaveCount(0);
    await expect(row).toContainText('-1');
    await expect
      .poll(() =>
        snapshots.some(
          (frame) =>
            frame.includes('"value":-1') &&
            frame.includes('"validity":"unknown"') &&
            frame.includes('"test":true') &&
            frame.includes('"raw":null'),
        ),
      )
      .toBe(true);
    await writeFile(
      testInfo.outputPath('iec104-no-quality-snapshots.json'),
      JSON.stringify(
        snapshots.map((frame) => JSON.parse(frame)),
        null,
        2,
      ),
    );
    await page
      .getByText(locales.monitor.realtime.status.connected, { exact: true })
      .click();
    await row
      .getByRole('button', {
        name: locales.monitor.realtime.facts.open.replace(
          '{key}',
          'normalized',
        ),
        exact: true,
      })
      .click();
    const facts = page.locator('.monitor-quality-popover:visible');
    await expect(facts).toBeVisible();
    await expect(facts).toBeInViewport();
    await expect(facts).toContainText(locales.monitor.realtime.sourceMode.test);
    await expect(facts).toContainText(
      locales.monitor.realtime.facts.unknownHint,
    );
    await facts.evaluate(
      async (element: {
        getAnimations: () => { finished: Promise<unknown> }[];
      }) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      },
    );
    await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('iec104-no-quality-desktop.png'),
    });
    expect(errors).toEqual([]);
    expect(peer.exitCode).toBeNull();
  } finally {
    if (peer.exitCode === null && peer.signalCode === null) {
      const exited = once(peer, 'exit');
      peer.kill('SIGTERM');
      const timer = new AbortController();
      try {
        await Promise.race([
          exited,
          delay(5000, undefined, { signal: timer.signal }).then(async () => {
            peer.kill('SIGKILL');
            await exited;
            throw new Error('Independent peer did not join within5seconds');
          }),
        ]);
      } finally {
        timer.abort();
      }
    }
    await writeFile(testInfo.outputPath('iec104-monitoring-peer.log'), output);
    expect(peer.exitCode).toBe(0);
  }
});

/** Native requests and original-association outcomes are inspected by the independent peer. */
for (const scenario of ['operator', 'confirmation', 'late'] as const) {
  test(`IEC104 governed ${scenario} writes preserve values and correlated outcomes`, async ({
    gateway,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(
      !referencePeer,
      'Requires the freshly built independent lib60870 peer',
    );
    if (!referencePeer) return;
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing peer port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const peer = spawn(referencePeer, [String(port), '65543', scenario], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    peer.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });
    peer.stderr.on('data', (data: Buffer) => {
      output += data.toString();
    });
    try {
      await expect.poll(() => output, { timeout: 5000 }).toContain('ready');
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
        (item: { driverType: string }) => item.driverType === 'iec104',
      );
      expect(driver).toBeTruthy();
      const driverConfig = {
        host: '127.0.0.1',
        port,
        autoStartupGeneralInterrogation: false,
        autoStartupCounterInterrogation: false,
        periodicGiIntervalSecs: 0,
        periodicCiIntervalSecs: 0,
      };
      const channelInput = {
        name: 'iec104-command-units',
        driverId: driver.id,
        collectionType: 0,
        period: null,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 1000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig,
      };
      for (const counterGroup of [69, 133, 197]) {
        const denied = await request.post(`${gateway.origin}/api/channel`, {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            ...channelInput,
            driverConfig: { ...driverConfig, counterGroup },
          },
        });
        expect(denied.status(), await denied.text()).toBe(422);
      }
      const beforeChannels = await api(
        request,
        gateway,
        token,
        'GET',
        '/channel/list',
      );
      expect(beforeChannels).toHaveLength(0);
      await api(request, gateway, token, 'POST', '/channel', channelInput);
      const channels = await api(
        request,
        gateway,
        token,
        'GET',
        '/channel/list',
      );
      const channel = channels.find(
        (item: { name: string }) => item.name === channelInput.name,
      );
      expect(channel).toBeTruthy();
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Independent operator RTU',
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
      for (const point of [
        {
          key: 'normalized-control',
          dataType: 10,
          transformScale: 2,
          transformOffset: 10,
          transformDataType: null,
          ioa: 65_543,
          typeId: 9,
        },
        {
          key: 'bitstring-control',
          dataType: 6,
          transformScale: null,
          transformOffset: null,
          transformDataType: null,
          ioa: 65_544,
          typeId: 7,
        },
        {
          key: 'double-control',
          dataType: 2,
          transformScale: 2,
          transformOffset: 10,
          transformDataType: 10,
          ioa: 65_545,
          typeId: 3,
        },
      ]) {
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name: point.key,
          key: point.key,
          type: 1,
          dataType: point.dataType,
          accessMode: 2,
          unit: null,
          minValue: null,
          maxValue: null,
          transformDataType: point.transformDataType,
          transformScale: point.transformScale,
          transformOffset: point.transformOffset,
          transformNegate: false,
          driverConfig: { ioa: point.ioa, typeId: point.typeId },
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
              detail.configuration?.desiredRevision ===
                detail.configuration?.appliedRevision
            );
          },
          { timeout: 15_000 },
        )
        .toBe(true);
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
            return current.connectionState?.phase;
          },
          { timeout: 15_000 },
        )
        .toBe('Connected');
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
        { authorityId, label: 'Fixed independent IEC104 operator peer' },
      );
      await api(
        request,
        gateway,
        token,
        'POST',
        `/control/authorities/${authorityId}/verify`,
        {
          expectedRevision: authority.revision,
          reason:
            'Owned loopback peer decoded the declared native object layouts',
          evidence: {
            commit: '7a388e3e133999e1ca77ba7521d55d074b7cd2bc',
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
          reason: 'Bind full24bit native objects',
          routeSnapshot: { ca: 0x12_34, port },
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
            'Exact normalised and bitstring wire identities are independently inspected',
          evidence: { ioas: [65_543, 65_544, 65_545], typeIds: [48, 51, 46] },
        },
      );
      const points = await api(request, gateway, token, 'GET', '/point/list');
      const records: unknown[] = [];
      for (const [key, value, expectedLine] of [
        ['normalized-control', 11, 'REQUEST:48:65543:OK'],
        ['bitstring-control', 4_294_967_295, 'REQUEST:51:65544:OK'],
        ['double-control', 14, 'REQUEST:46:65545:OK'],
      ] as const) {
        const point = points.find((item: { key: string }) => item.key === key);
        expect(point).toBeTruthy();
        const intent = {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          pointId: point.id,
          value,
          idempotencyKey: randomUUID(),
          timeoutMs:
            scenario !== 'operator' && key === 'double-control' ? 500 : 5000,
        };
        const response = await request.post(
          `${gateway.origin}/api/point/write`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            data: intent,
          },
        );
        const responseBody = await response.text();
        expect(response.status(), responseBody).toBe(200);
        const receipt = JSON.parse(responseBody).data;
        await expect.poll(() => output).toContain(expectedLine);
        let expectedState = 'protocolSucceeded';
        if (scenario === 'confirmation' && key === 'bitstring-control') {
          expectedState = 'protocolRejected';
        } else if (scenario !== 'operator' && key === 'double-control') {
          expectedState = 'indeterminate';
        }
        await expect
          .poll(
            async () => {
              const details = await api(
                request,
                gateway,
                token,
                'GET',
                `/control/operations/${receipt.operationId}`,
              );
              return details.operation.state;
            },
            { intervals: [20, 50, 100], timeout: 10_000 },
          )
          .toBe(expectedState);
        const record = await api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        );
        records.push(record);
        expect(record.operation.binding.requiresTermination).toBe(true);
        const conclusion = record.events.find(
          (event: { state: string }) => event.state === expectedState,
        );
        if (expectedState === 'protocolSucceeded') {
          expect(conclusion.evidence.commands[0].acceptance[0]).toBe(7);
          expect(conclusion.evidence.commands[0].completion[0]).toBe(10);
        } else if (expectedState === 'protocolRejected') {
          expect(conclusion.evidence.commands[0].completion[0]).toBe(71);
          expect(conclusion.evidence.commands[0].acceptance).toBeNull();
        } else {
          expect(record.operation.state).toBe('indeterminate');
        }
        if (scenario === 'late' && key === 'double-control') {
          await expect
            .poll(
              async () => {
                const late = await api(
                  request,
                  gateway,
                  token,
                  'GET',
                  `/control/operations/${receipt.operationId}`,
                );
                return late.operation.state;
              },
              { timeout: 10_000 },
            )
            .toBe('protocolSucceeded');
          const late = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${receipt.operationId}`,
          );
          expect(
            late.events.some(
              (event: { state: string }) => event.state === 'indeterminate',
            ),
          ).toBe(true);
          const terminal = late.events.find(
            (event: { state: string }) => event.state === 'protocolSucceeded',
          );
          expect(terminal.evidence.commands[0].acceptance[0]).toBe(7);
          expect(terminal.evidence.commands[0].completion[0]).toBe(10);
          records.push(late);
        }
        const duplicate = await api(
          request,
          gateway,
          token,
          'POST',
          '/point/write',
          intent,
        );
        expect(duplicate.operationId).toBe(receipt.operationId);
      }
      const normalized = points.find(
        (item: { key: string }) => item.key === 'normalized-control',
      );
      const denied = await request.post(`${gateway.origin}/api/point/write`, {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          pointId: normalized.id,
          value: 12,
          idempotencyKey: randomUUID(),
          timeoutMs: 5000,
        },
      });
      expect(denied.status(), await denied.text()).toBe(422);
      expect(output.split('REQUEST:48:65543:OK')).toHaveLength(2);
      const doublePoint = points.find(
        (item: { key: string }) => item.key === 'double-control',
      );
      for (const value of [12.6, true]) {
        const rejected = await request.post(
          `${gateway.origin}/api/point/write`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            data: {
              expectedChannelId: channel.id,
              expectedDeviceId: device.id,
              expectedConfigurationRevision:
                active.configuration.appliedRevision,
              pointId: doublePoint.id,
              value,
              idempotencyKey: randomUUID(),
              timeoutMs: 5000,
            },
          },
        );
        expect(rejected.status(), await rejected.text()).toBe(422);
      }
      await writeFile(
        testInfo.outputPath('iec104-command-operations.json'),
        JSON.stringify(records, null, 2),
      );
      await page.goto(`${gateway.origin}/#/auth/login`);
      await page
        .getByPlaceholder('请输入用户名', { exact: true })
        .fill('system_admin');
      await page.getByPlaceholder('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'login', exact: true }).click();
      await expect(page).toHaveURL(/\/home/);
      await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
      const last = records.at(-1) as { operation: { operationId: string } };
      await page.getByPlaceholder('操作 ID').fill(last.operation.operationId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      await expect(
        page.locator('code').filter({ hasText: last.operation.operationId }),
      ).toBeVisible();
      await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`iec104-${scenario}-command-history.png`),
        fullPage: true,
      });
      expect(peer.exitCode).toBeNull();
    } finally {
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        peer.kill('SIGTERM');
        const timer = new AbortController();
        try {
          await Promise.race([
            exited,
            delay(5000, undefined, { signal: timer.signal }).then(async () => {
              peer.kill('SIGKILL');
              await exited;
              throw new Error('Independent peer did not join within5seconds');
            }),
          ]);
        } finally {
          timer.abort();
        }
      }
      await writeFile(testInfo.outputPath('iec104-operator-peer.log'), output);
      expect(peer.exitCode).toBe(0);
    }
    for (const expected of [
      'REQUEST:48:65543:OK',
      'REQUEST:51:65544:OK',
      'REQUEST:46:65545:OK',
    ]) {
      expect(output.split(expected)).toHaveLength(2);
    }
  });
}
