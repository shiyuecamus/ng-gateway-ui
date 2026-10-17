import type { APIResponse, Route } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect } from '@playwright/test';

import { api, initializeAdmin, test } from './gateway';

/** Real host ingestion must work before any dynamic IEC driver is installed. */
test('offline SCL upload preserves identity and rejects partial engineering', async ({
  gateway,
  request,
}) => {
  const source = await readFile(
    resolve(
      import.meta.dirname,
      '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/engineering.scd',
    ),
  );
  const path = '/engineering/iec61850';
  const anonymous = await request.get(`${gateway.origin}/api${path}/status`, {
    headers: { 'X-Gateway-Contract': 'boot' },
  });
  expect(anonymous.status()).toBe(401);
  const { token } = await initializeAdmin(request, gateway);
  const headers = {
    'X-Gateway-Contract': 'boot',
    Authorization: `Bearer ${token}`,
    Origin: gateway.origin,
  };
  const status = await api(request, gateway, token, 'GET', `${path}/status`);
  expect(status.sclImportAvailable, JSON.stringify(status)).toBe(true);
  const drivers = await api(request, gateway, token, 'GET', '/driver/list');
  expect(drivers).toEqual([]);

  async function upload(buffer: Buffer, name: string) {
    return request.post(`${gateway.origin}/api${path}/assets`, {
      headers,
      multipart: { file: { name, mimeType: 'application/xml', buffer } },
    });
  }

  const response = await upload(source, 'customer.icd');
  expect(response.status(), await response.text()).toBe(201);
  const responseBody = await response.json();
  const asset = responseBody.data;
  const digest = createHash('sha256').update(source).digest('hex');
  expect(asset.digest).toBe(digest);
  expect(asset.sizeBytes).toBe(source.length);
  expect(asset.source).toEqual({
    kind: 'scl',
    profile: '2007B4',
    encoding: 'utf8',
  });
  const preview = await api(
    request,
    gateway,
    token,
    'GET',
    `${path}/assets/${digest}/preview?limit=1`,
  );
  expect(preview.totalServers).toBe(1);
  expect(preview.servers).toEqual([
    {
      accessPointCount: 2,
      gooseCount: 1,
      iedName: 'IED1',
      index: 0,
      logicalDeviceCount: 1,
      logicalNodeCount: 2,
      reportCount: 2,
    },
  ]);
  const browse = await api(
    request,
    gateway,
    token,
    'POST',
    `${path}/assets/${digest}/browse`,
    {
      location: {
        kind: 'data',
        server: 0,
        domain: 'PlantDomain',
        logicalNode: 'GGIO1',
        path: [
          { name: 'Vector', indices: [] },
          { name: 'mag', indices: [] },
        ],
      },
      offset: 0,
      limit: 1,
    },
  );
  expect(browse.digest).toBe(digest);
  expect(browse.total).toBe(3);
  expect(browse.nodes[0].declaration.indices).toEqual([0]);
  expect(browse.nodes[0].declaration.path[1].indices).toEqual([0]);
  const element = await api(
    request,
    gateway,
    token,
    'POST',
    `${path}/assets/${digest}/browse`,
    { location: browse.nodes[0].target, offset: 0, limit: 1 },
  );
  expect(element.nodes[0].name).toBe('f');
  expect(element.nodes[0].declaration.functionalConstraint).toBe('MX');
  expect(element.nodes[0].declaration.definition.dataType.widthBits).toBe(32);
  expect(element.nodes[0].declaration.definition.dataType.origin).toBe(
    'declared',
  );
  expect(element.nodes[0].declaration.functionalConstraints).toEqual(['MX']);
  for (const location of [
    {
      kind: 'data',
      server: 0,
      logicalDevice: 'LD0',
      logicalNode: 'GGIO1',
      path: [],
    },
    { kind: 'data', server: 0, domain: 'LD0', logicalNode: 'GGIO1', path: [] },
  ]) {
    const rejected = await request.post(
      `${gateway.origin}/api${path}/assets/${digest}/browse`,
      {
        headers,
        data: { location, offset: 0, limit: 1 },
      },
    );
    expect([400, 422]).toContain(rejected.status());
  }
  const ambiguous = await request.post(
    `${gateway.origin}/api${path}/assets/${digest}/browse`,
    {
      headers,
      data: {
        location: {
          kind: 'data',
          server: 0,
          domain: 'PlantDomain',
          logicalNode: 'GGIO1',
          path: [
            { name: 'Vector', indices: [] },
            { name: 'mag', indices: [] },
            { name: 'f', indices: [] },
          ],
        },
        offset: 0,
        limit: 1,
      },
    },
  );
  expect(ambiguous.status()).toBe(422);
  const unknownField = await request.post(
    `${gateway.origin}/api${path}/assets/${digest}/browse`,
    {
      headers,
      data: {
        location: { kind: 'accessPoints', server: 0, future: true },
        offset: 0,
        limit: 1,
      },
    },
  );
  expect(unknownField.status()).toBe(400);
  const oversized = await request.post(
    `${gateway.origin}/api${path}/assets/${digest}/browse`,
    {
      headers,
      data: {
        location: {
          kind: 'accessPoints',
          server: 0,
          future: 'x'.repeat(33 * 1024),
        },
        offset: 0,
        limit: 1,
      },
    },
  );
  expect(oversized.status()).toBe(413);
  const download = await request.get(
    `${gateway.origin}/api${path}/assets/${digest}/original`,
    { headers },
  );
  expect(download.status()).toBe(200);
  expect(await download.body()).toEqual(source);
  expect(download.headers()['cache-control']).toBe('no-store');
  expect(download.headers()['content-disposition']).toContain(digest);
  const entriesBefore = await readdir(
    resolve(gateway.directory, 'data/engineering'),
  );
  const filesBefore = entriesBefore
    .filter((file) => file.endsWith('.source'))
    .toSorted();
  expect(filesBefore).toEqual([`${digest}.source`]);

  for (const replacement of [
    'daName="mag(0).f" fc="MX" ix="1"',
    'daName="mag.f" fc="MX" ix="1"',
    'daName="mag.f" fc="MX"',
  ]) {
    const invalidFcda = Buffer.from(
      source
        .toString()
        .replace('daName="mag(1).f" fc="MX" ix="1"', replacement),
    );
    expect(invalidFcda).not.toEqual(source);
    const rejectedFcda = await upload(invalidFcda, 'invalid-array-member.scd');
    expect(rejectedFcda.status(), await rejectedFcda.text()).toBe(422);
    const rejectedDigest = createHash('sha256')
      .update(invalidFcda)
      .digest('hex');
    const absentFcda = await request.get(
      `${gateway.origin}/api${path}/assets/${rejectedDigest}/preview`,
      { headers },
    );
    expect(absentFcda.status()).toBe(404);
  }

  const invalid = Buffer.from(
    source
      .toString()
      .replace(
        '<Header id="ng-engineering-laboratory" nameStructure="IEDName"/>',
        '<Header/>',
      ),
  );
  const rejected = await upload(invalid, 'invalid.scd');
  expect(rejected.status()).toBe(422);
  const invalidDigest = createHash('sha256').update(invalid).digest('hex');
  const absent = await request.get(
    `${gateway.origin}/api${path}/assets/${invalidDigest}/preview`,
    { headers },
  );
  expect(absent.status()).toBe(404);
  const entriesAfter = await readdir(
    resolve(gateway.directory, 'data/engineering'),
  );
  const filesAfter = entriesAfter
    .filter((file) => file.endsWith('.source'))
    .toSorted();
  expect(filesAfter).toEqual(filesBefore);
  const duplicate = await upload(source, '../../misleading.cid');
  expect(duplicate.status()).toBe(201);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.data.digest).toBe(digest);
  const channels = await api(request, gateway, token, 'GET', '/channel/list');
  expect(channels).toEqual([]);
});

