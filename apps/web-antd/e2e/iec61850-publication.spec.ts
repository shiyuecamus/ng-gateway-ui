import type { APIRequestContext, Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

import type { Gateway } from './gateway';

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const root = '/engineering/iec61850';
const fixturePath = resolve(
  import.meta.dirname,
  '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/engineering.scd',
);
const symbolicFixturePath = resolve(
  import.meta.dirname,
  '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/symbolic.scd',
);
const association = {
  callingTransport: '0001',
  calledTransport: '0001',
  callingSession: '0001',
  calledSession: '0001',
  callingPresentation: '00000001',
  calledPresentation: '00000001',
};
const target = (path: { indices: number[]; name: string }[]) => ({
  domain: 'PlantDomain',
  logicalNode: 'GGIO1',
  path,
});
const readPoints = () => [
  {
    name: 'status',
    key: 'status',
    type: 1,
    unit: null,
    purpose: {
      kind: 'read',
      value: target([
        { name: 'Ind', indices: [] },
        { name: 'stVal', indices: [] },
      ]),
      quality: target([
        { name: 'Ind', indices: [] },
        { name: 'q', indices: [] },
      ]),
      sourceTime: target([
        { name: 'Ind', indices: [] },
        { name: 't', indices: [] },
      ]),
    },
  },
  {
    name: 'array',
    key: 'array-1',
    type: 0,
    unit: 'A',
    purpose: {
      kind: 'read',
      value: target([
        { name: 'Vector', indices: [] },
        { name: 'mag', indices: [1] },
        { name: 'f', indices: [] },
      ]),
      quality: null,
      sourceTime: null,
    },
  },
];

async function upload(
  request: APIRequestContext,
  gateway: Gateway,
  token: string,
  source: Buffer,
) {
  const result = await request.post(`${gateway.origin}/api${root}/assets`, {
    headers: { 'X-Gateway-Contract': 'boot', Authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name: 'reviewed.scd',
        mimeType: 'application/xml',
        buffer: source,
      },
    },
  });
  expect(result.status(), await result.text()).toBe(201);
  const body = await result.json();
  return body.data.digest as string;
}
function proposal(port: number) {
  return {
    acquisition: {
      protocol: 'mms' as const,
      contract: {
        substitution: [],
        manufacturer: null,
        model: null,
        firmware: null,
        domains: ['PlantDomain'],
        documents: [] as {
          digest: string;
          label: string;
          locator: null | string;
          roles: 'vendorDocumentation'[];
        }[],
        parts: [] as {
          edition: { amendment: number; major: number };
          part: 'mapping81' | 'semantics71';
          publication: string;
          sources: string[];
        }[],
      },
      mapping: {
        server: 0,
        accessPoint: 'Main',
        points: readPoints(),
        reports: [] as unknown[],
      },
    },
    target: { kind: 'create' },
    channel: {
      name: 'complete-publication',
      driverId: 0,
      status: 1,
      period: 1000,
      reportType: 0,
      connectionPolicy: {
        connectTimeoutMs: 1000,
        readTimeoutMs: 1000,
        writeTimeoutMs: 1000,
        backoff: {
          initialIntervalMs: 100,
          maxIntervalMs: 1000,
          randomizationFactor: 0,
          multiplier: 2,
          maxAttempts: 1,
        },
      },
      connectionConfig: {
        protocol: 'mms',
        transport: { kind: 'tcp', host: '127.0.0.1', port },
        association,
      },
    },
  };
}

