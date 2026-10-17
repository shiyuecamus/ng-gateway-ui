import type { APIRequestContext, Page } from '@playwright/test';

import type { Gateway } from './gateway';

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';
import { tlsFixture, tlsMmsPeer } from './iec61850-tls-peer';

const engineering = '/engineering/iec61850';
const fixturePath = resolve(
  import.meta.dirname,
  '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/engineering.scd',
);
const association = {
  callingTransport: '0001',
  calledTransport: '0001',
  callingSession: '0001',
  calledSession: '0001',
  callingPresentation: '00000001',
  calledPresentation: '00000001',
};

/** Observe active page transitions without retaining a superseded Animation promise. */
async function settlePageAnimations(page: Page) {
  await expect
    .poll(() =>
      page.locator('html').evaluate(
        (element: {
          ownerDocument: {
            getAnimations: () => {
              effect: null | { getTiming: () => { iterations: number } };
              playState: string;
            }[];
          };
        }) =>
          element.ownerDocument
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
}

async function capability(
  request: APIRequestContext,
  gateway: Gateway,
  token: string,
  channel: number,
  revision: string,
  id: string,
  payload: unknown,
) {
  const response = await request.post(
    `${gateway.origin}/api/channel/${channel}/capabilities/${encodeURIComponent(id)}`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
        'X-Gateway-Configuration-Revision': revision,
      },
      data: payload,
    },
  );
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('MMS mutual TLS preserves real MMS, public identity, immutable rotation, revocation and restart', async ({
  gateway,
  request,
  page,
}) => {
  test.skip(
    !process.env.NG_IEC61850_NATIVE_TLS_PEER,
    'Requires the fixed independent native TLS/MMS peer',
  );
  test.setTimeout(180_000);
  const pki = await tlsFixture(gateway.directory);
  const peer = await tlsMmsPeer(pki.root);
  try {
    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const source = await readFile(fixturePath);
    const upload = await request.post(
      `${gateway.origin}/api${engineering}/assets`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        multipart: {
          file: {
            name: 'reviewed.scd',
            mimeType: 'application/xml',
            buffer: source,
          },
        },
      },
    );
    expect(upload.status(), await upload.text()).toBe(201);
    const uploadBody = await upload.json();
    const digest = uploadBody.data.digest;
    const security = await pki.security('client', 'tls13');
    const target = (attribute: string) => ({
      domain: 'PlantDomain',
      logicalNode: 'GGIO1',
      path: [
        { name: 'Ind', indices: [] },
        { name: attribute, indices: [] },
      ],
    });
    const draft = {
      acquisition: {
        protocol: 'mms' as const,
        contract: {
          substitution: [],
          manufacturer: null,
          model: null,
          firmware: null,
          domains: ['PlantDomain'],
          documents: [],
          parts: [],
        },
        mapping: {
          server: 0,
          accessPoint: 'Main',
          points: [
            {
              name: 'status',
              key: 'status',
              type: 1,
              unit: null,
              purpose: {
                kind: 'read',
                value: target('stVal'),
                quality: target('q'),
                sourceTime: target('t'),
              },
            },
          ],
          reports: [],
        },
      },

      target: { kind: 'create' },
      channel: {
        name: 'mms-mtls',
        driverId: drivers[0].id,
        status: 0,
        period: 1000,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
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
          transport: {
            kind: 'tls',
            host: '127.0.0.1',
            port: peer.port,
            security,
          },
          association,
        },
      },
    };
    const invalidDraft = structuredClone(draft);
    invalidDraft.channel.connectionConfig.transport.security.privateKey.sha256 =
      '0'.repeat(64);
    const invalidPreview = await request.post(
      `${gateway.origin}/api${engineering}/assets/${digest}/publication-preview`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: invalidDraft,
      },
    );
    expect(invalidPreview.status()).toBe(422);
    expect(await invalidPreview.text()).toMatch(/original bytes changed/i);
    expect(peer.authenticated).toHaveLength(0);
    const preview = await api(
      request,
      gateway,
      token,
      'POST',
      `${engineering}/assets/${digest}/publication-preview`,
      draft,
    );
    const published = await request.post(
      `${gateway.origin}/api${engineering}/assets/${digest}/publish`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: { proposal: draft, previewDigest: preview.previewDigest },
      },
    );
    expect(published.status(), await published.text()).toBe(202);
    const publishedBody = await published.json();
    const receipt = publishedBody.data;
    expect(receipt.configuration.state).toBe('active');
    const id = receipt.publication.channelId;
    const detail = () =>
      api(request, gateway, token, 'GET', `/channel/detail/${id}`);
    const phase = async () => {
      const current = await detail();
      return current.connectionState?.phase;
    };
    const activeRevision = async () => {
      const current = await detail();
      return [
        current.configuration?.appliedRevision,
        current.connectionState?.phase,
      ];
    };
    const configurationState = async () => {
      const current = await detail();
      return current.configuration?.state;
    };
    await expect.poll(phase).toBe('Connected');
    const directory = await capability(
      request,
      gateway,
      token,
      id,
      '1',
      'ng:southward:iec61850:mms:directory',
      { class: 'domains' },
    );
    expect(directory.result.kind).toBe('directory');
    expect(directory.result.names).toContain('PlantDomain');
    const originalDer = await pki.clientDer('client');
    const originalHash = createHash('sha256').update(originalDer).digest('hex');
    expect(peer.authenticated).toContainEqual({
      fingerprint: originalHash,
      protocol: 'TLSv1.3',
    });
    const identity = await capability(
      request,
      gateway,
      token,
      id,
      '1',
      'ng:southward:iec61850:tls-identity:boot',
      null,
    );
    expect(identity.mode).toBe('tls');
    expect(identity.client_certificate_sha256).toBe(originalHash);
    expect(identity.trust_material_sha256).toEqual(
      security.trustAnchors.map((reference) => reference.sha256),
    );
    expect(JSON.stringify(identity)).not.toContain(pki.root);
    expect(Object.keys(identity).some((key) => /private|key/i.test(key))).toBe(
      false,
    );

    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/southward/channel`);
    const row = page.locator('tr').filter({ hasText: 'mms-mtls' });
    await expect(row).toBeVisible();
    await row.locator('button[code="mmsTls"]').click();
    const modal = page.getByRole('dialog');
    await expect(modal.locator(`[title="${originalHash}"]`)).toBeVisible();
    await expect(
      modal.getByText('ied.example.test', { exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent('download');
    await modal
      .getByRole('button', { name: '下载客户端公开证书', exact: true })
      .click();
    const file = await download;
    expect(await readFile(await file.path())).toEqual(originalDer);
    await page.screenshot({
      path: test.info().outputPath('mms-tls-identity.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');

    // Editing the real engineering mapping must preserve explicit TLS and its realm.
    const locales = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
        'utf8',
      ),
    );
    const labels = locales.southward.channel.engineering;
    const mapping = labels.mapping;
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    const engineeringModal = page.getByRole('dialog');
    await engineeringModal
      .locator('input[type=file][accept*=".scd"]')
      .setInputFiles({
        name: 'reviewed.scd',
        mimeType: 'application/xml',
        buffer: source,
      });
    await engineeringModal
      .getByRole('button', { name: 'IED1', exact: true })
      .click();
    const model = engineeringModal.getByRole('region', {
      name: labels.model,
      exact: true,
    });
    const table = model.getByRole('table');
    const node = (name: string) =>
      table.getByRole('button', { name, exact: true });
    await model
      .getByRole('button', { name: labels.accessPoints, exact: true })
      .click();
    await node('Main').click();
    await model
      .getByRole('button', { name: labels.logicalDevices, exact: true })
      .first()
      .click();
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
    const editor = engineeringModal.getByRole('region', {
      name: mapping.title,
      exact: true,
    });
    await editor.getByLabel(mapping.pointKey, { exact: true }).fill('status');
    await editor.getByLabel(mapping.pointName, { exact: true }).fill('status');
    await editor
      .getByRole('tab', { name: mapping.channelTab, exact: true })
      .click();
    await editor
      .getByRole('combobox', { name: mapping.target, exact: true })
      .press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('mms-mtls', { exact: true })
      .click();
    const securityEditor = editor.getByLabel(mapping.tlsSecurity, {
      exact: true,
    });
    await expect(securityEditor).toBeVisible();
    await expect
      .poll(async () => JSON.parse(await securityEditor.inputValue()))
      .toEqual(security);
    const reviewedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/publication-preview') &&
        response.request().method() === 'POST',
    );
    await editor
      .getByRole('button', { name: mapping.preview, exact: true })
      .click();
    const reviewed = await reviewedResponse;
    expect(reviewed.status(), await reviewed.text()).toBe(200);
    expect(
      reviewed.request().postDataJSON().channel.connectionConfig.transport,
    ).toEqual(draft.channel.connectionConfig.transport);
    await page.screenshot({
      path: test.info().outputPath('mms-engineering-tls-preserved.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');

    const original = await detail();
    const update = async (next: typeof security) =>
      api(request, gateway, token, 'PUT', '/channel', {
        id,
        name: original.name,
        driverId: original.driverId,
        collectionType: original.collectionType,
        period: original.period,
        reportType: original.reportType,
        connectionPolicy: original.connectionPolicy,
        driverConfig: {
          ...original.driverConfig,
          transport: { ...original.driverConfig.transport, security: next },
        },
      });
    const invalidMaterial = await request.put(`${gateway.origin}/api/channel`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: {
        id,
        name: original.name,
        driverId: original.driverId,
        collectionType: original.collectionType,
        period: original.period,
        reportType: original.reportType,
        connectionPolicy: original.connectionPolicy,
        driverConfig: {
          ...original.driverConfig,
          transport: {
            ...original.driverConfig.transport,
            security: {
              ...security,
              privateKey: { ...security.privateKey, sha256: '0'.repeat(64) },
            },
          },
        },
      },
    });
    expect(invalidMaterial.status()).toBe(422);
    expect(await invalidMaterial.text()).toMatch(/original bytes changed/i);
    await expect.poll(activeRevision).toEqual(['1', 'Connected']);
    const rotated = await pki.security('rotated-client', 'tls12');
    await update(rotated);
    await expect.poll(activeRevision).toEqual(['2', 'Connected']);
    const rotatedHash = createHash('sha256')
      .update(await pki.clientDer('rotated-client'))
      .digest('hex');
    expect(peer.authenticated).toContainEqual({
      fingerprint: rotatedHash,
      protocol: 'TLSv1.2',
    });
    const rotatedIdentity = await capability(
      request,
      gateway,
      token,
      id,
      '2',
      'ng:southward:iec61850:tls-identity:boot',
      null,
    );
    expect(rotatedIdentity.client_certificate_sha256).toBe(rotatedHash);

    // Out-of-band changes fence the original generation; restoring a file does not reload it.
    const originalBytes = await readFile(rotated.clientCertificate.path);
    await writeFile(rotated.clientCertificate.path, 'unreviewed material');
    await expect.poll(phase).toBe('Failed');
    await writeFile(rotated.clientCertificate.path, originalBytes);
    const fenced = await detail();
    expect(fenced.configuration.appliedRevision).toBe('2');
    await update(security);
    await expect.poll(activeRevision).toEqual(['3', 'Connected']);

    await pki.revokeServer();
    const currentRevocation = await pki.security(
      'client',
      'tls13',
      'revoked.crl',
    );
    await update(currentRevocation);
    await expect.poll(configurationState).toBe('failed');
    const revoked = await detail();
    expect(revoked.configuration.desiredRevision).toBe('4');
    expect(revoked.configuration.appliedRevision).toBe('3');
    expect(revoked.configuration.lastError).toMatch(/revok|TLS|certificate/i);
    const acceptedBeforeRollback = peer.authenticated.length;
    const rollback = await request.put(`${gateway.origin}/api/channel`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: {
        id,
        name: original.name,
        driverId: original.driverId,
        collectionType: original.collectionType,
        period: original.period,
        reportType: original.reportType,
        connectionPolicy: original.connectionPolicy,
        driverConfig: {
          ...original.driverConfig,
          transport: { ...original.driverConfig.transport, security },
        },
      },
    });
    expect(rollback.status()).toBe(422);
    expect(await rollback.text()).toMatch(/CRL.*rollback/i);
    const rejectedRollback = await detail();
    expect(rejectedRollback.configuration.desiredRevision).toBe('4');
    expect(rejectedRollback.configuration.appliedRevision).toBe('3');
    expect(rejectedRollback.configuration.lastError).toMatch(
      /revok|TLS|certificate/i,
    );
    expect(peer.authenticated).toHaveLength(acceptedBeforeRollback);
    await gateway.restart();
    await expect.poll(configurationState).toBe('failed');
    const refusedAfterRestart = await detail();
    expect(refusedAfterRestart.configuration.desiredRevision).toBe('4');
    expect(refusedAfterRestart.configuration.appliedRevision).toBe('3');
    expect(refusedAfterRestart.configuration.lastError).toMatch(
      /revok|TLS|certificate/i,
    );
    expect(peer.authenticated).toHaveLength(acceptedBeforeRollback);
    await peer.rotateServer();
    await update(currentRevocation);
    await expect.poll(activeRevision).toEqual(['5', 'Connected']);
    await gateway.restart();
    await expect.poll(activeRevision).toEqual(['5', 'Connected']);
    const resumed = await capability(
      request,
      gateway,
      token,
      id,
      '5',
      'ng:southward:iec61850:mms:directory',
      { class: 'domains' },
    );
    expect(resumed.result.names).toContain('PlantDomain');
    const restarted = await detail();
    expect(restarted.driverConfig.transport.kind).toBe('tls');
    await writeFile(
      test.info().outputPath('native-tls-credential-lifecycle.json'),
      JSON.stringify(
        {
          authenticated: peer.authenticated,
          securityEvents: peer.failures,
          originalIdentity: identity,
          rotatedIdentity,
          finalRevision: restarted.configuration,
        },
        null,
        2,
      ),
    );
  } finally {
    await peer.stop();
  }
});

test('MMS TLS report GI becomes Current and a newer durable CRL retires the active source', async ({
  gateway,
  request,
  page,
}) => {
  test.skip(
    !process.env.NG_IEC61850_NATIVE_TLS_PEER,
    'Requires the fixed independent native TLS/MMS peer',
  );
  test.setTimeout(180_000);
  const pki = await tlsFixture(gateway.directory);
  const peer = await tlsMmsPeer(pki.root);
  try {
    const { token, password } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const original = await readFile(
      resolve(
        import.meta.dirname,
        '../../../../ng-gateway-protocols/iec61850/tests/fixtures/scl/symbolic.scd',
      ),
      'utf8',
    );
    const selected =
      '<FCDA ldInst="LD0" prefix="" lnClass="GGIO" lnInst="1" doName="Vector" daName="mag(1).f" fc="MX" ix="1"/>';
    const source = Buffer.from(
      original.replace(
        selected,
        `${selected.replace('mag(1).f', 'mag(0).f').replace('ix="1"', 'ix="0"')}\n${selected}`,
      ),
    );
    const uploaded = await request.post(
      `${gateway.origin}/api${engineering}/assets`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        multipart: {
          file: {
            name: 'report.scd',
            mimeType: 'application/xml',
            buffer: source,
          },
        },
      },
    );
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const uploadBody = await uploaded.json();
    const digest = uploadBody.data.digest;
    const security = await pki.security('client', 'tls13');
    const target = (attribute: string) => ({
      domain: 'PlantDomain',
      logicalNode: 'GGIO1',
      path: [
        { name: 'Ind', indices: [] },
        { name: attribute, indices: [] },
      ],
    });
    const draft = {
      acquisition: {
        protocol: 'mms' as const,
        contract: {
          substitution: [],
          manufacturer: null,
          model: null,
          firmware: null,
          domains: ['PlantDomain'],
          documents: [],
          parts: [],
        },
        mapping: {
          server: 0,
          accessPoint: 'Main',
          points: [
            {
              name: 'status',
              key: 'status',
              type: 1,
              unit: null,
              purpose: {
                kind: 'read',
                value: target('stVal'),
                quality: target('q'),
                sourceTime: target('t'),
              },
            },
          ],
          reports: [
            {
              domain: 'PlantDomain',
              logicalNode: 'LLN0',
              reportName: 'urEvents01',
              reportId: 'ArrayEvents',
              reservation: { kind: 'urUnreserved' },
              points: [
                {
                  pointIndex: 0,
                  valueMember: 1,
                  qualityMember: 0,
                  timeMember: 5,
                },
              ],
            },
          ],
        },
      },

      target: { kind: 'create' },
      channel: {
        name: 'mms-tls-report',
        driverId: drivers[0].id,
        status: 0,
        period: null,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
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
          transport: {
            kind: 'tls',
            host: '127.0.0.1',
            port: peer.port,
            security,
          },
          association,
        },
      },
    };
    const preview = await api(
      request,
      gateway,
      token,
      'POST',
      `${engineering}/assets/${digest}/publication-preview`,
      draft,
    );
    const published = await request.post(
      `${gateway.origin}/api${engineering}/assets/${digest}/publish`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: { proposal: draft, previewDigest: preview.previewDigest },
      },
    );
    expect(published.status(), await published.text()).toBe(202);
    const publishedBody = await published.json();
    const receipt = publishedBody.data;
    expect(receipt.configuration.state).toBe('active');
    const id = receipt.publication.channelId;
    const devices = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/${id}/sub-devices`,
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
      .getByText('mms-tls-report', { exact: true })
      .click();
    await page.getByRole('combobox').nth(1).press('ArrowDown');
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(devices[0].deviceName, { exact: true })
      .click();
    const row = page
      .locator('tr')
      .filter({ has: page.getByText('status', { exact: true }) });
    await expect(
      row.getByText(locales.monitor.realtime.freshness.current, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      row.getByText(locales.monitor.realtime.quality.good, { exact: true }),
    ).toBeVisible();
    await page
      .getByText(locales.monitor.realtime.status.connected, { exact: true })
      .click();
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
    await expect(page.locator('.ant-notification-notice')).toHaveCount(0);
    await row
      .getByRole('button', {
        name: locales.monitor.realtime.facts.open.replace('{key}', 'status'),
        exact: true,
      })
      .click();
    const sourceFacts = page.locator('.monitor-quality-popover:visible');
    await expect(sourceFacts).toBeVisible();
    await expect(sourceFacts).toBeInViewport();
    await expect(sourceFacts).toContainText(
      locales.monitor.realtime.sourceMode.normal,
    );
    await expect(sourceFacts).toContainText(
      locales.monitor.realtime.table.timeValidity,
    );
    await expect(sourceFacts).toContainText(
      locales.monitor.realtime.facts.leapSecondsKnown,
    );
    await expect(sourceFacts).toContainText('iec61850.timeQuality');
    await expect(sourceFacts.locator('code').last()).toHaveText('8a');
    const qualityTrigger = row.getByRole('button', {
      name: locales.monitor.realtime.facts.open.replace('{key}', 'status'),
      exact: true,
    });
    await expect(qualityTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(qualityTrigger).toHaveAttribute('aria-expanded', 'true');
    await qualityTrigger.hover();
    await expect(qualityTrigger).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const closeQuality = sourceFacts.getByRole('button', {
      name: locales.monitor.realtime.facts.close,
      exact: true,
    });
    await expect(closeQuality).toBeFocused();
    await expect
      .poll(async () =>
        sourceFacts.evaluate(
          (element: { getAnimations: () => unknown[] }) =>
            element.getAnimations().length,
        ),
      )
      .toBe(0);
    await expect(sourceFacts).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: test.info().outputPath('source-quality-time-facts-desktop.png'),
    });
    await closeQuality.press('Escape');
    await expect(qualityTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(qualityTrigger).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath('mms-tls-report-current.png'),
    });
    await qualityTrigger.press('Enter');
    await expect(closeQuality).toBeFocused();
    await closeQuality.click();
    await page.getByRole('button', { name: 'light', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await settlePageAnimations(page);

    await qualityTrigger.press('Enter');
    await expect(closeQuality).toBeFocused();
    await expect(sourceFacts).toBeInViewport({ ratio: 1 });
    await expect(sourceFacts).toHaveCSS('opacity', '1');
    await expect
      .poll(() =>
        sourceFacts.evaluate((element) => element.getAnimations().length),
      )
      .toBe(0);
    await page.screenshot({
      path: test.info().outputPath('source-quality-time-facts-light.png'),
    });
    await closeQuality.click();
    await page.getByRole('button', { name: 'dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await settlePageAnimations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .getByRole('button', {
        name: locales.monitor.realtime.facts.open.replace('{key}', 'status'),
        exact: true,
      })
      .click();
    await expect(closeQuality).toBeFocused();
    await expect(sourceFacts).toBeInViewport({ ratio: 1 });
    await expect(
      page.locator('.monitor-quality-popover:visible'),
    ).toContainText(locales.monitor.realtime.table.timeValidity);
    await expect(
      page.locator('.monitor-quality-popover:visible'),
    ).toBeInViewport();
    await expect
      .poll(async () =>
        page
          .locator('.monitor-quality-popover:visible')
          .evaluate(
            (element: { getAnimations: () => unknown[] }) =>
              element.getAnimations().length,
          ),
      )
      .toBe(0);
    await page.screenshot({
      path: test.info().outputPath('source-quality-time-facts-narrow.png'),
    });
    await sourceFacts
      .getByText(locales.monitor.realtime.facts.unknownHint, { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(sourceFacts.locator('code').last()).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: test.info().outputPath('source-quality-raw-evidence-narrow.png'),
    });
    await row
      .getByRole('button', {
        name: locales.monitor.realtime.facts.open.replace('{key}', 'status'),
        exact: true,
      })
      .click();
    await page.setViewportSize({ width: 1280, height: 720 });
    // A disabled generation may expose public metadata without revoking another source.
    const witnessConfig = {
      protocol: 'mms',
      association,
      transport: { kind: 'tls', host: '127.0.0.1', port: peer.port, security },
    };
    await api(request, gateway, token, 'POST', '/channel', {
      name: 'revocation-witness',
      driverId: drivers[0].id,
      collectionType: 1,
      period: 1000,
      reportType: 0,
      connectionPolicy: draft.channel.connectionPolicy,
      driverConfig: witnessConfig,
    });
    const witnessList = await api(
      request,
      gateway,
      token,
      'GET',
      '/channel/list',
    );
    const witness = witnessList.find(
      (channel: { id: number; name: string }) =>
        channel.name === 'revocation-witness',
    );
    expect(witness).toBeTruthy();
    await api(request, gateway, token, 'PUT', '/channel/change-status', {
      id: witness.id,
      status: 1,
    });
    await pki.revokeServer();
    const currentRevocation = await pki.security(
      'rotated-client',
      'tls13',
      'revoked.crl',
    );
    await api(request, gateway, token, 'PUT', '/channel', {
      id: witness.id,
      name: 'revocation-witness',
      driverId: drivers[0].id,
      collectionType: 1,
      period: 1000,
      reportType: 0,
      connectionPolicy: draft.channel.connectionPolicy,
      driverConfig: {
        ...witnessConfig,
        transport: { ...witnessConfig.transport, security: currentRevocation },
      },
    });
    const inspected = await capability(
      request,
      gateway,
      token,
      witness.id,
      '3',
      'ng:southward:iec61850:tls-identity:boot',
      null,
    );
    expect(inspected.revocation_material_sha256).toEqual(
      currentRevocation.revocationLists.map((source) => source.sha256),
    );
    // Observe several 100 ms security sweeps before authorizing the new connection.
    await page.waitForTimeout(500);
    const stillCurrent = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${id}`,
    );
    expect(stillCurrent.connectionState?.phase).toBe('Connected');
    await expect(
      row.getByText(locales.monitor.realtime.freshness.current, {
        exact: true,
      }),
    ).toBeVisible();
    // Connecting now journals the signed generation despite the peer's certificate rejection.
    await api(request, gateway, token, 'PUT', '/channel/change-status', {
      id: witness.id,
      status: 0,
    });
    await expect
      .poll(async () => {
        const current = await api(
          request,
          gateway,
          token,
          'GET',
          `/channel/detail/${id}`,
        );
        return current.connectionState?.phase;
      })
      .toBe('Failed');
    await expect(
      row.getByText(locales.monitor.realtime.freshness.stale, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('mms-tls-report-stale.png'),
      fullPage: true,
    });
    await writeFile(
      test.info().outputPath('native-tls-report-revocation.json'),
      JSON.stringify(
        {
          authenticated: peer.authenticated,
          securityEvents: peer.failures,
          inspectedPublicIdentity: inspected,
          staleAfterSignedGeneration: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await peer.stop();
  }
});