/** Unknown cardinality remains inspectable source evidence and cannot admit a point. */
test('operator sees unresolved symbolic length and the real backend rejects an indexed mapping', async ({
  gateway,
  page,
  request,
}) => {
  const fixture = await readFile(
    resolve(
      import.meta.dirname,
      '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/symbolic.scd',
    ),
  );
  const source = Buffer.from(
    fixture
      .toString()
      .replace('<Val>2</Val>', '')
      .replace('<DAI name="numOfHar"><Val>3</Val></DAI>', ''),
  );
  const digest = createHash('sha256').update(source).digest('hex');
  const { token, password } = await initializeAdmin(request, gateway);
  const locales = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
      'utf8',
    ),
  );
  const labels = locales.southward.channel.engineering;
  await page.goto(`${gateway.origin}/#/auth/login`);
  await page
    .getByPlaceholder('请输入用户名', { exact: true })
    .fill('system_admin');
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`${gateway.origin}/#/southward/channel`);
  await page.getByRole('button', { name: labels.title, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const fileInput = dialog.locator('input[type=file][accept*=".scd"]');
  await fileInput.setInputFiles({
    name: 'unresolved.scd',
    mimeType: 'application/xml',
    buffer: source,
  });
  await expect(dialog.locator(`[title="${digest}"]`)).toBeVisible();
  await dialog.getByRole('button', { name: 'IED1', exact: true }).click();
  const model = dialog.getByRole('region', { name: labels.model, exact: true });
  for (const name of ['PlantDomain', 'GGIO1', 'Vector']) {
    await model.getByRole('button', { name, exact: true }).click();
  }
  const row = model
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'mag', exact: true }) });
  await expect(row).toContainText(labels.unknownArrayCount);
  await expect(row).toContainText('numOfHar');
  await expect(row).toContainText(labels.countResolution.missingValue);
  await expect(row.getByRole('cell', { name: '—', exact: true })).toBeVisible();
  const declaration = await api(
    request,
    gateway,
    token,
    'POST',
    `/engineering/iec61850/assets/${digest}/browse`,
    {
      location: {
        kind: 'data',
        server: 0,
        domain: 'PlantDomain',
        logicalNode: 'GGIO1',
        path: [{ name: 'Vector', indices: [] }],
      },
      offset: 0,
      limit: 64,
    },
  );
  expect(
    declaration.nodes.find((node: { name: string }) => node.name === 'mag')
      .childCount,
  ).toBeNull();
  await expect(
    row.getByRole('button', { name: 'mag', exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole('button', { name: labels.addRead, exact: true }),
  ).toHaveCount(0);
  const denied = await request.post(
    `${gateway.origin}/api/engineering/iec61850/assets/${digest}/mapping`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: {
        server: 0,
        accessPoint: 'Main',
        reports: [],
        points: [
          {
            name: 'unresolved',
            key: 'unresolved',
            type: 1,
            unit: null,
            purpose: {
              kind: 'read',
              value: {
                domain: 'PlantDomain',
                logicalNode: 'GGIO1',
                functionalConstraint: 'MX',
                path: [
                  { name: 'Vector', indices: [] },
                  { name: 'mag', indices: [0] },
                  { name: 'f', indices: [] },
                ],
              },
              quality: null,
              sourceTime: null,
            },
          },
        ],
      },
    },
  );
  expect(denied.status(), await denied.text()).toBe(422);
  expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
    [],
  );
  await page.screenshot({
    path: test.info().outputPath('unknown-symbolic-length.png'),
  });
});