test('real native publication binds source and revision and rejects stale or malformed complete proposals', async ({
  gateway,
  request,
}) => {
  const { token } = await initializeAdmin(request, gateway);
  await installNativeArtifact(
    request,
    gateway,
    token,
    'driver',
    'ng_driver_iec61850',
  );
  const source = await readFile(fixturePath);
  const digest = await upload(request, gateway, token, source);
  const drivers = await api(request, gateway, token, 'GET', '/driver/list');
  const draft = proposal(102);
  draft.channel.driverId = drivers[0].id;
  const beforeProtocolRejection = await api(
    request,
    gateway,
    token,
    'GET',
    '/channel/list',
  );
  for (const protocol of [undefined, '', 'MMS', 'goose']) {
    const rejected = structuredClone(draft);
    const connection = rejected.channel.connectionConfig as Record<
      string,
      unknown
    >;
    if (protocol === undefined) delete connection.protocol;
    else connection.protocol = protocol;
    const response = await request.post(
      `${gateway.origin}/api${root}/assets/${digest}/publication-preview`,
      {
        data: rejected,
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    expect(response.status(), await response.text()).toBe(422);
    expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
      beforeProtocolRejection,
    );
  }
  const preview = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/assets/${digest}/publication-preview`,
    draft,
  );
  expect(preview.deviceIds).toEqual([null]);
  expect(preview.pointIds).toEqual([null, null]);
  expect(preview.mapping.devices[0].domain).toBe('PlantDomain');
  expect(
    preview.mapping.points[1].driverConfig.configuration.valuePath,
  ).toEqual(['mag', 1, 'f']);
  const malformed = structuredClone(draft);
  const invalidElement = malformed.acquisition.mapping.points
    .at(1)
    ?.purpose.value.path.at(1);
  if (!invalidElement) throw new Error('Fixture selected element is missing');
  invalidElement.indices = [3];
  const denied = await request.post(
    `${gateway.origin}/api${root}/assets/${digest}/publication-preview`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: malformed,
    },
  );
  expect(denied.status()).toBe(422);
  expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
    [],
  );
  const accepted = await request.post(
    `${gateway.origin}/api${root}/assets/${digest}/publish`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { proposal: draft, previewDigest: preview.previewDigest },
    },
  );
  expect(accepted.status(), await accepted.text()).toBe(202);
  const receiptBody = await accepted.json();
  const receipt = receiptBody.data;
  expect(receipt.configuration.state).toBe('disabled');
  expect(receipt.configuration.desiredRevision).toBe('1');
  expect(receipt.configuration.appliedRevision).toBe('1');
  const id = receipt.publication.channelId;
  const detail = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${id}`,
  );
  expect(detail.engineeringPublication.sourceDigest).toBe(digest);
  const devices = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/${id}/sub-devices`,
  );
  const points = await api(
    request,
    gateway,
    token,
    'GET',
    `/point/page?deviceId=${devices[0].id}&page=1&pageSize=100`,
  );
  expect(points.records).toHaveLength(2);
  expect(
    points.records.find((point: { key: string }) => point.key === 'array-1')
      .type,
  ).toBe(0);
  const replacement = {
    ...draft,
    target: { kind: 'replace', channelId: id, baseRevision: '1' },
  };
  const reviewed = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/assets/${digest}/publication-preview`,
    replacement,
  );
  expect(reviewed.pointIds).toEqual(
    ['status', 'array-1'].map(
      (key) =>
        points.records.find((point: { key: string }) => point.key === key).id,
    ),
  );
  await api(request, gateway, token, 'PUT', '/channel/change-status', {
    id,
    status: 1,
  });
  const conflict = await request.post(
    `${gateway.origin}/api${root}/assets/${digest}/publish`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { proposal: replacement, previewDigest: reviewed.previewDigest },
    },
  );
  expect(conflict.status()).toBe(409);
  const current = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${id}`,
  );
  expect(current.configuration.desiredRevision).toBe('2');
  expect(current.engineeringPublication).toBeNull();
});

async function reservePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing local peer address');
  const port = address.port;
  listener.close();
  await once(listener, 'close');
  return port;
}
async function startPeer(
  port: number,
  nestedArrays: boolean,
): Promise<ChildProcess> {
  const binary = process.env.NG_IEC61850_ENGINEERING_PEER_BIN;
  if (!binary) throw new Error('Missing pinned independent engineering peer');
  const python = process.env.NG_IEC61850_NAMED_TYPE_PYTHON;
  if (nestedArrays && !python)
    throw new Error('Nested array peer requires the independent BER decoder');
  const command = python ?? binary;
  const arguments_ = python
    ? [
        resolve(
          import.meta.dirname,
          '../../../../ng-gateway-protocols/iec61850/tests/fixtures/run_named_type_proxy.py',
        ),
        '--peer-bin',
        binary,
        '--edition',
        'ed21',
        '--port',
        String(port),
        '--no-data-reference',
        ...(nestedArrays ? ['--nested-arrays'] : []),
      ]
    : ['ed21', String(port), 'no-data-reference'];
  const peer = spawn(command, arguments_, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  peer.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  peer.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  await expect
    .poll(() => {
      if (peer.exitCode !== null)
        throw new Error(`Independent peer failed: ${errors}`);
      return output;
    })
    .toContain('READY');
  return peer;
}
async function stopPeer(peer: ChildProcess) {
  if (peer.exitCode !== null || peer.signalCode !== null) {
    expect(peer.exitCode, 'Independent peer must stop successfully').toBe(0);
    return;
  }
  const exited = once(peer, 'exit');
  peer.kill('SIGTERM');
  const timer = new AbortController();
  try {
    const result = await Promise.race([
      exited,
      delay(5000, undefined, { signal: timer.signal }).then(() => {
        peer.kill('SIGKILL');
        throw new Error('Independent peer shutdown failed');
      }),
    ]);
    expect(result[0], 'Independent peer must join its socket owners').toBe(0);
  } finally {
    timer.abort();
  }
}

test('Chromium publishes explicit native report bindings through GI and exposes desired versus applied', async ({
  gateway,
  request,
  page,
}) => {
  test.skip(
    !process.env.NG_IEC61850_ENGINEERING_PEER_BIN,
    'Requires the fixed-commit independent engineering peer',
  );
  test.setTimeout(180_000);
  const port = await reservePort();
  const peer = await startPeer(port, false);
  try {
    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const original = await readFile(symbolicFixturePath);
    const selected =
      '<FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(1).f" fc="MX" ix="1"/>';
    const source = Buffer.from(
      original
        .toString()
        .replace(
          selected,
          `${selected.replace('mag(1).f', 'mag(0).f').replace('ix="1"', 'ix="0"')}\n              ${selected}`,
        ),
    );
    const digest = createHash('sha256').update(source).digest('hex');
    const locales = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
        'utf8',
      ),
    );
    const labels = locales.southward.channel.engineering;
    const mapping = labels.mapping;
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('\u8BF7\u8F93\u5165\u7528\u6237\u540D', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('\u5BC6\u7801', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/southward/channel`);
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file][accept*=".scd"]').setInputFiles({
      name: 'reviewed.scd',
      mimeType: 'application/xml',
      buffer: source,
    });
    await expect(dialog.locator(`[title="${digest}"]`)).toBeVisible();
    await dialog.getByRole('button', { name: 'IED1', exact: true }).click();
    const model = dialog.getByRole('region', {
      name: labels.model,
      exact: true,
    });
    const table = model.getByRole('table');
    const node = (name: string) =>
      table.getByRole('button', { name, exact: true });
    const rootButton = model
      .getByRole('button', { name: labels.logicalDevices, exact: true })
      .first();
    await model
      .getByRole('button', { name: labels.accessPoints, exact: true })
      .click();
    await node('Main').click();
    await rootButton.click();
    await node('PlantDomain').click();
    await node('GGIO1').click();
    await node('Ind').click();
    await table
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'stVal', exact: true }) })
      .getByRole('button', { name: labels.addRead, exact: true })
      .click();
    await table
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'q', exact: true }) })
      .getByRole('button', { name: labels.setQuality, exact: true })
      .click();
    await table
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 't', exact: true }) })
      .getByRole('button', { name: labels.setTime, exact: true })
      .click();
    const editor = dialog.getByRole('region', {
      name: mapping.title,
      exact: true,
    });
    await editor.getByLabel(mapping.pointKey, { exact: true }).fill('status');
    await editor.getByLabel(mapping.pointName, { exact: true }).fill('status');
    await model
      .getByRole('navigation', { name: labels.breadcrumb })
      .getByRole('button', { name: 'GGIO1', exact: true })
      .click();
    await node('Vector').click();
    const symbolicRow = table.getByRole('row').filter({
      has: page.getByRole('button', { name: 'mag', exact: true }),
    });
    await expect(symbolicRow).toContainText('numOfHar');
    await expect(symbolicRow).toContainText(
      labels.countResolution.instanceOverride,
    );
    const countPage = await api(
      request,
      gateway,
      token,
      'POST',
      `${root}/assets/${digest}/browse`,
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
    const countAxis = countPage.nodes.find(
      (entry: { name: string }) => entry.name === 'mag',
    ).declaration.arrayDimensions[0];
    expect(countAxis).toEqual({
      count: 3,
      packed: null,
      countReference: {
        name: 'numOfHar',
        resolution: 'instanceOverride',
        valueKind: 'RO',
      },
    });
    await node('mag').click();
    await node('1').click();
    await table
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'f', exact: true }) })
      .getByRole('button', { name: labels.addRead, exact: true })
      .click();
    await editor.getByLabel(mapping.pointKey, { exact: true }).fill('array-1');
    await editor.getByLabel(mapping.pointName, { exact: true }).fill('array');
    await editor
      .getByRole('combobox', { name: mapping.category, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(mapping.attribute, { exact: true })
      .click();
    await rootButton.click();
    await node('PlantDomain').click();
    await node('LLN0').click();
    await model
      .getByRole('button', { name: labels.reports, exact: true })
      .click();
    await table
      .getByRole('row')
      .filter({
        has: page.getByRole('button', { name: 'urEvents01', exact: true }),
      })
      .getByRole('button', { name: labels.addReport, exact: true })
      .click();
    await node('urEvents01').click();
    await editor
      .getByLabel(mapping.reportId, { exact: true })
      .fill('ArrayEvents');
    await editor
      .getByRole('combobox', { name: mapping.reservation, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(`URCB: ${mapping.unreserved}`, { exact: true })
      .click();
    await editor
      .getByRole('combobox', { name: mapping.activePoint, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('status · status', { exact: true })
      .click();
    const member = (index: number) => table.getByRole('row').nth(index + 1);
    await member(2)
      .getByRole('button', { name: labels.bindValue, exact: true })
      .click();
    await member(0)
      .getByRole('button', { name: labels.bindQuality, exact: true })
      .click();
    await member(5)
      .getByRole('button', { name: labels.bindTime, exact: true })
      .click();
    await editor
      .getByRole('combobox', { name: mapping.activePoint, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('array-1 · array', { exact: true })
      .click();
    await member(4)
      .getByRole('button', { name: labels.bindValue, exact: true })
      .click();
    await editor
      .getByRole('tab', { name: mapping.channelTab, exact: true })
      .click();
    await editor
      .getByRole('combobox', { name: mapping.driver, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(/IEC 61850/)
      .click();
    await editor
      .getByLabel(mapping.channelName, { exact: true })
      .fill('browser-report-publication');
    await editor.getByLabel(mapping.host, { exact: true }).fill('127.0.0.1');
    const transport = editor.getByRole('combobox', {
      name: mapping.transport,
      exact: true,
    });
    await transport.press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(mapping.plainTcp, { exact: true })
      .click();
    await editor.getByLabel(mapping.port, { exact: true }).fill(String(port));
    await editor.getByText(mapping.connection, { exact: true }).click();
    await editor
      .getByLabel(mapping.association, { exact: true })
      .fill(JSON.stringify(association));
    await editor.getByLabel(mapping.enabled, { exact: true }).check();
    const contractLabels = locales.southward.channel.engineering.contract;
    await editor
      .getByRole('tab', { name: contractLabels.tab, exact: true })
      .click();
    const contractEditor = editor.getByRole('region', {
      name: contractLabels.title,
      exact: true,
    });
    await contractEditor
      .getByLabel(contractLabels.manufacturer, { exact: true })
      .fill('Laboratory vendor');
    await contractEditor
      .getByLabel(contractLabels.model, { exact: true })
      .fill('Independent-peer test model');
    await contractEditor
      .getByLabel(contractLabels.firmware, { exact: true })
      .fill('laboratory-only-v1');
    const documentBytes = Buffer.from(
      'Laboratory PICS/PIXIT: substitution unsupported for PlantDomain/GGIO1/Ind, table S17. Not production IED certification.',
    );
    const documentDigest = createHash('sha256')
      .update(documentBytes)
      .digest('hex');
    const uploadedDocument = page.waitForResponse(
      (response) =>
        response.url().endsWith('/documents') &&
        response.request().method() === 'POST',
    );
    await contractEditor.locator('input[type=file]').setInputFiles({
      name: 'laboratory-statements.txt',
      mimeType: 'text/plain',
      buffer: documentBytes,
    });
    const documentResponse = await uploadedDocument;
    expect(documentResponse.status(), await documentResponse.text()).toBe(201);
    const documentBody = await documentResponse.json();
    expect(documentBody.data.source).toEqual({
      kind: 'document',
    });
    await expect(
      contractEditor.locator(`[title="${documentDigest}"]`),
    ).toBeVisible();
    for (const role of ['PICS', 'PIXIT']) {
      await contractEditor
        .getByRole('combobox', {
          name: contractLabels.documentRoles,
          exact: true,
        })
        .click();
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(role, { exact: true })
        .click();
      await contractEditor
        .getByRole('combobox', {
          name: contractLabels.documentRoles,
          exact: true,
        })
        .press('Escape');
      await expect(contractEditor).toBeVisible();
    }
    await contractEditor
      .getByLabel(contractLabels.locator, { exact: true })
      .fill('pp 1-8');
    for (const [part, amendment, publication] of [
      ['semantics71', 0, 'IEC 61850-7-1:2011'],
      ['acsi72', 1, 'IEC 61850-7-2:2010+A1:2020'],
      ['mapping81', 0, 'IEC 61850-8-1:2011'],
    ] as const) {
      await contractEditor
        .getByRole('button', {
          name: `right ${contractLabels.parts[part]}`,
          exact: true,
        })
        .click();
      const declaration = contractEditor.locator(
        `[aria-label="${contractLabels.parts[part]}"]`,
      );
      await declaration
        .getByLabel(contractLabels.declared, { exact: true })
        .check();
      await declaration
        .getByLabel(contractLabels.major, { exact: true })
        .fill('2');
      await declaration
        .getByLabel(contractLabels.amendment, { exact: true })
        .fill(String(amendment));
      await declaration
        .getByLabel(contractLabels.publication, { exact: true })
        .fill(publication);
      await declaration
        .getByRole('combobox', { name: contractLabels.sources, exact: true })
        .click();
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(/laboratory-statements.txt/)
        .click();
      await declaration
        .getByRole('combobox', { name: contractLabels.sources, exact: true })
        .press('Escape');
      await expect(contractEditor).toBeVisible();
      await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
    }
    await contractEditor
      .getByRole('button', {
        name: contractLabels.substitutionAdd,
        exact: true,
      })
      .click();
    const support = contractEditor.getByRole('combobox', {
      name: contractLabels.substitutionSupport,
      exact: true,
    });
    await expect(support).toHaveValue('');
    await editor
      .getByRole('button', { name: mapping.preview, exact: true })
      .click();
    await expect(editor).toContainText(contractLabels.substitutionRequired);
    await support.press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(contractLabels.substitutionUnsupported, { exact: true })
      .click();
    await contractEditor
      .getByRole('combobox', {
        name: contractLabels.substitutionSource,
        exact: true,
      })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('laboratory-statements.txt', { exact: true })
      .click();
    await contractEditor
      .getByLabel(contractLabels.locator, { exact: true })
      .last()
      .fill('Table S17; PlantDomain/GGIO1/Ind');
    await contractEditor
      .getByRole('button', {
        name: contractLabels.substitutionAddScope,
        exact: true,
      })
      .click();
    await contractEditor
      .getByRole('combobox', {
        name: contractLabels.substitutionDomain,
        exact: true,
      })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .getByText('PlantDomain', { exact: true })
      .click();
    await contractEditor
      .getByLabel(contractLabels.substitutionLn, { exact: true })
      .fill('GGIO1');
    await contractEditor
      .getByRole('button', {
        name: contractLabels.substitutionAddComponent,
        exact: true,
      })
      .click();
    await contractEditor
      .getByLabel(contractLabels.substitutionObjectName, { exact: true })
      .fill('Ind');
    await page.screenshot({
      path: test.info().outputPath('pics-scoped-declaration-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () =>
        page.evaluate<boolean>(
          'document.documentElement.scrollWidth <= window.innerWidth',
        ),
      )
      .toBe(true);
    await contractEditor
      .getByLabel(contractLabels.substitutionLn, { exact: true })
      .click();
    await page.screenshot({
      path: test.info().outputPath('pics-scoped-declaration-narrow.png'),
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await contractEditor
      .getByLabel(contractLabels.manufacturer, { exact: true })
      .click();
    await editor
      .getByRole('button', { name: mapping.preview, exact: true })
      .click();
    await expect(
      editor.getByRole('button', { name: mapping.publish, exact: true }),
    ).toBeVisible();
    const exactOriginalDownload = page.waitForEvent('download');
    await editor
      .getByRole('region', { name: contractLabels.evidence, exact: true })
      .getByRole('button', { name: contractLabels.download, exact: true })
      .click();
    const originalDownload = await exactOriginalDownload;
    expect(originalDownload.suggestedFilename()).toBe(`${documentDigest}.bin`);
    const originalPath = await originalDownload.path();
    expect(originalPath).not.toBeNull();
    expect(await readFile(originalPath ?? '')).toEqual(documentBytes);
    const published = page.waitForResponse(
      (response) =>
        response.url().endsWith('/publish') &&
        response.request().method() === 'POST',
    );
    await editor
      .getByRole('button', { name: mapping.publish, exact: true })
      .click();
    const response = await published;
    expect(response.status(), await response.text()).toBe(202);
    const receiptBody = await response.json();
    const receipt = receiptBody.data;
    expect(receipt.configuration.state).toBe('active');
    expect(receipt.configuration.appliedRevision).toBe(
      receipt.configuration.desiredRevision,
    );
    expect(receipt.publication.sourceDigest).toBe(digest);
    expect(receipt.contract.domains).toEqual(['PlantDomain']);
    expect(receipt.contract.substitution).toEqual([
      {
        support: 'unsupported',
        source: documentDigest,
        locator: 'Table S17; PlantDomain/GGIO1/Ind',
        objects: [
          {
            domain: 'PlantDomain',
            logicalNode: 'GGIO1',
            path: [{ name: 'Ind', indices: [] }],
          },
        ],
      },
    ]);
    expect(
      receipt.contract.parts.map((part: { edition: unknown }) => part.edition),
    ).toEqual([
      { major: 2, amendment: 0 },
      { major: 2, amendment: 1 },
      { major: 2, amendment: 0 },
    ]);
    expect(receipt.contract.documents).toEqual([
      {
        digest: documentDigest,
        roles: ['pics', 'pixit'],
        label: 'laboratory-statements.txt',
        locator: 'pp 1-8',
      },
    ]);
    expect(
      receipt.contract.parts.some(
        (part: { part: string }) => part.part === 'scl6',
      ),
    ).toBe(false);
    const activeContract = await api(
      request,
      gateway,
      token,
      'GET',
      `${root}/channels/${receipt.publication.channelId}/contract`,
    );
    expect(activeContract.contract).toEqual(receipt.contract);
    await page.screenshot({
      path: test.info().outputPath('ied-contract-publication.png'),
      fullPage: true,
    });

    const detail = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${receipt.publication.channelId}`,
    );
    expect(detail.driverConfig.reportSources[0].members).toHaveLength(6);
    expect(detail.driverConfig.reportSources[0].members[1]).toEqual(
      detail.driverConfig.reportSources[0].members[2],
    );
    expect(detail.driverConfig.reportSources[0].members[4].selection).toEqual([
      1,
      'f',
    ]);
    await expect(
      editor.getByRole('region', { name: mapping.result, exact: true }),
    ).toBeVisible();
    // A committed failure retains the old applied revision and requires a new
    // reviewed intent; repairing the endpoint never replays a physical control.
    const disconnectedPort = await reservePort();
    await editor
      .getByRole('tab', { name: mapping.channelTab, exact: true })
      .click();
    await editor
      .getByLabel(mapping.port, { exact: true })
      .fill(String(disconnectedPort));
    await editor
      .getByRole('button', { name: mapping.preview, exact: true })
      .click();
    await expect(
      editor.getByRole('button', { name: mapping.publish, exact: true }),
    ).toBeVisible();
    const failedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/publish') &&
        response.request().method() === 'POST',
    );
    await editor
      .getByRole('button', { name: mapping.publish, exact: true })
      .click();
    const failure = await failedResponse;
    expect(failure.status(), await failure.text()).toBe(202);
    const failedBody = await failure.json();
    const failed = failedBody.data;
    expect(failed.configuration.desiredRevision).toBe('2');
    expect(failed.configuration.appliedRevision).toBe('1');
    expect(failed.configuration.state).toBe('failed');
    expect(failed.configuration.lastError).toBeTruthy();
    await expect(
      editor.getByRole('button', { name: mapping.retry, exact: true }),
    ).toBeVisible();
    await expect(
      editor.getByLabel(mapping.port, { exact: true }),
    ).toBeEnabled();
    await editor.getByLabel(mapping.port, { exact: true }).fill(String(port));
    await editor
      .getByRole('button', { name: mapping.preview, exact: true })
      .click();
    await expect(
      editor.getByRole('button', { name: mapping.publish, exact: true }),
    ).toBeVisible();
    const recoveredResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/publish') &&
        response.request().method() === 'POST',
    );
    await editor
      .getByRole('button', { name: mapping.publish, exact: true })
      .click();
    const recovery = await recoveredResponse;
    expect(recovery.status(), await recovery.text()).toBe(202);
    const recoveredBody = await recovery.json();
    const recovered = recoveredBody.data;
    expect(recovered.configuration.desiredRevision).toBe('3');
    expect(recovered.configuration.appliedRevision).toBe('3');
    expect(recovered.configuration.state).toBe('active');
    const repaired = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${receipt.publication.channelId}`,
    );
    expect(repaired.driverConfig.reportSources[0].points).toEqual(
      detail.driverConfig.reportSources[0].points,
    );
    const result = editor.getByRole('region', {
      name: mapping.result,
      exact: true,
    });
    await result.scrollIntoViewIfNeeded();
    await expect(result).toContainText('3');
    await page.screenshot({
      path: test.info().outputPath('publication-report.png'),
      fullPage: true,
    });
    const capabilityPath = `/channel/${receipt.publication.channelId}/capabilities`;
    const headers = {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${token}`,
    };
    const inventoryResponse = await request.get(
      `${gateway.origin}/api${capabilityPath}`,
      { headers },
    );
    expect(inventoryResponse.status(), await inventoryResponse.text()).toBe(
      200,
    );
    expect(inventoryResponse.headers()['cache-control']).toBe('no-store');
    const inventory = await inventoryResponse.json();
    expect(inventory.configurationRevision).toBe('3');
    expect(
      inventory.definitions.map((definition: { id: string }) => definition.id),
    ).toEqual([
      'ng:southward:iec61850:tls-identity:boot',
      'ng:southward:iec61850:mms:directory',
      'ng:southward:iec61850:mms:variable-type',
      'ng:southward:iec61850:mms:named-type',
      'ng:southward:iec61850:mms:data-set-members',
      'ng:southward:iec61850:mms:passive-read',
      'ng:southward:iec61850:mms:report-control-read',
    ]);
    const typeId = 'ng:southward:iec61850:mms:variable-type';
    const invokeHeaders = {
      ...headers,
      'X-Gateway-Configuration-Revision': '3',
    };
    const stale = await request.post(
      `${gateway.origin}/api${capabilityPath}/${typeId}`,
      {
        headers: { ...invokeHeaders, 'X-Gateway-Configuration-Revision': '2' },
        data: { domain: 'PlantDomain', item: 'GGIO1$ST$Ind' },
      },
    );
    expect(stale.status()).toBe(409);
    const unregistered = await request.post(
      `${gateway.origin}/api${capabilityPath}/arbitrary-observation`,
      { headers: invokeHeaders, data: null },
    );
    expect(unregistered.status()).toBe(422);
    const deniedControl = await request.post(
      `${gateway.origin}/api${capabilityPath}/ng:southward:iec61850:mms:passive-read`,
      {
        headers: invokeHeaders,
        data: {
          variables: [{ domain: 'PlantDomain', item: 'CSWI1$CO$Pos$SBO' }],
        },
      },
    );
    expect(deniedControl.status()).toBe(422);
    for (const item of ['CSWI1$CO$Pos$SBO', 'LLN0$RP$urEvents01$GI']) {
      const denied = await request.post(
        `${gateway.origin}/api${capabilityPath}/ng:southward:iec61850:mms:report-control-read`,
        { headers: invokeHeaders, data: { domain: 'PlantDomain', item } },
      );
      expect(denied.status()).toBe(422);
    }
    const oversized = await request.post(
      `${gateway.origin}/api${capabilityPath}/${typeId}`,
      {
        headers: { ...invokeHeaders, 'Content-Type': 'application/json' },
        data: Buffer.alloc(16 * 1024 + 1, 32),
      },
    );
    expect(oversized.status()).toBe(413);
    const observed = await request.post(
      `${gateway.origin}/api${capabilityPath}/${typeId}`,
      {
        headers: invokeHeaders,
        data: { domain: 'PlantDomain', item: 'GGIO1$MX$Vector' },
      },
    );
    expect(observed.status(), await observed.text()).toBe(200);
    expect(observed.headers()['x-gateway-configuration-revision']).toBe('3');
    const observation = await observed.json();
    let arraySpecification = observation.result.specification;
    if (process.env.NG_IEC61850_NAMED_TYPE_PYTHON) {
      for (const scope of ['vmd', 'domain', 'association']) {
        expect(arraySpecification.kind).toBe('named');
        expect(arraySpecification.name.kind).toBe(scope);
        const attributes = await request.post(
          `${gateway.origin}/api${capabilityPath}/ng:southward:iec61850:mms:named-type`,
          { headers: invokeHeaders, data: arraySpecification.name },
        );
        expect(attributes.status(), await attributes.text()).toBe(200);
        const definition = await attributes.json();
        expect(definition.result.kind).toBe('namedType');
        expect(definition.config_epoch).toBe(observation.config_epoch);
        expect(definition.session_epoch).toBe(observation.session_epoch);
        arraySpecification = definition.result.specification;
      }
    }
    expect(arraySpecification.components[0].specification.elements).toBe(3);
    await writeFile(
      test.info().outputPath('online-contract.json'),
      JSON.stringify({ inventory, observation }, null, 2),
    );
    await dialog.locator('button:has(svg.lucide-x)').click();
    await expect(dialog).not.toBeVisible();
    await observedPublicationJourney({
      gateway,
      request,
      page,
      token,
      locales,
      channelId: Number(receipt.publication.channelId),
      baseRevision: '3',
      nextRevision: '4',
      nestedArrays: false,
    });
  } finally {
    await stopPeer(peer);
  }
});

/** Run the real observed-model operator journey for exact source and index semantics. */
async function observedPublicationJourney({
  gateway,
  request,
  page,
  token,
  locales,
  channelId,
  baseRevision,
  nextRevision,
  nestedArrays,
}: {
  baseRevision: string;
  channelId: number;
  gateway: Gateway;
  locales: typeof import('../src/locales/langs/zh-CN/page.json');
  nestedArrays: boolean;
  nextRevision: string;
  page: Page;
  request: APIRequestContext;
  token: string;
}) {
  const labels = locales.southward.channel.engineering;
  const mapping = labels.mapping;
  const headers = {
    'X-Gateway-Contract': 'boot',
    Authorization: `Bearer ${token}`,
  };
  const online = locales.southward.channel.onlineEngineering;
  const captureContract = await api(
    request,
    gateway,
    token,
    'GET',
    `${root}/channels/${channelId}/contract`,
  );
  await page.getByRole('button', { name: online.title, exact: true }).click();
  const onlineDialog = page.getByRole('dialog');
  await onlineDialog
    .getByRole('combobox', { name: online.domain, exact: true })
    .click();
  const domainSelect = onlineDialog.getByRole('combobox', {
    name: online.domain,
    exact: true,
  });
  await domainSelect.press('ArrowDown');
  await domainSelect.press('Enter');

  const reportItem = onlineDialog.getByRole('combobox', {
    name: online.item,
    exact: true,
  });
  await expect(reportItem).toBeEnabled();
  await reportItem.fill('LLN0$RP$urEvents01');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText('LLN0$RP$urEvents01', { exact: true })
    .click();
  if (process.env.NG_IEC61850_NAMED_TYPE_PYTHON) {
    const typeResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            '/capabilities/ng%3Asouthward%3Aiec61850%3Amms%3Avariable-type',
          ) && response.request().method() === 'POST',
    );
    await onlineDialog
      .getByRole('button', { name: online.type, exact: true })
      .click();
    const actualTypeResponse = await typeResponse;
    expect(actualTypeResponse.status()).toBe(200);
    for (const scope of ['vmd', 'domain', 'association']) {
      const definitionResponse = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(
              '/capabilities/ng%3Asouthward%3Aiec61850%3Amms%3Anamed-type',
            ) && response.request().method() === 'POST',
      );
      await onlineDialog
        .getByRole('button', { name: online.readNamedType, exact: true })
        .click();
      const definition = await definitionResponse;
      expect(definition.status(), await definition.text()).toBe(200);
      expect(definition.request().postDataJSON().kind).toBe(scope);
      await expect(
        onlineDialog.getByRole('textbox', {
          name: online.rawResult,
          exact: true,
        }),
      ).toHaveValue(/namedType/);
    }
    await expect(
      onlineDialog.getByRole('button', {
        name: online.readNamedType,
        exact: true,
      }),
    ).toHaveCount(0);
    await onlineDialog
      .getByRole('textbox', { name: online.rawResult, exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath('named-types.png'),
      fullPage: true,
    });
  }
  await expect(
    onlineDialog.getByRole('button', {
      name: online.reportRead,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    onlineDialog.getByRole('button', { name: online.read, exact: true }),
  ).toBeDisabled();
  const rcbResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(
          '/capabilities/ng%3Asouthward%3Aiec61850%3Amms%3Areport-control-read',
        ) && response.request().method() === 'POST',
  );
  await onlineDialog
    .getByRole('button', { name: online.reportRead, exact: true })
    .click();
  const rcbReply = await rcbResponse;
  expect(rcbReply.status()).toBe(200);
  const rcbObserved = await rcbReply.json();
  expect(rcbObserved.result.kind).toBe('read');
  expect(rcbObserved.result.results).toHaveLength(1);
  expect(rcbObserved.result.results[0].value.values).toContainEqual({
    kind: 'visibleString',
    value: 'ArrayEvents',
  });
  await expect(
    onlineDialog.getByRole('textbox', {
      name: online.rawResult,
      exact: true,
    }),
  ).toHaveValue(/ArrayEvents/);
  await expect(onlineDialog).toContainText(online.reportObservationHint);
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await onlineDialog
    .getByRole('textbox', { name: online.rawResult, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('online-rcb.png'),
    fullPage: true,
  });

  const directorySelect = onlineDialog.getByRole('combobox', {
    name: online.directory,
    exact: true,
  });
  await expect(directorySelect).toBeEnabled();
  await directorySelect.focus();
  await directorySelect.press('ArrowDown');
  await directorySelect.press('Enter');
  const changedDirectoryResult = onlineDialog.getByRole('textbox', {
    name: online.rawResult,
    exact: true,
  });
  await expect(changedDirectoryResult).toHaveValue(/"kind": "directory"/);
  await expect(changedDirectoryResult).not.toHaveValue(/ArrayEvents/);
  await expect(
    onlineDialog.getByRole('button', { name: online.members, exact: true }),
  ).toBeVisible();

  const itemSelect = onlineDialog.getByRole('combobox', {
    name: online.item,
    exact: true,
  });
  await expect(itemSelect).toBeEnabled();
  await itemSelect.focus();
  await itemSelect.press('ArrowDown');
  await itemSelect.press('Enter');
  await onlineDialog
    .getByRole('button', { name: online.members, exact: true })
    .click();
  const actual = onlineDialog.getByRole('region', {
    name: online.result,
    exact: true,
  });
  await expect(actual).toContainText('dataSetMembers');
  const transcript = actual.getByRole('textbox', {
    name: online.rawResult,
    exact: true,
  });
  await expect(transcript).toHaveValue(/alternate_access/);
  await expect(transcript).toHaveValue(/"index": 0/);
  await expect(transcript).toHaveValue(/"index": 1/);
  await expect(onlineDialog).toContainText(online.unknown);
  await transcript.scrollIntoViewIfNeeded();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('online-data-set.png'),
    fullPage: true,
  });
  const captureResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/snapshots') &&
      response.request().method() === 'POST',
  );
  await onlineDialog
    .getByRole('button', { name: online.capture, exact: true })
    .click();
  const capture = await captureResponse;
  expect(capture.status(), await capture.text()).toBe(201);
  const captureBody = await capture.json();
  const captured = captureBody.data;
  expect(captured.source.kind).toBe('mms');
  expect(captured.source.configurationRevision).toBe(baseRevision);
  expect(captured.source.channelId).toBe(Number(channelId));
  expect(captured.source).not.toHaveProperty('profile');
  expect(captured.source).not.toHaveProperty('encoding');
  const archive = await request.get(
    `${gateway.origin}/api${root}/assets/${captured.digest}/original`,
    { headers },
  );
  expect(archive.status()).toBe(200);
  expect(archive.headers()['content-type']).toContain('application/json');
  expect(
    createHash('sha256')
      .update(await archive.body())
      .digest('hex'),
  ).toBe(captured.digest);
  const rawCapture = await archive.json();
  if (captureContract === null) {
    expect(rawCapture.declarations).toEqual({ kind: 'unrecorded' });
    expect(captured.source.declarations).toEqual({ kind: 'unrecorded' });
  } else {
    expect(captureContract.publication.desiredRevision).toBe(baseRevision);
    expect(rawCapture.declarations).toEqual({
      kind: 'published',
      snapshot: captureContract,
    });
    expect(captured.source.declarations).toEqual({
      kind: 'published',
      snapshotDigest: createHash('sha256')
        .update(JSON.stringify(rawCapture.declarations))
        .digest('hex'),
    });
  }
  const namespaceReads = rawCapture.records.filter(
    (record: { operation: { kind: string } }) =>
      record.operation.kind === 'namespaceRead',
  );
  expect(namespaceReads.length).toBeGreaterThan(0);
  const namespaceItems = namespaceReads.flatMap(
    (record: {
      operation: { variables: { domain: string; item: string }[] };
      response: { config_epoch: string; session_epoch: string };
    }) => {
      expect(record.operation.variables.length).toBeLessThanOrEqual(32);
      expect(record.response.config_epoch).toBe(
        captured.source.configurationEpoch,
      );
      expect(record.response.session_epoch).toBe(
        captured.source.associationEpoch,
      );
      return record.operation.variables.map(
        (variable) => `${variable.domain}/${variable.item}`,
      );
    },
  );
  expect(namespaceItems).toEqual([
    'PlantDomain/GGIO1$EX$Ind',
    'PlantDomain/GGIO1$EX$NamPlt',
    'PlantDomain/LLN0$EX$NamPlt',
  ]);
  if (process.env.NG_IEC61850_NAMED_TYPE_PYTHON) {
    const namedDefinitions = rawCapture.records.filter(
      (record: { operation: { kind: string } }) =>
        record.operation.kind === 'namedType',
    );
    expect(namedDefinitions.length).toBeGreaterThan(0);
    expect(
      new Set(
        namedDefinitions.map(
          (record: { operation: { name: { kind: string } } }) =>
            record.operation.name.kind,
        ),
      ),
    ).toEqual(new Set(['association', 'domain', 'vmd']));
  }
  const capturedReads = rawCapture.records.filter(
    (record: { operation: { kind: string } }) =>
      record.operation.kind === 'reportRead',
  );
  expect(
    capturedReads.map(
      (record: { operation: { phase: string } }) => record.operation.phase,
    ),
  ).toEqual(['before', 'after']);
  await writeFile(
    test.info().outputPath('captured-source.json'),
    JSON.stringify(rawCapture, null, 2),
  );
  const capturedDialog = page.getByRole('dialog');
  await expect(
    capturedDialog.locator(`[title="${captured.digest}"]`),
  ).toBeVisible();
  const capturedClaims = capturedDialog
    .getByRole('row')
    .filter({ hasText: labels.captureDeclarations });
  await capturedClaims.scrollIntoViewIfNeeded();
  await expect(capturedClaims).toContainText(
    captureContract === null
      ? labels.captureDeclarationsUnrecorded
      : labels.captureDeclarationsRecorded,
  );
  if (captureContract !== null) {
    await expect(capturedClaims).toContainText(
      captured.source.declarations.snapshotDigest,
    );
  }
  await expect(capturedClaims).toBeInViewport({ ratio: 0.9 });
  await capturedClaims.screenshot({
    path: test.info().outputPath('captured-declaration-provenance.png'),
  });
  await capturedDialog
    .getByRole('button', {
      name: labels.unnamed.replace('{index}', '0'),
      exact: true,
    })
    .click();
  const capturedModel = capturedDialog.getByRole('region', {
    name: labels.model,
    exact: true,
  });
  const comparisonReplay = await comparisonOperatorJourney({
    gateway,
    request,
    page,
    token,
    locales,
    channelId,
    capturedDigest: captured.digest,
    captureRevision: baseRevision,
  });
  await capturedModel
    .getByRole('button', { name: labels.logicalDevices, exact: true })
    .first()
    .click();
  const observedNode = (name: string) =>
    capturedModel.getByRole('table').getByRole('button', { name, exact: true });
  await observedNode('PlantDomain').click();
  await observedNode('GGIO1').click();
  await observedNode('Ind').click();
  await expect(capturedModel.getByRole('table')).toContainText(
    labels.observedType,
  );
  await expect(
    capturedDialog
      .getByRole('region', { name: mapping.title, exact: true })
      .getByRole('button', { name: mapping.refresh, exact: true }),
  ).toBeVisible();
  const capturedEditor = capturedDialog.getByRole('region', {
    name: mapping.title,
    exact: true,
  });
  const capturedTable = capturedModel.getByRole('table');
  const capturedRow = (name: string) =>
    capturedTable
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name, exact: true }) });
  await capturedRow('stVal')
    .getByRole('button', { name: labels.addRead, exact: true })
    .click();
  await capturedRow('q')
    .getByRole('button', { name: labels.setQuality, exact: true })
    .click();
  await capturedRow('t')
    .getByRole('button', { name: labels.setTime, exact: true })
    .click();
  await capturedEditor
    .getByLabel(mapping.pointKey, { exact: true })
    .fill('status');
  await capturedEditor
    .getByLabel(mapping.pointName, { exact: true })
    .fill('status');
  await page.screenshot({
    path: test.info().outputPath('captured-model.png'),
    fullPage: true,
  });
  await capturedModel
    .getByRole('navigation', { name: labels.breadcrumb })
    .getByRole('button', { name: 'GGIO1', exact: true })
    .click();
  await observedNode('Vector').click();
  await observedNode('mag').click();
  await observedNode('1').click();
  if (nestedArrays) await observedNode('1').click();
  await capturedRow('f')
    .getByRole('button', { name: labels.addRead, exact: true })
    .click();
  await capturedEditor
    .getByLabel(mapping.pointKey, { exact: true })
    .fill('array-1');
  await capturedEditor
    .getByLabel(mapping.pointName, { exact: true })
    .fill('array');
  await capturedEditor
    .getByRole('combobox', { name: mapping.category, exact: true })
    .press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(mapping.attribute, { exact: true })
    .click();
  await capturedModel
    .getByRole('button', { name: labels.logicalDevices, exact: true })
    .first()
    .click();
  await observedNode('PlantDomain').click();
  await observedNode('LLN0').click();
  await capturedModel
    .getByRole('button', { name: labels.dataSets, exact: true })
    .click();
  await expect(capturedModel.getByRole('table')).toContainText(
    'MMS deletable: false',
  );
  await observedNode('Events').click();
  const nativeMembers = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/assets/${captured.digest}/browse`,
    {
      location: {
        kind: 'dataSetMembers',
        server: 0,
        domain: 'PlantDomain',
        logicalNode: 'LLN0',
        dataSet: 'Events',
      },
      offset: 0,
      limit: 16,
    },
  );
  expect(nativeMembers.total).toBe(6);
  expect(nativeMembers.nodes[1].declaration.variable).toEqual(
    nativeMembers.nodes[2].declaration.variable,
  );
  expect(
    nativeMembers.nodes[3].declaration.variable.alternate_access.entries[0]
      .selection,
  ).toEqual({ kind: 'index', index: 0 });
  expect(
    nativeMembers.nodes[4].declaration.variable.alternate_access.entries[0]
      .nested.entries[0].selection,
  ).toEqual(
    nestedArrays
      ? { kind: 'index', index: 1 }
      : { kind: 'component', name: 'f' },
  );
  if (nestedArrays) {
    expect(
      nativeMembers.nodes[4].declaration.variable.alternate_access.entries[0]
        .nested.entries[0].nested.entries[0].selection,
    ).toEqual({ kind: 'component', name: 'f' });
  }
  await expect(capturedModel.getByRole('table')).toContainText(
    nestedArrays
      ? 'PlantDomain/GGIO1$MX$Vector$mag(0)(0)$f'
      : 'PlantDomain/GGIO1$MX$Vector$mag(0)$f',
  );
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('captured-data-set.png'),
    fullPage: true,
  });
  await capturedModel
    .getByRole('navigation', { name: labels.breadcrumb })
    .getByRole('button', { name: 'LLN0', exact: true })
    .click();
  await capturedModel
    .getByRole('button', { name: labels.reports, exact: true })
    .click();
  await expect(capturedTable).toContainText(mapping.sourceObserved);
  await expect(capturedTable).toContainText('RptID=ArrayEvents');
  await capturedTable
    .getByRole('row')
    .filter({
      has: page.getByRole('button', { name: 'urEvents01', exact: true }),
    })
    .getByRole('button', { name: labels.addReport, exact: true })
    .click();
  await expect(capturedEditor).toContainText(mapping.observedReportHint);
  await expect(capturedEditor).toContainText('PlantDomain/LLN0$Events');
  await capturedEditor
    .getByLabel(mapping.reportId, { exact: true })
    .fill('ArrayEvents');
  await capturedEditor
    .getByRole('combobox', { name: mapping.reservation, exact: true })
    .press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(`URCB: ${mapping.unreserved}`, { exact: true })
    .click();
  await observedNode('urEvents01').click();
  await capturedEditor
    .getByRole('combobox', { name: mapping.activePoint, exact: true })
    .press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('status · status', { exact: true })
    .click();
  const capturedMember = (index: number) =>
    capturedTable.getByRole('row').nth(index + 1);
  await capturedMember(2)
    .getByRole('button', { name: labels.bindValue, exact: true })
    .click();
  await capturedMember(0)
    .getByRole('button', { name: labels.bindQuality, exact: true })
    .click();
  await capturedMember(5)
    .getByRole('button', { name: labels.bindTime, exact: true })
    .click();
  await capturedEditor
    .getByRole('combobox', { name: mapping.activePoint, exact: true })
    .press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('array-1 · array', { exact: true })
    .click();
  await capturedMember(4)
    .getByRole('button', { name: labels.bindValue, exact: true })
    .click();
  await capturedEditor
    .getByText(mapping.observedReportHint, { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('captured-rcb-binding.png'),
    fullPage: true,
  });
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/publication-preview') &&
      response.request().method() === 'POST',
  );
  await capturedEditor
    .getByRole('button', { name: mapping.preview, exact: true })
    .click();
  const previewReply = await previewResponse;
  expect(previewReply.status(), await previewReply.text()).toBe(200);
  const capturedPreviewBody = await previewReply.json();
  const capturedPreview = capturedPreviewBody.data;
  expect(capturedPreview.mapping.acquisition.accessPoint).toBeNull();
  expect(capturedPreview.mapping.devices[0].declaredInstance).toBeNull();
  expect(capturedPreview.mapping.acquisition.reports[0].confRev).toBe(7);
  expect(capturedPreview.mapping.acquisition.reports[0].members).toHaveLength(
    6,
  );
  expect(
    capturedPreview.mapping.points[1].driverConfig.configuration.valuePath,
  ).toEqual(nestedArrays ? ['mag', 1, 1, 'f'] : ['mag', 1, 'f']);
  const publicationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/publish') &&
      response.request().method() === 'POST',
  );
  await capturedEditor
    .getByRole('button', { name: mapping.publish, exact: true })
    .click();
  const capturedPublication = await publicationResponse;
  expect(capturedPublication.status(), await capturedPublication.text()).toBe(
    202,
  );
  const capturedPublicationBody = await capturedPublication.json();
  const capturedReceipt = capturedPublicationBody.data;
  expect(capturedReceipt.configuration.desiredRevision).toBe(nextRevision);
  expect(capturedReceipt.configuration.appliedRevision).toBe(nextRevision);
  expect(capturedReceipt.configuration.state).toBe('active');
  const committedContract = await api(
    request,
    gateway,
    token,
    'GET',
    `${root}/channels/${channelId}/contract`,
  );
  expect(committedContract.contract).toEqual(capturedReceipt.contract);
  const documentaryCaptureResponse = await request.post(
    `${gateway.origin}/api${root}/snapshots`,
    {
      headers,
      data: {
        channelId: Number(channelId),
        configurationRevision: nextRevision,
        domains: ['PlantDomain'],
      },
    },
  );
  expect(
    documentaryCaptureResponse.status(),
    await documentaryCaptureResponse.text(),
  ).toBe(201);
  const documentaryCaptureBody = await documentaryCaptureResponse.json();
  const documentaryCapture = documentaryCaptureBody.data;
  expect(documentaryCapture.source.configurationRevision).toBe(nextRevision);
  expect(documentaryCapture.source.declarations.kind).toBe('published');
  const documentaryOriginal = await request.get(
    `${gateway.origin}/api${root}/assets/${documentaryCapture.digest}/original`,
    { headers },
  );
  expect(documentaryOriginal.status(), await documentaryOriginal.text()).toBe(
    200,
  );
  const documentaryArchive = await documentaryOriginal.json();
  expect(documentaryArchive.declarations.kind).toBe('published');
  expect(documentaryArchive.declarations.snapshot.publication).toEqual(
    committedContract.publication,
  );
  expect(documentaryArchive.declarations.snapshot.contract).toEqual(
    committedContract.contract,
  );
  expect(
    createHash('sha256')
      .update(JSON.stringify(documentaryArchive.declarations))
      .digest('hex'),
  ).toBe(documentaryCapture.source.declarations.snapshotDigest);
  await writeFile(
    test.info().outputPath('captured-same-revision-declarations.json'),
    JSON.stringify(
      { metadata: documentaryCapture, archive: documentaryArchive },
      null,
      2,
    ),
  );
  await gateway.restart();
  const restartedContract = await api(
    request,
    gateway,
    token,
    'GET',
    `${root}/channels/${channelId}/contract`,
  );
  expect(restartedContract).toEqual(committedContract);
  const documentaryReplayed = await request.get(
    `${gateway.origin}/api${root}/assets/${documentaryCapture.digest}/original`,
    { headers },
  );
  expect(documentaryReplayed.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await documentaryReplayed.body())
      .digest('hex'),
  ).toBe(documentaryCapture.digest);
  const documentaryReplayedArchive = await documentaryReplayed.json();
  expect(documentaryReplayedArchive.declarations).toEqual(
    documentaryArchive.declarations,
  );
  const historicalOriginal = await request.get(
    `${gateway.origin}/api${root}/assets/${captured.digest}/original`,
    { headers },
  );
  expect(historicalOriginal.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await historicalOriginal.body())
      .digest('hex'),
  ).toBe(captured.digest);
  const historicalArchive = await historicalOriginal.json();
  expect(historicalArchive.declarations).toEqual(rawCapture.declarations);
  for (const document of restartedContract.contract.documents) {
    const original = await request.get(
      `${gateway.origin}/api${root}/assets/${document.digest}/original`,
      { headers },
    );
    expect(original.status(), await original.text()).toBe(200);
    expect(
      createHash('sha256')
        .update(await original.body())
        .digest('hex'),
    ).toBe(document.digest);
    expect(original.headers()['content-type']).toContain(
      'application/octet-stream',
    );
    expect(original.headers()['x-content-type-options']).toBe('nosniff');
  }
  const replayed = await api(
    request,
    gateway,
    token,
    'GET',
    `${root}/assets/${captured.digest}/preview?offset=0&limit=1`,
  );
  expect(replayed.asset.source).toEqual(captured.source);
  expect(replayed.servers[0].iedName).toBeNull();
  expect(replayed.servers[0].accessPointCount).toBe(0);
  const restartedOriginal = await request.get(
    `${gateway.origin}/api${root}/assets/${captured.digest}/original`,
    { headers },
  );
  expect(restartedOriginal.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await restartedOriginal.body())
      .digest('hex'),
  ).toBe(captured.digest);
  const restartedChannel = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channelId}`,
  );
  expect(restartedChannel.engineeringPublication.sourceDigest).toBe(
    captured.digest,
  );
  const replayedComparison = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/comparisons`,
    comparisonReplay.payload,
  );
  expect(replayedComparison).toEqual(comparisonReplay.result);
  await writeFile(
    test.info().outputPath('comparison-after-restart.json'),
    JSON.stringify(replayedComparison, null, 2),
  );
  expect(restartedChannel.collectionType).toBe(0);
  expect(restartedChannel.driverConfig).not.toHaveProperty('mode');
  expect(restartedChannel.driverConfig.reportSources[0].reportId).toBe(
    'ArrayEvents',
  );
  expect(restartedChannel.driverConfig.reportSources[0].confRev).toBe(7);
  await expect
    .poll(async () => {
      const state = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/detail/${channelId}`,
      );
      return state.configuration.state;
    })
    .toBe('active');
  const liveDevices = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/${channelId}/sub-devices`,
  );
  expect(liveDevices).toHaveLength(1);
  const realtime = locales.monitor.realtime;
  await page.goto(`${gateway.origin}/#/maintenance/monitor`);
  await page.getByRole('combobox').nth(0).click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(restartedChannel.name, { exact: true })
    .click();
  await page.getByRole('combobox').nth(1).click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(liveDevices[0].deviceName, { exact: true })
    .click();
  const liveRow = (key: string) =>
    page.locator('tr').filter({ has: page.getByText(key, { exact: true }) });
  for (const key of ['status', 'array-1']) {
    await expect(
      liveRow(key).getByText(realtime.freshness.current, { exact: true }),
    ).toBeVisible();
  }
  await expect(
    liveRow('status').getByText(realtime.quality.good, { exact: true }),
  ).toBeVisible();
  await expect(liveRow('status').getByRole('cell').nth(2)).toHaveText(
    /^(true|false)$/,
  );
  await expect(liveRow('status').getByRole('cell').nth(5)).toHaveText(
    /\d{4}-\d{2}-\d{2}/,
  );
  await expect(
    liveRow('array-1').getByText(realtime.quality.unknown, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('captured-report-restart-monitor.png'),
    fullPage: true,
  });
  if (!nestedArrays) {
    await gooseSourceOperatorJourney({
      gateway,
      request,
      page,
      token,
      locales,
      channelId,
      capturedDigest: captured.digest,
    });
  }
}

/** Actual independent MMS evidence drives preflight without activating an Ethernet source. */
async function gooseSourceOperatorJourney({
  gateway,
  request,
  page,
  token,
  locales,
  channelId,
  capturedDigest,
}: {
  capturedDigest: string;
  channelId: number;
  gateway: Gateway;
  locales: typeof import('../src/locales/langs/zh-CN/page.json');
  page: Page;
  request: APIRequestContext;
  token: string;
}) {
  const labels = locales.southward.channel.engineering;
  const goose = labels.goose;
  const original = await readFile(fixturePath, 'utf8');
  const selected =
    '<FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(1).f" fc="MX" ix="1"/>';
  const source = Buffer.from(
    original
      .replace(
        '<LNodeType id="ZeroType" lnClass="LLN0">',
        '<LNodeType id="ZeroType" lnClass="LLN0"><DO name="NamPlt" type="ObservedNamespacePlate"/>',
      )
      .replace(
        '<DOType id="ModeType"',
        '<DOType id="ObservedNamespacePlate" cdc="LPL"><DA name="vendor" fc="DC" bType="VisString255"/></DOType><DOType id="ModeType"',
      )
      .replace(
        selected,
        `${selected.replace('mag(1).f', 'mag(0).f').replace('ix="1"', 'ix="0"')}\n              ${selected}`,
      )
      .replace(
        '<DOType id="SpsType" cdc="SPS">',
        '<DOType id="SpsType" cdc="SPS"><SDO name="sub" type="NamespaceChild" count="2"/>',
      )
      .replace(
        '<DOI name="Ind">',
        '<DOI name="Ind"><SDI name="sub" ix="0"><DAI name="dataNs"><Val>Element:2020A</Val></DAI></SDI>',
      )
      .replace(
        '<DAType',
        '<DOType id="NamespaceChild" cdc="SPS"><DA name="dataNs" fc="EX" bType="VisString255" valKind="Conf"><Val sGroup="1">DefaultOne:2020A</Val><Val sGroup="2">DefaultTwo:2020A</Val></DA></DOType><DAType',
      ),
  );
  const digest = await upload(request, gateway, token, source);
  const payload = {
    namespaces: {
      rules: 'iec71Edition2',
      presenceRules: 'tr9010Edition1',
      data: [],
      services: [],
    },
    declaration: { digest, server: 0 },
    observation: { digest: capturedDigest, server: 0 },
    domain: 'PlantDomain',
    control: 'events',
    accessPoint: 'Main',
    subnetwork: 'Station',
  };
  const endpoint = `${gateway.origin}/api${root}/goose/source-plans`;
  const headers = {
    'X-Gateway-Contract': 'boot',
    Authorization: `Bearer ${token}`,
  };
  const anonymous = await request.post(endpoint, {
    headers: { 'X-Gateway-Contract': 'boot' },
    data: payload,
  });
  expect(anonymous.status()).toBe(401);
  const oversized = await request.post(endpoint, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: Buffer.alloc(32 * 1024 + 1, 32),
  });
  expect(oversized.status()).toBe(413);
  const unrecognized = await request.post(endpoint, {
    headers,
    data: { ...payload, activation: true },
  });
  expect(unrecognized.status()).toBe(400);
  for (const data of [
    {
      ...payload,
      declaration: payload.observation,
      observation: payload.declaration,
    },
    { ...payload, observation: { ...payload.observation, server: 1 } },
    { ...payload, accessPoint: 'Monitor' },
    { ...payload, subnetwork: 'Unknown' },
  ]) {
    const rejected = await request.post(endpoint, { headers, data });
    expect(rejected.status(), await rejected.text()).toBe(422);
  }
  const before = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channelId}`,
  );
  const compiled = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/goose/source-plans`,
    payload,
  );
  expect(compiled.selection).toEqual(payload);
  expect(compiled.network).toEqual({
    destination: [1, 12, 205, 1, 0, 1],
    appId: 1,
    vlanId: 0,
    vlanPriority: 4,
  });
  expect(compiled.observation.source.kind).toBe('mms');
  expect(compiled.observation.digest).toBe(capturedDigest);
  const capturedOriginal = await request.get(
    `${gateway.origin}/api${root}/assets/${capturedDigest}/original`,
    { headers },
  );
  expect(capturedOriginal.status()).toBe(200);
  const capturedArchive = await capturedOriginal.json();
  expect(compiled.capturedDeclarations).toEqual(capturedArchive.declarations);
  expect(compiled.capturedDeclarations.kind).toBe('published');
  expect(compiled.capturedDomainApplicability).toBe('declared');
  expect(
    compiled.capturedDeclarations.snapshot.publication.desiredRevision,
  ).toBe(compiled.observation.source.configurationRevision);
  expect(
    compiled.capturedDeclarations.snapshot.publication.desiredRevision,
  ).not.toBe(before.configuration.desiredRevision);
  expect(compiled.members).toHaveLength(6);
  for (const member of compiled.members) {
    expect(member.typeRelationship.status).toBe('agreement');
    expect(member.typeRelationship.checked).toBeGreaterThan(0);
    expect(member.typeRelationship.unknown).toBe(0);
  }
  expect(
    compiled.members.map(
      (member: { memberIndex: number }) => member.memberIndex,
    ),
  ).toEqual([0, 1, 2, 3, 4, 5]);
  expect(compiled.members[1].variable).toEqual(compiled.members[2].variable);
  expect(
    compiled.members[3].variable.alternate_access.entries[0].selection,
  ).toEqual({ kind: 'index', index: 0 });
  expect(
    compiled.members[4].variable.alternate_access.entries[0].selection,
  ).toEqual({ kind: 'index', index: 1 });
  expect(compiled.members[3].valueType.specification.name).toBe(
    'floatingPoint',
  );
  expect(
    compiled.members[5].valueType.components.map(
      (part: { name: string }) => part.name,
    ),
  ).toEqual(['stVal', 'q', 't']);
  expect(compiled.minimumTimeMs).toBe('4.125');
  expect(compiled.unresolvedRequirements).toEqual([
    'profileAndEdition',
    'namespaceAndServices',
    'simulationDomain',
    'nativeIdentityAndClock',
    'securityPolicy',
    'runtimePublication',
  ]);
  const after = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channelId}`,
  );
  expect(after.configuration.desiredRevision).toBe(
    before.configuration.desiredRevision,
  );
  expect(after.configuration.appliedRevision).toBe(
    before.configuration.appliedRevision,
  );
  await writeFile(
    test.info().outputPath('goose-source-plan.json'),
    JSON.stringify(compiled, null, 2),
  );
  await page.goto(`${gateway.origin}/#/southward/channel`);
  await page.getByRole('button', { name: labels.title, exact: true }).click();
  const engineering = page.getByRole('dialog', {
    name: labels.title,
    exact: true,
  });
  await engineering
    .getByRole('textbox', { name: labels.digestInput, exact: true })
    .fill(digest);
  await engineering
    .getByRole('button', { name: labels.open, exact: true })
    .click();
  await engineering.getByRole('button', { name: 'IED1', exact: true }).click();
  await engineering
    .getByRole('button', { name: goose.title, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: goose.title, exact: true });
  await dialog.getByLabel(goose.observation, { exact: true }).fill(digest);
  await dialog.getByRole('button', { name: goose.load, exact: true }).click();
  await expect(
    dialog.getByText(goose.wrongRole, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: goose.compile, exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel(goose.observation, { exact: true })
    .fill(capturedDigest);
  await dialog.getByRole('button', { name: goose.load, exact: true }).click();
  const server = dialog.getByRole('combobox', {
    name: goose.server,
    exact: true,
  });
  await expect(server).toBeEnabled();
  await server.press('ArrowDown');
  await server.press('Enter');
  for (const [label, value] of [
    [goose.domain, 'PlantDomain'],
    [goose.control, 'events'],
    [goose.accessPoint, 'Main'],
    [goose.subnetwork, 'Station'],
  ] as const) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  const response = page.waitForResponse(
    (actual) =>
      actual.url().endsWith('/goose/source-plans') &&
      actual.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: goose.compile, exact: true })
    .click();
  const reply = await response;
  expect(reply.status(), await reply.text()).toBe(200);
  const result = dialog.getByRole('region', {
    name: goose.result,
    exact: true,
  });
  await expect(result.getByTestId('goose-network-destination')).toHaveText(
    '01-0C-CD-01-00-01',
  );
  await expect(result.getByTestId('goose-network-appid')).toHaveText('0x0001');
  await expect(result.getByTestId('goose-network-vlan')).toHaveText('0 / 4');
  const networkRow = result
    .getByTestId('goose-network-destination')
    .locator('xpath=ancestor::table[1]');
  await networkRow.scrollIntoViewIfNeeded();
  await expect(networkRow).toBeInViewport({ ratio: 0.9 });
  await networkRow.screenshot({
    path: test.info().outputPath('goose-compiled-network.png'),
  });
  const historicalContract = result.getByRole('region', {
    name: goose.capturedContract,
    exact: true,
  });
  await expect(historicalContract).toContainText(goose.capturedDomain.declared);
  const historicalRevision = historicalContract.getByText(
    goose.capturedRevision.replace(
      '{revision}',
      compiled.observation.source.configurationRevision,
    ),
    { exact: true },
  );
  await expect(historicalRevision).toBeVisible();
  await expect(historicalContract).toContainText('IEC 61850-7-2:2010+A1:2020');
  await historicalRevision.scrollIntoViewIfNeeded();
  await expect(historicalRevision).toBeInViewport({ ratio: 0.9 });
  await historicalRevision.screenshot({
    path: test.info().outputPath('goose-capture-time-contract.png'),
  });
  const capturedAcsiPart = historicalContract
    .getByRole('row')
    .filter({ hasText: 'IEC 61850-7-2:2010+A1:2020' });
  await capturedAcsiPart.scrollIntoViewIfNeeded();
  await expect(capturedAcsiPart).toBeInViewport({ ratio: 0.9 });
  await capturedAcsiPart.screenshot({
    path: test.info().outputPath('goose-capture-time-acsi-declaration.png'),
  });
  const members = result.getByTestId('goose-source-members').getByRole('table');
  await expect(members).toBeVisible();
  await expect(members.getByRole('row')).toHaveCount(7);
  await expect(result.getByText(goose.agreement, { exact: true })).toHaveCount(
    6,
  );
  await expect(
    result.getByText('PlantDomain/GGIO1$ST$Ind$stVal', { exact: true }),
  ).toHaveCount(2);
  await expect(
    result.getByText(goose.requirements.runtimePublication, { exact: true }),
  ).toBeVisible();
  await members
    .getByRole('row')
    .last()
    .locator('.ant-table-row-expand-icon')
    .click();
  await expect(result.getByTestId('goose-member-type')).toContainText(
    'utcTime',
  );
  await members.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('goose-source-plan.png'),
    fullPage: true,
  });
  const originals = {
    data: '<NS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="Core" version="2007" revision="B" release="6" namespaceType="private"><Copyright><Notice>Synthetic namespace preflight journey</Notice><License uri="https://example.invalid/license" kind="Private"/></Copyright><BasicTypes><BasicType name="AbstractAddress"/></BasicTypes><PresenceConditions><PresenceCondition name="M"/></PresenceConditions></NS>',
    service:
      '<ServiceNS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="Mapping" version="2003" revision="A" release="4"><ServiceTypeRealizations><ServiceTypeRealization titleID="AddressTitle" name="Address" realize="AbstractAddress"><SubDataAttribute name="Addr" type="Octet6"/></ServiceTypeRealization></ServiceTypeRealizations></ServiceNS>',
    applicability:
      '<ApplicableServiceNS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" version="2" date="2025-04-28T12:00:00Z"><ServiceNsUsage id="Mapping" version="2003"><AppliesTo id="Core" version="2007" revision="B" release="6"/></ServiceNsUsage></ApplicableServiceNS>',
  };
  const namespaceDigests = { data: '', service: '', applicability: '' };
  for (const role of ['data', 'service', 'applicability'] as const) {
    const imported = await request.post(
      `${gateway.origin}/api${root}/nsd?role=${role}`,
      {
        headers,
        multipart: {
          file: {
            name: `${role}.xml`,
            mimeType: 'application/xml',
            buffer: Buffer.from(originals[role]),
          },
        },
      },
    );
    expect(imported.status(), await imported.text()).toBe(201);
    const importedBody = await imported.json();
    namespaceDigests[role] = importedBody.data.digest;
  }
  const indexed = (text: string) => text.replace('{index}', '1');
  await dialog
    .getByRole('button', { name: goose.addNamespaceData, exact: true })
    .click();
  await expect(members).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: goose.compile, exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel(indexed(goose.namespaceData), { exact: true })
    .fill(namespaceDigests.data);
  await dialog
    .getByRole('button', { name: goose.addNamespaceService, exact: true })
    .click();
  await dialog
    .getByLabel(indexed(goose.namespaceService), { exact: true })
    .fill(namespaceDigests.service);
  await dialog
    .getByLabel(indexed(goose.namespaceApplicability), { exact: true })
    .fill(namespaceDigests.applicability);
  const target = dialog.getByRole('combobox', {
    name: goose.namespaceTarget,
    exact: true,
  });
  await target.press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .locator('.ant-select-item-option-content')
    .filter({ hasText: new RegExp(`^${namespaceDigests.data}$`) })
    .click();
  const primitives = dialog.getByRole('combobox', {
    name: goose.namespacePrimitives,
    exact: true,
  });
  await primitives.press('ArrowDown');
  await page
    .locator('.ant-select-dropdown:visible')
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^Octet6$/ })
    .click();
  await dialog.getByText(goose.namespaceBasis, { exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: goose.compile, exact: true }),
  ).toBeEnabled();
  const namespaceReply = page.waitForResponse(
    (actual) =>
      actual.url().endsWith('/goose/source-plans') &&
      actual.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: goose.compile, exact: true })
    .click();
  const namespaceResponse = await namespaceReply;
  expect(namespaceResponse.status(), await namespaceResponse.text()).toBe(200);
  const namespaceBody = await namespaceResponse.json();
  const namespacePlan = namespaceBody.data;
  expect(namespacePlan.selection.namespaces).toEqual({
    rules: 'iec71Edition2',
    presenceRules: 'tr9010Edition1',
    data: [namespaceDigests.data],
    services: [
      {
        service: namespaceDigests.service,
        applicability: namespaceDigests.applicability,
        data: namespaceDigests.data,
        primitives: ['octet6'],
      },
    ],
  });
  expect(namespacePlan.namespaces.originals).toHaveLength(3);
  expect(namespacePlan.namespaces.runtimeQualified).toBe(false);
  expect(namespacePlan.namespaces.profileApplicability).toEqual({
    status: 'declaredForRules',
    edition: { major: 2, amendment: 0 },
  });
  expect(namespacePlan.namespaces.logicalNodes).toHaveLength(2);

  const actualType = {
    status: 'present',
    definition: {
      kind: 'value',
      dataType: {
        origin: 'observed',
        name: 'visibleString',
        widthBits: null,
        maxLength: null,
        wireLength: -255,
        exponentWidthBits: null,
        binaryTimeDate: null,
      },
    },
    dimensions: [],
    structurePacked: null,
  };
  const actualNamespace = (
    value: string,
    comparison: 'conflict' | 'unknown' = 'unknown',
  ) => ({
    effectiveNamespace: {
      status: 'unknown',
      reason: { kind: 'binding', reason: 'missingOriginal' },
    },
    namespaceReference: { status: 'unknown', reason: 'missingOriginal' },
    declarationComparison:
      comparison === 'conflict'
        ? { status: 'conflict' }
        : { status: 'unknown', reason: 'declarationAbsent' },
    typeEvidence: actualType,
    readEvidence: { status: 'success' },
    selection: 'concrete',
    value: { kind: 'visibleString', value },
  });
  const absentNamespace = {
    effectiveNamespace: {
      status: 'unknown',
      reason: { kind: 'cdcDefinitionUnestablished' },
    },
    namespaceReference: { status: 'unknown', reason: 'attributeAbsent' },
    declarationComparison: { status: 'unknown', reason: 'actualValueUnproven' },
    typeEvidence: { status: 'attributeAbsent' },
    readEvidence: { status: 'success' },
    selection: 'concrete',
    value: null,
  };

  for (const node of namespacePlan.namespaces.logicalNodes) {
    expect(node.objectCount).toBe(node.objects.length);
    for (const object of node.objects) {
      expect(object.logicalDevice).toEqual({
        status: 'unknown',
        reason: 'missingBase',
        value: null,
      });
      expect(object.data.status).toBe('unknown');
      expect(object.unresolved).toBe(true);
      expect(object.scopes.length).toBeGreaterThan(0);
      expect(object.observations.logicalDevice).toEqual(
        actualNamespace('ActualLD:2007B'),
      );
      expect(object.observations.logicalNode).toEqual(
        node.logicalNode === 'GGIO1'
          ? actualNamespace('ActualLN:2007B')
          : {
              ...absentNamespace,
              effectiveNamespace: {
                status: 'unknown',
                reason: { kind: 'parentUnestablished' },
              },
            },
      );
      expect(object.scopes[0].position.kind).toBe('template');
      if (object.name === 'Ind') {
        expect(object.observations.data).toEqual(
          actualNamespace('ActualData:2007B'),
        );
        expect(object.observations.cdc).toEqual(
          actualNamespace('ActualCDC:2007B'),
        );
        expect(object.scopes).toHaveLength(3);
        expect(
          object.scopes[1].path.map((part: { name: string }) => part.name),
        ).toEqual(['Ind', 'sub']);
        expect(object.scopes[1].path[1].dimensions[0].count).toBe(2);
        expect(object.scopes[1].position).toEqual({
          kind: 'template',
          remainingInstances: '1',
        });
        expect(object.scopes[2].position).toEqual({
          kind: 'instance',
          indices: [[], [0]],
          boundsKnown: true,
        });
        expect(object.scopes[2].data.value).toEqual({
          lexical: 'Element:2020A',
          origin: 'instance',
          level: 'data',
        });
        expect(object.scopes[2].data.reason).toBe('missingOriginal');
        expect(object.scopes[1].observations.data).toEqual({
          effectiveNamespace: {
            status: 'unknown',
            reason: { kind: 'binding', reason: 'selectionRequired' },
          },
          namespaceReference: {
            status: 'unknown',
            reason: 'selectionRequired',
          },
          declarationComparison: {
            status: 'unknown',
            reason: 'actualValueUnproven',
          },
          typeEvidence: actualType,
          readEvidence: { status: 'success' },
          selection: 'required',
          value: null,
        });
        expect(object.scopes[2].observations.data).toEqual(
          actualNamespace('ActualElementZero:2020A', 'conflict'),
        );
        expect(object.scopes[2].observations.cdc).toEqual(absentNamespace);
        expect(object.scopes[1].observations.cdc).toEqual({
          ...absentNamespace,
          effectiveNamespace: {
            status: 'unknown',
            reason: { kind: 'binding', reason: 'attributeAbsent' },
          },
          selection: 'required',
        });
      }
    }
  }
  await expect(
    result.getByText(goose.namespaceUnresolved, { exact: true }),
  ).toHaveCount(1);
  await expect(
    result
      .getByTestId('goose-namespace-logical-nodes')
      .getByText(goose.namespaceConflict, { exact: true }),
  ).toHaveCount(1);
  await result
    .getByRole('button', {
      name: `right ${goose.namespaceOriginals}`,
      exact: true,
    })
    .click();
  await expect(
    result.locator(`[title="${namespaceDigests.service}"]`),
  ).toBeVisible();
  expect(namespacePlan.namespaces.actualTypes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        logicalNode: 'LLN0',
        object: 'NamPlt',
        functionalConstraint: 'EX',
      }),
    ]),
  );
  const fullTypes = result.getByTestId('goose-complete-source-types');
  await expect(fullTypes).toBeVisible();
  await expect(fullTypes).toContainText('LLN0$EX$NamPlt');
  await fullTypes.scrollIntoViewIfNeeded();
  await fullTypes.screenshot({
    path: test.info().outputPath('goose-full-source-fcd-relationships.png'),
  });
  await writeFile(
    test.info().outputPath('goose-namespace-source-plan.json'),
    JSON.stringify(namespacePlan, null, 2),
  );
  const namespaceTable = result.getByTestId('goose-namespace-logical-nodes');
  await namespaceTable
    .getByRole('button', { name: /^right PlantDomain\/GGIO1/ })
    .click();
  const objectEvidence = result.getByTestId('namespace-object-evidence');
  await expect(objectEvidence).toHaveCount(2);
  await expect(objectEvidence.first()).toContainText('PlantDomain/GGIO1/Ind');
  await expect(objectEvidence.first()).toContainText(
    goose.namespaceReasons.missingBase,
  );
  await objectEvidence
    .first()
    .getByRole('button', { name: new RegExp(goose.namespaceScopes) })
    .click();
  const scopeCards = objectEvidence
    .first()
    .getByTestId('namespace-scope-cards');
  await expect(
    scopeCards.getByRole('button', { name: /^right Ind\.sub\[2\]/ }),
  ).toBeVisible();
  await scopeCards
    .getByRole('button', { name: /^right Ind\.sub\(0\)/ })
    .click();
  const scopeEvidence = objectEvidence
    .first()
    .getByTestId('namespace-scope-evidence')
    .filter({ hasText: 'Element:2020A' });
  await expect(scopeEvidence).toContainText('Element:2020A');
  await expect(scopeEvidence).toContainText('ActualElementZero:2020A');
  const scopePresence = scopeEvidence.getByTestId('namespace-scope-presence');
  await expect(scopePresence).toContainText(goose.presenceStates.unknown);
  await scopePresence.scrollIntoViewIfNeeded();
  await expect(scopePresence).toBeInViewport({ ratio: 0.9 });
  await scopePresence.screenshot({
    path: test.info().outputPath('goose-concrete-scope-presence-unknown.png'),
  });

  await expect(scopeEvidence).toContainText(goose.namespaceRead);
  await scopeEvidence
    .getByTestId('namespace-level-data')
    .getByRole('button', {
      name: `right ${goose.namespaceEvidenceDetails}`,
      exact: true,
    })
    .click();
  await expect(scopeEvidence).toContainText(
    goose.namespaceReasons.missingOriginal,
  );
  await scopeCards
    .getByRole('button', { name: /^right Ind\.sub\[2\]/ })
    .click();
  await objectEvidence
    .first()
    .getByTestId('namespace-scope-evidence')
    .first()
    .getByTestId('namespace-level-data')
    .getByRole('button', {
      name: `right ${goose.namespaceEvidenceDetails}`,
      exact: true,
    })
    .click();
  await expect(objectEvidence.first()).toContainText(
    goose.namespaceSelections.required,
  );
  const concreteData = scopeEvidence.getByTestId('namespace-level-data');
  await concreteData.scrollIntoViewIfNeeded();
  await expect(concreteData).toBeInViewport({ ratio: 0.9 });
  await expect(concreteData).toContainText('Element:2020A');
  await expect(concreteData).toContainText('ActualElementZero:2020A');
  await expect(concreteData).toContainText(goose.namespaceReadStates.success);
  await expect(concreteData).toContainText(goose.namespaceTypeStates.present);
  await concreteData.screenshot({
    path: test.info().outputPath('goose-namespace-concrete-data.png'),
  });
  const templateEvidence = objectEvidence
    .first()
    .getByTestId('namespace-scope-evidence')
    .first();
  const templateCdc = templateEvidence.getByTestId('namespace-level-cdc');
  await templateCdc.scrollIntoViewIfNeeded();
  await expect(templateCdc).toBeInViewport({ ratio: 0.9 });
  await expect(templateCdc).toContainText(
    goose.namespaceTypeStates.attributeAbsent,
  );
  await expect(templateCdc).toContainText(goose.namespaceReadStates.success);
  await expect(templateCdc).toContainText(goose.namespaceSelections.required);
  await templateCdc.screenshot({
    path: test.info().outputPath('goose-namespace-template-cdc.png'),
  });
  await writeFile(
    test.info().outputPath('goose-namespace-visible-facts-layout.json'),
    JSON.stringify(
      {
        concreteData: await concreteData.boundingBox(),
        templateCdc: await templateCdc.boundingBox(),
      },
      null,
      2,
    ),
  );
  await concreteData.scrollIntoViewIfNeeded();
  await expect(concreteData).toBeInViewport({ ratio: 0.9 });
  await page.screenshot({
    path: test.info().outputPath('goose-namespace-object-scopes.png'),
    fullPage: true,
  });
  await objectEvidence
    .first()
    .getByRole('button', { name: new RegExp(goose.namespaceScopes) })
    .click();
  await namespaceTable
    .getByRole('button', { name: /^right PlantDomain\/GGIO1/ })
    .click();
  await result.getByText(goose.namespaceResult, { exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await result
    .getByText(goose.namespaceUnresolved, { exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('goose-namespace-source-plan.png'),
    fullPage: true,
  });
  const actualPinBytes = Buffer.from(
    '<NS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="ActualElementZero" version="2020" revision="A" release="1" namespaceType="private"><Copyright><Notice>Synthetic exact observed namespace pin</Notice><License uri="https://example.invalid/license" kind="Private"/></Copyright></NS>',
  );
  const actualPinResponse = await request.post(
    `${gateway.origin}/api${root}/nsd?role=data`,
    {
      headers,
      multipart: {
        file: {
          name: 'actual-element-zero.xml',
          mimeType: 'application/xml',
          buffer: actualPinBytes,
        },
      },
    },
  );
  expect(actualPinResponse.status(), await actualPinResponse.text()).toBe(201);
  const actualPinBody = await actualPinResponse.json();
  const actualPinDigest = actualPinBody.data.digest;
  const basePinResponse = await request.post(
    `${gateway.origin}/api${root}/nsd?role=data`,
    {
      headers,
      multipart: {
        file: {
          name: 'actual-ld.xml',
          mimeType: 'application/xml',
          buffer: Buffer.from(
            '<NS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="ActualLD" version="2007" revision="B" release="1" namespaceType="private"><Copyright><Notice>Synthetic captured LD namespace pin</Notice><License uri="https://example.invalid/license" kind="Private"/></Copyright><BasicTypes><BasicType name="VisString255"/></BasicTypes><FunctionalConstraints><FunctionalConstraint abbreviation="EX"/></FunctionalConstraints><PresenceConditions><PresenceCondition name="M"/></PresenceConditions><CDCs><CDC name="LPL" titleID="DefaultLPL"><DataAttribute name="ldNs" type="VisString255" fc="EX"/></CDC></CDCs></NS>',
          ),
        },
      },
    },
  );
  expect(basePinResponse.status(), await basePinResponse.text()).toBe(201);
  const basePinBody = await basePinResponse.json();
  const basePinDigest = basePinBody.data.digest;
  const exactPinRequest = {
    ...payload,
    namespaces: {
      ...namespacePlan.selection.namespaces,
      data: [
        ...namespacePlan.selection.namespaces.data,
        actualPinDigest,
        basePinDigest,
      ],
    },
  };
  const exactPinPlan = await api(
    request,
    gateway,
    token,
    'POST',
    `${root}/goose/source-plans`,
    exactPinRequest,
  );
  const exactScope = exactPinPlan.namespaces.logicalNodes
    .find((node: { logicalNode: string }) => node.logicalNode === 'GGIO1')
    .objects.find((object: { name: string }) => object.name === 'Ind')
    .scopes[2];
  expect(exactScope.observations.data.namespaceReference).toEqual({
    status: 'matched',
    digest: actualPinDigest,
  });
  expect(exactScope.observations.data.declarationComparison).toEqual({
    status: 'conflict',
  });
  expect(exactScope.conflict).toBe(true);
  expect(exactScope.observations.data.effectiveNamespace).toEqual({
    status: 'known',
    digest: actualPinDigest,
    origin: { kind: 'observed', level: 'data' },
  });
  const zeroPlate = exactPinPlan.namespaces.logicalNodes
    .find((node: { logicalNode: string }) => node.logicalNode === 'LLN0')
    .objects.find((object: { name: string }) => object.name === 'NamPlt');
  for (const level of ['logicalNode', 'data']) {
    expect(zeroPlate.observations[level].effectiveNamespace).toEqual({
      status: 'known',
      digest: basePinDigest,
      origin: { kind: 'hierarchy', level: 'logicalDevice' },
    });
    expect(zeroPlate.observations[level].value).toBeNull();
    expect(zeroPlate.observations[level].typeEvidence).toEqual({
      status: 'attributeAbsent',
    });
  }
  expect(zeroPlate.observations.cdc.effectiveNamespace).toEqual({
    status: 'known',
    digest: basePinDigest,
    origin: {
      kind: 'definition',
      namespaceDigest: basePinDigest,
      observedLevel: 'logicalDevice',
    },
  });
  expect(zeroPlate.observations.cdc.value).toBeNull();
  expect(zeroPlate.observations.cdc.namespaceReference).toEqual({
    status: 'unknown',
    reason: 'attributeAbsent',
  });
  expect(exactPinPlan.namespaces.runtimeQualified).toBe(false);
  expect(exactPinPlan.unresolvedRequirements).toEqual(
    compiled.unresolvedRequirements,
  );
  await writeFile(
    test.info().outputPath('goose-observed-exact-pin-plan.json'),
    JSON.stringify(
      {
        original: actualPinBody.data,
        baseOriginal: basePinBody.data,
        plan: exactPinPlan,
      },
      null,
      2,
    ),
  );
  await dialog
    .getByRole('button', { name: goose.addNamespaceData, exact: true })
    .click();
  await dialog
    .getByLabel(goose.namespaceData.replace('{index}', '2'), { exact: true })
    .fill(actualPinDigest);
  await dialog
    .getByRole('button', { name: goose.addNamespaceData, exact: true })
    .click();
  await dialog
    .getByLabel(goose.namespaceData.replace('{index}', '3'), { exact: true })
    .fill(basePinDigest);
  const exactPinReply = page.waitForResponse(
    (response) =>
      response.url().endsWith('/goose/source-plans') &&
      response.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: goose.compile, exact: true })
    .click();
  const exactPinResult = await exactPinReply;
  expect(exactPinResult.status()).toBe(200);
  await namespaceTable
    .getByRole('button', { name: /^right PlantDomain\/GGIO1/ })
    .click();
  await objectEvidence
    .first()
    .getByRole('button', { name: new RegExp(goose.namespaceScopes) })
    .click();
  await scopeCards
    .getByRole('button', { name: /^right Ind\.sub\(0\)/ })
    .click();
  const exactDataRow = objectEvidence
    .first()
    .getByTestId('namespace-scope-evidence')
    .filter({ hasText: 'Element:2020A' })
    .getByTestId('namespace-level-data');
  await exactDataRow
    .getByRole('button', {
      name: `right ${goose.namespaceEvidenceDetails}`,
      exact: true,
    })
    .click();
  await expect(
    exactDataRow.locator(`[title="${actualPinDigest}"]`).first(),
  ).toBeVisible();
  await exactDataRow
    .locator(`[title="${actualPinDigest}"]`)
    .first()
    .scrollIntoViewIfNeeded();
  await expect(
    exactDataRow.locator(`[title="${actualPinDigest}"]`).first(),
  ).toBeInViewport({ ratio: 0.9 });
  await expect(exactDataRow).toContainText(
    goose.namespaceBindingStates.matched,
  );
  await expect(exactDataRow).toContainText(
    goose.namespaceComparisonStates.conflict,
  );
  await exactDataRow.screenshot({
    path: test.info().outputPath('goose-observed-exact-pin-conflict.png'),
  });
  await namespaceTable
    .getByRole('button', { name: /^right PlantDomain\/LLN0/ })
    .click();
  const plateEvidence = result
    .getByTestId('namespace-object-evidence')
    .filter({ hasText: 'PlantDomain/LLN0/NamPlt' });
  await plateEvidence
    .getByRole('button', { name: new RegExp(goose.namespaceScopes) })
    .click();
  const inheritedLn = plateEvidence
    .getByTestId('namespace-level-logicalNode')
    .first();
  await inheritedLn.scrollIntoViewIfNeeded();
  await expect(inheritedLn).toBeInViewport({ ratio: 0.9 });
  await expect(inheritedLn).toContainText(
    goose.namespaceEffectiveStates.hierarchy,
  );
  await inheritedLn
    .getByRole('button', {
      name: `right ${goose.namespaceEvidenceDetails}`,
      exact: true,
    })
    .click();
  await expect(
    inheritedLn.locator(`[title="${basePinDigest}"]`).first(),
  ).toBeVisible();
  await expect(inheritedLn).toContainText(goose.namespaceLevels.logicalDevice);
  await expect(inheritedLn).toContainText(
    goose.namespaceTypeStates.attributeAbsent,
  );
  await inheritedLn.screenshot({
    path: test.info().outputPath('goose-inherited-namespace-source-owner.png'),
  });
  const definedCdc = plateEvidence.getByTestId('namespace-level-cdc').first();
  await definedCdc.scrollIntoViewIfNeeded();
  await expect(definedCdc).toBeInViewport({ ratio: 0.9 });
  await expect(definedCdc).toContainText(
    goose.namespaceEffectiveStates.definition,
  );
  await definedCdc
    .getByRole('button', {
      name: `right ${goose.namespaceEvidenceDetails}`,
      exact: true,
    })
    .click();
  await expect(definedCdc).toContainText(goose.namespaceDefinitionContext);
  await expect(
    definedCdc.locator(`[title="${basePinDigest}"]`).first(),
  ).toBeVisible();
  await expect(definedCdc).toContainText(
    goose.namespaceTypeStates.attributeAbsent,
  );
  await definedCdc.screenshot({
    path: test.info().outputPath('goose-definition-default-actual-context.png'),
  });
  await dialog
    .getByLabel(indexed(goose.namespaceData), { exact: true })
    .fill('a'.repeat(63));
  await expect(
    result.getByText(goose.namespaceUnresolved, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: goose.compile, exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel(indexed(goose.namespaceData), { exact: true })
    .fill(namespaceDigests.data);
  await dialog.getByLabel(goose.control, { exact: true }).fill('different');
  await expect(members).toHaveCount(0);
  await dialog.getByLabel(goose.control, { exact: true }).fill('events');
  await dialog.getByLabel(goose.observation, { exact: true }).fill(digest);
  await expect(
    dialog.getByRole('button', { name: goose.compile, exact: true }),
  ).toBeDisabled();
}

/** Concrete conflicts, unobservable facts and historical provenance remain read-only. */
async function comparisonOperatorJourney({
  gateway,
  request,
  page,
  token,
  locales,
  channelId,
  capturedDigest,
  captureRevision,
}: {
  capturedDigest: string;
  captureRevision: string;
  channelId: number;
  gateway: Gateway;
  locales: typeof import('../src/locales/langs/zh-CN/page.json');
  page: Page;
  request: APIRequestContext;
  token: string;
}) {
  const labels = locales.southward.channel.engineering.comparison;
  const original = await readFile(fixturePath, 'utf8');
  const source = Buffer.from(
    original
      .replace('bType="BOOLEAN"', 'bType="INT32"')
      .replace('<Val>false</Val>', '<Val>0</Val>')
      .replace('<Val>true</Val>', '<Val>1</Val>'),
  );
  const digest = await upload(request, gateway, token, source);
  const before = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channelId}`,
  );
  const payload = {
    declaration: { digest, server: 0 },
    observation: { digest: capturedDigest, server: 0 },
    domains: ['PlantDomain'],
    statuses: [] as string[],
    offset: 0,
    limit: 16,
  };
  const headers = {
    'X-Gateway-Contract': 'boot',
    Authorization: `Bearer ${token}`,
  };
  for (const data of [
    {
      ...payload,
      declaration: payload.observation,
      observation: payload.declaration,
    },
    { ...payload, domains: ['PlantDomain', 'PlantDomain'] },
    { ...payload, statuses: ['conflict', 'conflict'] },
    { ...payload, limit: 0 },
  ]) {
    const rejected = await request.post(
      `${gateway.origin}/api${root}/comparisons`,
      { headers, data },
    );
    expect(rejected.status(), await rejected.text()).toBe(422);
  }
  const anonymous = await request.post(
    `${gateway.origin}/api${root}/comparisons`,
    {
      headers: { 'X-Gateway-Contract': 'boot' },
      data: payload,
    },
  );
  expect(anonymous.status()).toBe(401);
  const oversized = await request.post(
    `${gateway.origin}/api${root}/comparisons`,
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: Buffer.alloc(128 * 1024 + 1, 32),
    },
  );
  expect(oversized.status()).toBe(413);

  await page.getByRole('button', { name: labels.title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: labels.title, exact: true });
  await expect(
    dialog.getByText(labels.scopeNotice, { exact: true }),
  ).toBeVisible();
  const declaration = dialog.getByRole('region', {
    name: labels.declaration,
    exact: true,
  });
  const observation = dialog.getByRole('region', {
    name: labels.observation,
    exact: true,
  });
  await expect(
    observation.getByText(capturedDigest, { exact: true }),
  ).toBeVisible();
  const input = declaration.getByRole('textbox', {
    name: labels.declarationDigest,
    exact: true,
  });
  await input.fill(capturedDigest);
  await declaration
    .getByRole('button', { name: labels.load, exact: true })
    .click();
  await expect(
    dialog.getByText(labels.wrongRole, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: labels.run, exact: true }),
  ).toBeDisabled();
  await input.fill(digest);
  await declaration
    .getByRole('button', { name: labels.load, exact: true })
    .click();
  await expect(declaration.getByText(digest, { exact: true })).toBeVisible();
  const domains = dialog.getByRole('combobox', {
    name: labels.domains,
    exact: true,
  });
  await domains.fill('PlantDomain');
  await domains.press('Enter');
  await dialog
    .getByRole('heading', { name: labels.title, exact: true })
    .click();
  const allResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`${root}/comparisons`) &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: labels.run, exact: true }).click();
  const all = await allResponse;
  expect(all.status(), await all.text()).toBe(200);
  expect(all.headers()['cache-control']).toBe('no-store');
  const allBody = await all.json();
  expect(allBody.data.summary.conflict).toBeGreaterThan(0);
  expect(allBody.data.summary.unknown).toBeGreaterThan(0);
  expect(allBody.data.declaration.digest).toBe(digest);
  expect(allBody.data.observation.digest).toBe(capturedDigest);
  expect(allBody.data.observation.source.configurationRevision).toBe(
    captureRevision,
  );
  await writeFile(
    test.info().outputPath('comparison-all.json'),
    JSON.stringify(allBody.data, null, 2),
  );
  const filter = dialog.getByRole('combobox', {
    name: labels.filter,
    exact: true,
  });
  await filter.click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(labels.statuses.conflict, { exact: true })
    .click();
  await dialog
    .getByRole('heading', { name: labels.title, exact: true })
    .click();
  const filteredResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`${root}/comparisons`) &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: labels.run, exact: true }).click();
  const filtered = await filteredResponse;
  expect(filtered.status(), await filtered.text()).toBe(200);
  const filteredBody = await filtered.json();
  expect(filteredBody.data.summary).toEqual(allBody.data.summary);
  expect(filteredBody.data.findings.length).toBeGreaterThan(0);
  for (const finding of filteredBody.data.findings)
    expect(finding.status).toBe('conflict');
  const results = dialog.getByRole('region', {
    name: labels.results,
    exact: true,
  });
  await expect(results.getByRole('table')).toContainText('Ind.stVal');
  await expect(results.getByRole('table')).toContainText('signed / 32 bit');
  await page.screenshot({
    path: test.info().outputPath('comparison-conflicts.png'),
    fullPage: true,
  });
  await writeFile(
    test.info().outputPath('comparison-conflicts.json'),
    JSON.stringify(filteredBody.data, null, 2),
  );
  await input.fill('0'.repeat(64));
  await expect(results.getByRole('table')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: labels.run, exact: true }),
  ).toBeDisabled();
  await input.fill(digest);
  await declaration
    .getByRole('button', { name: labels.load, exact: true })
    .click();
  await expect(declaration.getByText(digest, { exact: true })).toBeVisible();
  const after = await api(
    request,
    gateway,
    token,
    'GET',
    `/channel/detail/${channelId}`,
  );
  expect(after.configuration).toEqual(before.configuration);
  expect(after.driverConfig).toEqual(before.driverConfig);
  expect(after.engineeringPublication).toEqual(before.engineeringPublication);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  return {
    payload: { ...payload, statuses: ['conflict'] },
    result: filteredBody.data,
  };
}

test('Chromium selects both anonymous array axes, publishes reports and recovers their exact values after restart', async ({
  gateway,
  request,
  page,
}) => {
  test.skip(
    !process.env.NG_IEC61850_ENGINEERING_PEER_BIN ||
      !process.env.NG_IEC61850_NAMED_TYPE_PYTHON,
    'Requires fixed reference publisher and independent nested BER peer',
  );
  test.setTimeout(120_000);
  const port = await reservePort();
  const peer = await startPeer(port, true);
  try {
    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const digest = await upload(
      request,
      gateway,
      token,
      await readFile(fixturePath),
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const draft = proposal(port);
    draft.channel.driverId = drivers[0].id;
    draft.acquisition.mapping.points = readPoints().slice(0, 1);
    draft.channel.status = 0;
    const preview = await api(
      request,
      gateway,
      token,
      'POST',
      `${root}/assets/${digest}/publication-preview`,
      draft,
    );
    const accepted = await request.post(
      `${gateway.origin}/api${root}/assets/${digest}/publish`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: { proposal: draft, previewDigest: preview.previewDigest },
      },
    );
    expect(accepted.status(), await accepted.text()).toBe(202);
    const receiptBody = await accepted.json();
    const receipt = receiptBody.data;
    await expect
      .poll(async () => {
        const state = await api(
          request,
          gateway,
          token,
          'GET',
          `/channel/detail/${receipt.publication.channelId}`,
        );
        return [state.configuration.state, state.configuration.appliedRevision];
      })
      .toEqual(['active', '1']);
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
    await page.goto(`${gateway.origin}/#/southward/channel`);
    await observedPublicationJourney({
      gateway,
      request,
      page,
      token,
      locales,
      channelId: Number(receipt.publication.channelId),
      baseRevision: '1',
      nextRevision: '2',
      nestedArrays: true,
    });
  } finally {
    await stopPeer(peer);
  }
});

/** Fixed public peer modes exercise actual role-specific reads through the owned capture worker. */
for (const scenario of [
  {
    mode: 'hierarchy',
    title:
      'native MMS capture retains exact GrRef hierarchy reads independently of EX namespace metadata',
  },
  {
    mode: 'control-profile',
    title:
      'native MMS capture retains exact CF control values independently of EX and status metadata',
  },
] as const) {
  test(scenario.title, async ({ gateway, request, page }) => {
    const binary = process.env.NG_IEC61850_ENGINEERING_PEER_BIN;
    test.skip(!binary, 'Requires the pinned public independent capture peer');
    if (!binary) return;
    test.setTimeout(120_000);
    const port = await reservePort();
    const peer = spawn(binary, ['ed2', String(port), scenario.mode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    peer.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    try {
      await expect.poll(() => output, { timeout: 5000 }).toContain('READY');
      const { token, password } = await initializeAdmin(request, gateway);
      await installNativeArtifact(
        request,
        gateway,
        token,
        'driver',
        'ng_driver_iec61850',
      );
      const digest = await upload(
        request,
        gateway,
        token,
        await readFile(fixturePath),
      );
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const draft = proposal(port);
      draft.channel.driverId = drivers[0].id;
      draft.channel.status = 0;
      if (scenario.mode === 'control-profile') {
        const evidence = await request.post(
          `${gateway.origin}/api${root}/documents`,
          {
            headers: {
              'X-Gateway-Contract': 'boot',
              Authorization: `Bearer ${token}`,
            },
            multipart: {
              file: {
                name: 'control-mapping-lab.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from(
                  'Explicit laboratory Mapping81 Ed2.0 and namespace interpretation declaration; diagnostic fixture only',
                ),
              },
            },
          },
        );
        expect(evidence.status(), await evidence.text()).toBe(201);
        const evidenceBody = await evidence.json();
        const source = evidenceBody.data.digest as string;
        draft.acquisition.contract.documents.push({
          digest: source,
          label: 'Control mapping laboratory original',
          locator: 'Fixture applicability',
          roles: ['vendorDocumentation'],
        });
        draft.acquisition.contract.parts.push(
          ...(['semantics71', 'mapping81'] as const).map((part) => ({
            part,
            edition: { major: 2, amendment: 0 },
            publication: 'Explicit inspected Ed2.0 fixture applicability',
            sources: [source],
          })),
        );
      }
      const preview = await api(
        request,
        gateway,
        token,
        'POST',
        `${root}/assets/${digest}/publication-preview`,
        draft,
      );
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      const committed = await request.post(
        `${gateway.origin}/api${root}/assets/${digest}/publish`,
        {
          headers,
          data: { proposal: draft, previewDigest: preview.previewDigest },
        },
      );
      expect(committed.status(), await committed.text()).toBe(202);
      const committedBody = await committed.json();
      const receipt = committedBody.data;
      expect(receipt.configuration.state).toBe('active');
      const reply = await request.post(
        `${gateway.origin}/api${root}/snapshots`,
        {
          headers,
          data: {
            channelId: receipt.publication.channelId,
            configurationRevision: receipt.publication.desiredRevision,
            domains:
              scenario.mode === 'hierarchy'
                ? ['PlantDomain', 'ParentDomain']
                : ['PlantDomain'],
          },
        },
      );
      expect(reply.status(), await reply.text()).toBe(201);
      const capturedBody = await reply.json();
      const captured = capturedBody.data;
      const original = await request.get(
        `${gateway.origin}/api${root}/assets/${captured.digest}/original`,
        { headers },
      );
      expect(original.status()).toBe(200);
      const bytes = await original.body();
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        captured.digest,
      );
      const archive = JSON.parse(bytes.toString()) as {
        records: {
          operation: {
            kind: string;
            variables?: { domain: string; item: string }[];
          };
          response: {
            config_epoch: string;
            result: { results?: { kind: string; value?: unknown }[] };
            session_epoch: string;
          };
        }[];
      };
      if (scenario.mode === 'hierarchy') {
        const hierarchy = archive.records.filter(
          (record) => record.operation.kind === 'hierarchyRead',
        );
        expect(hierarchy).toHaveLength(1);
        expect(hierarchy[0]?.operation.variables).toEqual([
          { domain: 'PlantDomain', item: 'LLN0$SP$GrRef' },
        ]);
        expect(hierarchy[0]?.response.result.results).toEqual([
          {
            kind: 'success',
            value: {
              kind: 'structure',
              values: [{ kind: 'visibleString', value: 'ParentDomain' }],
            },
          },
        ]);
      } else {
        const configuration = archive.records.filter(
          (record) => record.operation.kind === 'configurationRead',
        );
        expect(configuration).toHaveLength(1);
        expect(configuration[0]?.operation.variables).toEqual([
          { domain: 'PlantDomain', item: 'GGIO1$CF$Ind' },
        ]);
        expect(configuration[0]?.response.result.results).toEqual([
          {
            kind: 'success',
            value: {
              kind: 'structure',
              values: [
                { kind: 'unsigned', value: '1000' },
                { kind: 'integer', value: '4' },
              ],
            },
          },
        ]);
        expect(
          archive.records.filter(
            (record) => record.operation.kind === 'hierarchyRead',
          ),
        ).toHaveLength(0);
      }
      for (const record of archive.records) {
        expect(record.response.config_epoch).toBe(
          captured.source.configurationEpoch,
        );
        expect(record.response.session_epoch).toBe(
          captured.source.associationEpoch,
        );
        if (record.operation.kind === 'namespaceRead') {
          expect(
            record.operation.variables?.every(
              (variable) => variable.item.split('$')[1] === 'EX',
            ),
          ).toBe(true);
        }
      }
      const model = await api(
        request,
        gateway,
        token,
        'GET',
        `${root}/assets/${captured.digest}/preview?limit=16`,
      );
      expect(model.servers[0].logicalDeviceCount).toBe(
        scenario.mode === 'hierarchy' ? 2 : 1,
      );
      await writeFile(
        test.info().outputPath(`captured-${scenario.mode}-original.json`),
        bytes,
      );
      await writeFile(
        test.info().outputPath(`captured-${scenario.mode}-source-info.json`),
        JSON.stringify(captured, null, 2),
      );
      if (scenario.mode === 'control-profile') {
        const components = process.env.NG_IEC61850_NSD_COMPONENT_DIR;
        if (!components)
          throw new Error(
            'Exact independent IEC originals are required for the control diagnostic journey',
          );
        const originals: string[] = [];
        for (const part of ['7-2', '7-3', '7-4']) {
          const content = await readFile(
            resolve(
              components,
              `IEC_61850-${part}.NSD.2007B6.Light`,
              `IEC_61850-${part}_2007B6.nsd`,
            ),
          );
          const response = await request.post(
            `${gateway.origin}/api${root}/nsd?role=data`,
            {
              headers,
              multipart: {
                file: {
                  name: `original-${part}.nsd`,
                  mimeType: 'application/xml',
                  buffer: content,
                },
              },
            },
          );
          expect(response.status(), await response.text()).toBe(201);
          const body = await response.json();
          originals.push(body.data.digest as string);
        }
        const serviceOriginals: string[] = [];
        for (const [file, role] of [
          ['IEC_61850-8-1_2003A4.snsd', 'service'],
          ['ApplicableServiceNS.AppNS', 'applicability'],
        ] as const) {
          const content = await readFile(
            resolve(components, 'IEC_61850-8-1.NSD.2003A4.Light', file),
          );
          const response = await request.post(
            `${gateway.origin}/api${root}/nsd?role=${role}`,
            {
              headers,
              multipart: {
                file: {
                  name: file,
                  mimeType: 'application/xml',
                  buffer: content,
                },
              },
            },
          );
          expect(response.status(), await response.text()).toBe(201);
          const body = await response.json();
          serviceOriginals.push(body.data.digest as string);
        }
        const labNamespace = Buffer.from(
          '<NS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="ControlDiagnostic" version="2026" revision="A" namespaceType="private"><Copyright><Notice>Private laboratory LN descriptions for read-only diagnostic evidence. Not standardized LN conformance.</Notice><License uri="https://example.invalid/laboratory" kind="Private"/></Copyright><DependsOn id="IEC 61850-7-3" version="2007" revision="B"/><LNClasses><LNClass name="GGIO" titleID="Diagnostic.GGIO"><DataObject name="NamPlt" type="LPL"/><DataObject name="Ind" type="ENC" underlyingType="CtlModelKind"/><DataObject name="Vector" type="MV"/></LNClass></LNClasses></NS>',
        );
        const labReply = await request.post(
          `${gateway.origin}/api${root}/nsd?role=data`,
          {
            headers,
            multipart: {
              file: {
                name: 'private-control-diagnostic.nsd',
                mimeType: 'application/xml',
                buffer: labNamespace,
              },
            },
          },
        );
        expect(labReply.status(), await labReply.text()).toBe(201);
        const labBody = await labReply.json();
        originals.push(labBody.data.digest as string);
        const namespaceFields = ['ldNs', 'lnNs']
          .map(
            (name) =>
              `<DA name="${name}" fc="EX" bType="VisString255"><Val>IEC 61850-7-4:2007B</Val></DA>`,
          )
          .join('');
        const original = await readFile(fixturePath, 'utf8');
        const declaration = original
          .replace(
            '<FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(1).f" fc="MX" ix="1"/>',
            '<FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(0).f" fc="MX" ix="0"/><FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(1).f" fc="MX" ix="1"/>',
          )
          .replace(
            '<LNodeType id="ZeroType" lnClass="LLN0">',
            '<LNodeType id="ZeroType" lnClass="LLN0"><DO name="NamPlt" type="ControlPlate"/>',
          )
          .replace(
            '<LNodeType id="GioType" lnClass="GGIO">',
            '<LNodeType id="GioType" lnClass="GGIO"><DO name="NamPlt" type="ControlPlate"/>',
          )
          .replace(
            '<DOType id="SpsType" cdc="SPS">',
            '<DOType id="SpsType" cdc="ENC"><DA name="ctlModel" fc="CF" bType="Enum" type="DiagnosticControl"><Val>status-only</Val></DA>',
          )
          .replace(
            '<DOType id="ModeType"',
            `<DOType id="ControlPlate" cdc="LPL"><DA name="vendor" fc="DC" bType="VisString255"/><DA name="swRev" fc="DC" bType="VisString255"/>${namespaceFields}</DOType><DOType id="ModeType"`,
          )
          .replace(
            '<EnumType id="ModeValues">',
            '<EnumType id="DiagnosticControl"><EnumVal ord="0">status-only</EnumVal><EnumVal ord="1">direct-with-normal-security</EnumVal><EnumVal ord="2">sbo-with-normal-security</EnumVal><EnumVal ord="3">direct-with-enhanced-security</EnumVal><EnumVal ord="4">sbo-with-enhanced-security</EnumVal></EnumType><EnumType id="ModeValues">',
          );
        const diagnosticDeclaration = declaration
          .replace(
            '<LNodeType id="GioType" lnClass="GGIO"><DO name="NamPlt" type="ControlPlate"/>',
            '<LNodeType id="GioType" lnClass="GGIO"><DO name="NamPlt" type="DiagnosticPlate"/>',
          )
          .replace(
            '<DOType id="ModeType"',
            '<DOType id="DiagnosticPlate" cdc="LPL"><DA name="vendor" fc="DC" bType="VisString255"/><DA name="swRev" fc="DC" bType="VisString255"/><DA name="lnNs" fc="EX" bType="VisString255"><Val>ControlDiagnostic:2026A</Val></DA></DOType><DOType id="ModeType"',
          );
        const diagnosticDigest = await upload(
          request,
          gateway,
          token,
          Buffer.from(diagnosticDeclaration),
        );
        const payload = {
          declaration: { digest: diagnosticDigest, server: 0 },
          observation: { digest: captured.digest, server: 0 },
          domain: 'PlantDomain',
          control: 'events',
          accessPoint: 'Main',
          subnetwork: 'Station',
          namespaces: {
            rules: 'iec71Edition2',
            presenceRules: 'tr9010Edition1',
            data: originals,
            services: [
              {
                service: serviceOriginals[0],
                applicability: serviceOriginals[1],
                data: originals[1],
                primitives: ['octet6', 'octet16'],
              },
            ],
          },
        };
        const planReply = await request.post(
          `${gateway.origin}/api${root}/goose/source-plans`,
          { headers, data: payload },
        );
        expect(planReply.status(), await planReply.text()).toBe(200);
        const planBody = await planReply.json();
        const plan = planBody.data;
        const control = plan.namespaces.logicalNodes
          .find((node: { logicalNode: string }) => node.logicalNode === 'GGIO1')
          .objects.find((object: { name: string }) => object.name === 'Ind')
          .scopes[0].controlModel;
        expect(control).toEqual({
          status: 'declared',
          value: 'status-only',
          observation: { status: 'value', value: 'sbo-with-enhanced-security' },
          conflict: true,
        });
        expect(plan.namespaces.runtimeQualified).toBe(false);
        const locales = JSON.parse(
          await readFile(
            resolve(
              import.meta.dirname,
              '../src/locales/langs/zh-CN/page.json',
            ),
            'utf8',
          ),
        );
        const labels = locales.southward.channel.engineering;
        const goose = labels.goose;
        await page.goto(`${gateway.origin}/#/auth/login`);
        await page
          .getByPlaceholder('请输入用户名', { exact: true })
          .fill('system_admin');
        await page.getByPlaceholder('密码', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'login', exact: true }).click();
        await expect(page).toHaveURL(/\/home/);
        await page.goto(`${gateway.origin}/#/southward/channel`);
        await page
          .getByRole('button', { name: labels.title, exact: true })
          .click();
        const engineering = page.getByRole('dialog', {
          name: labels.title,
          exact: true,
        });
        await engineering
          .getByRole('textbox', { name: labels.digestInput, exact: true })
          .fill(diagnosticDigest);
        await engineering
          .getByRole('button', { name: labels.open, exact: true })
          .click();
        await engineering
          .getByRole('button', { name: 'IED1', exact: true })
          .click();
        await engineering
          .getByRole('button', { name: goose.title, exact: true })
          .click();
        const dialog = page.getByRole('dialog', {
          name: goose.title,
          exact: true,
        });
        await dialog
          .getByLabel(goose.observation, { exact: true })
          .fill(captured.digest);
        await dialog
          .getByRole('button', { name: goose.load, exact: true })
          .click();
        const server = dialog.getByRole('combobox', {
          name: goose.server,
          exact: true,
        });
        await expect(server).toBeEnabled();
        await server.press('ArrowDown');
        await server.press('Enter');
        for (const [label, value] of [
          [goose.domain, 'PlantDomain'],
          [goose.control, 'events'],
          [goose.accessPoint, 'Main'],
          [goose.subnetwork, 'Station'],
        ] as const)
          await dialog.getByLabel(label, { exact: true }).fill(value);
        for (const [index, digest] of originals.entries()) {
          await dialog
            .getByRole('button', {
              name: goose.addNamespaceData,
              exact: true,
            })
            .click();
          await dialog
            .getByLabel(
              goose.namespaceData.replace('{index}', String(index + 1)),
              { exact: true },
            )
            .fill(digest);
        }
        await dialog
          .getByRole('button', { name: goose.addNamespaceService, exact: true })
          .click();
        await dialog
          .getByLabel(goose.namespaceService.replace('{index}', '1'), {
            exact: true,
          })
          .fill(serviceOriginals[0] ?? '');
        await dialog
          .getByLabel(goose.namespaceApplicability.replace('{index}', '1'), {
            exact: true,
          })
          .fill(serviceOriginals[1] ?? '');
        await dialog
          .getByRole('combobox', { name: goose.namespaceTarget, exact: true })
          .press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: new RegExp(`^${originals[1]}$`) })
          .click();
        await dialog
          .getByRole('combobox', {
            name: goose.namespacePrimitives,
            exact: true,
          })
          .press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: /^Octet6$/ })
          .click();
        await dialog
          .getByRole('combobox', {
            name: goose.namespacePrimitives,
            exact: true,
          })
          .press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: /^Octet16$/ })
          .click();
        await dialog.getByText(goose.namespaceBasis, { exact: true }).click();
        const presenceBasis = dialog.getByRole('combobox', {
          name: goose.presenceRuleLabel,
          exact: true,
        });
        await presenceBasis.press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: goose.presenceRules.iec71Amendment2020 })
          .click();
        await presenceBasis.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: test.info().outputPath('presence-basis-desktop.png'),
        });
        const response = page.waitForResponse(
          (response) =>
            response.url().endsWith('/goose/source-plans') &&
            response.request().method() === 'POST',
        );
        await dialog
          .getByRole('button', { name: goose.compile, exact: true })
          .click();
        const compiledReply = await response;
        expect(compiledReply.status(), await compiledReply.text()).toBe(200);
        const selectedRules = compiledReply.request().postDataJSON().namespaces;
        expect(selectedRules.rules).toBe('iec71Edition2');
        expect(selectedRules.presenceRules).toBe('iec71Amendment2020');
        const selectedReply = await compiledReply.json();
        const selectedPlan = selectedReply.data;
        expect(selectedPlan.namespaces.runtimeQualified).toBe(false);
        expect(selectedPlan.namespaces.presenceApplicability.status).toBe(
          'partNotDeclared',
        );
        const result = dialog.getByRole('region', {
          name: goose.result,
          exact: true,
        });
        await expect(result).toContainText(
          goose.presenceProfileStates.partNotDeclared,
        );
        await result
          .getByTestId('goose-namespace-logical-nodes')
          .getByRole('button', { name: /^right PlantDomain\/GGIO1/ })
          .click();
        const object = result
          .getByTestId('namespace-object-evidence')
          .filter({ hasText: 'PlantDomain/GGIO1/Ind' });
        await object
          .getByRole('button', { name: new RegExp(goose.namespaceScopes) })
          .click();
        await expect(object.getByTestId('namespace-scope-cards')).toBeVisible();
        await expect(
          object.locator('.ant-motion-collapse-enter-active'),
        ).toHaveCount(0);
        await object
          .getByTestId('namespace-scope-cards')
          .getByRole('button', { name: /^right Ind/ })
          .click();
        await expect(
          object.locator('.ant-motion-collapse-enter-active'),
        ).toHaveCount(0);
        const evidence = object.getByTestId('namespace-scope-presence');
        await expect(evidence).toContainText(goose.controlModelDeclared);
        await expect(evidence).toContainText('status-only');
        await expect(evidence).toContainText('sbo-with-enhanced-security');
        await expect(evidence).toContainText(goose.controlModelConflict);
        await expect(
          object.locator('.ant-motion-collapse-enter-active'),
        ).toHaveCount(0);
        await evidence.scrollIntoViewIfNeeded();
        await expect(evidence).toBeInViewport({ ratio: 0.9 });
        await page.screenshot({
          path: test.info().outputPath('control-model-conflict-desktop.png'),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(object.getByTestId('namespace-scope-cards')).toBeVisible();
        await expect(
          object.locator('.ant-motion-collapse-enter-active'),
        ).toHaveCount(0);
        await evidence.scrollIntoViewIfNeeded();
        await expect(evidence).toBeInViewport({ ratio: 0.9 });
        expect(
          await page.evaluate(() => {
            const viewport = globalThis as unknown as {
              document: { documentElement: { scrollWidth: number } };
              innerWidth: number;
            };
            return (
              viewport.document.documentElement.scrollWidth <=
              viewport.innerWidth + 1
            );
          }),
        ).toBe(true);
        await page.screenshot({
          path: test.info().outputPath('control-model-conflict-narrow.png'),
        });
        await presenceBasis.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: test.info().outputPath('presence-basis-narrow.png'),
        });
        await presenceBasis.press('ArrowDown');
        await page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: goose.presenceRules.tr9010Edition1 })
          .click();
        await expect(result).toContainText(goose.pending);
        await expect(
          result.getByTestId('goose-namespace-logical-nodes'),
        ).toHaveCount(0);
        await expect(dialog.getByTestId('goose-publication')).toContainText(
          locales.southward.channel.engineering.goosePublication
            .selectionChanged,
        );
        await writeFile(
          test.info().outputPath('control-model-preflight.json'),
          JSON.stringify(plan, null, 2),
        );
      }
    } finally {
      if (peer.exitCode === null && peer.signalCode === null) {
        const exited = once(peer, 'exit');
        peer.kill('SIGTERM');
        const result = await exited;
        expect(result[0]).toBe(0);
      }
    }
  });
}