/** Chromium uses the shipped modal and real HTTP/core/validator/SQLite pipeline. */
test('operator uploads, selects native declarations and downloads the unchanged original', async ({
  gateway,
  page,
  request,
}) => {
  const fixture = await readFile(
    resolve(
      import.meta.dirname,
      '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/engineering.scd',
    ),
  );
  const source = Buffer.from(
    fixture.toString().replace('count="3"', 'count="20"'),
  );
  const digest = createHash('sha256').update(source).digest('hex');
  const { token, password } = await initializeAdmin(request, gateway);
  await page.goto(`${gateway.origin}/#/auth/login`);
  await page
    .getByPlaceholder('请输入用户名', { exact: true })
    .fill('system_admin');
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`${gateway.origin}/#/southward/channel`);
  await page
    .getByRole('button', { name: 'IEC 61850 工程文件', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  const file = dialog.locator('input[type=file][accept*=".scd"]');
  await expect(
    dialog.getByRole('button', { name: '上传工程文件', exact: true }),
  ).toBeEnabled();
  await file.setInputFiles({
    name: 'customer.cid',
    mimeType: 'application/xml',
    buffer: source,
  });
  await expect(dialog.locator(`[title="${digest}"]`)).toBeVisible();
  await dialog.getByRole('button', { name: 'IED1', exact: true }).click();
  const model = dialog.getByRole('region', {
    name: '原始工程模型',
    exact: true,
  });
  const table = model.getByRole('table');
  const node = (name: string) =>
    table.getByRole('button', { name, exact: true });
  const root = model
    .getByRole('button', { name: 'LD / LN / 数据对象', exact: true })
    .first();
  await model
    .getByRole('button', { name: 'AccessPoint 与网络地址', exact: true })
    .click();
  await node('Main').click();
  await node('Station').click();
  await expect(
    table.getByRole('cell', { name: '192.0.2.10', exact: true }),
  ).toBeVisible();
  await expect(
    model.getByText('已选择 AP：Main', { exact: true }),
  ).toBeVisible();
  await root.click();
  await node('PlantDomain').click();
  await node('GGIO1').click();
  await node('Ind').click();
  await expect(
    table.getByText(`PlantDomain / Ind.stVal / ST / 声明类型: boolean`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    table.getByText(`PlantDomain / Ind.q / ST / 声明类型: quality`, {
      exact: true,
    }),
  ).toBeVisible();
  await model
    .getByRole('navigation', { name: '模型浏览路径' })
    .getByRole('button', { name: 'GGIO1', exact: true })
    .click();
  await node('Vector').click();
  await node('mag').click();
  await model.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(node('19')).toBeVisible();
  await expect(node('0')).toHaveCount(0);
  await model.getByRole('button', { name: '上一页', exact: true }).click();
  await node('0').click();
  await expect(
    table.getByText(`PlantDomain / Vector.mag[0].f / MX / 声明类型: float 32`, {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../../roadmap/evidence/2026-10-07-frontend/engineering-array.png',
    ),
  });
  await root.click();
  await node('PlantDomain').click();
  await node('LLN0').click();
  await node('Mod').click();
  await node('stVal').click();
  await expect(
    table.getByRole('cell', { name: 'blocked', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: 'ord: 2', exact: true }),
  ).toBeVisible();

  // Delay a real API result: switching views must abort it and preserve the new tree.
  const held: { response: APIResponse; route: Route }[] = [];
  let delayAccessPoints = true;
  const browseUrl = '**/api/engineering/iec61850/assets/*/browse';
  await page.route(browseUrl, async (route) => {
    const payload = route.request().postDataJSON() as {
      location: { kind: string };
    };
    if (delayAccessPoints && payload.location.kind === 'accessPoints') {
      delayAccessPoints = false;
      held.push({ response: await route.fetch(), route });
    } else await route.continue();
  });
  try {
    await model
      .getByRole('button', { name: 'AccessPoint 与网络地址', exact: true })
      .click();
    await expect.poll(() => held.length).toBe(1);
    const aborted = page.waitForEvent(
      'requestfailed',
      (failed) =>
        failed.url().endsWith('/browse') &&
        failed.postDataJSON().location.kind === 'accessPoints',
    );
    await root.click();
    await aborted;
    await expect(node('PlantDomain')).toBeVisible();
    const previous = held.pop();
    if (!previous)
      throw new Error('Delayed engineering reply was not retained');
    await previous.route.fulfill({ response: previous.response });
    await expect(node('PlantDomain')).toBeVisible();
    await expect(node('Main')).toHaveCount(0);
  } finally {
    for (const pending of held)
      await pending.route.fulfill({ response: pending.response });
    await page.unroute(browseUrl);
  }

  const downloadEvent = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: '下载原始工程文件', exact: true })
    .click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe(`${digest}.xml`);
  const downloadedPath = await downloaded.path();
  if (!downloadedPath)
    throw new Error('Chromium did not retain the downloaded source');
  expect(await readFile(downloadedPath)).toEqual(source);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('button', { name: 'IEC 61850 工程文件', exact: true })
    .click();
  await dialog.getByLabel('已上传原件的 SHA-256', { exact: true }).fill(digest);
  await dialog.getByRole('button', { name: '打开原件', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'IED1', exact: true }),
  ).toBeVisible();
  const invalid = Buffer.from(
    source
      .toString()
      .replace(
        '<Header id="ng-engineering-laboratory" nameStructure="IEDName"/>',
        '<Header/>',
      ),
  );
  await file.setInputFiles({
    name: 'invalid.icd',
    mimeType: 'application/xml',
    buffer: invalid,
  });
  await expect(
    dialog.getByText('工程文件或模型读取失败，请检查诊断后重试。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'IED1', exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel('已上传原件的 SHA-256', { exact: true }).fill(digest);
  await dialog.getByRole('button', { name: '打开原件', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'IED1', exact: true }),
  ).toBeVisible();
  expect(await api(request, gateway, token, 'GET', '/driver/list')).toEqual([]);
  expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
    [],
  );
});
