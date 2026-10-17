import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect } from '@playwright/test';

import { api, initializeAdmin, test } from './gateway';

const baseOriginal =
  Buffer.from(`<NS xmlns="http://www.iec.ch/61850/2016/NSD" id="BrowserNamespace" version="2007" revision="B" release="3">
<Copyright><Notice>Synthetic browser regression source</Notice><License uri="https://example.invalid/nsd-license" kind="Private"/></Copyright>
<Enumerations><Enumeration name="BrowserState" titleID="BrowserStateTitle"><Literal name="off" literalVal="0"/><Literal name="on" literalVal="1"/></Enumeration></Enumerations></NS>`);

for (const role of ['service', 'applicability'] as const) {
  const original = Buffer.from(
    role === 'service'
      ? '<ServiceNS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" id="BrowserMapping" version="2003" revision="A" release="4"><ServiceTypeRealizations><ServiceTypeRealization titleID="MappedAddressTitle" name="MappedAddress" realize="AbstractAddress"><SubDataAttribute name="Addr" type="Octet6"/></ServiceTypeRealization></ServiceTypeRealizations></ServiceNS>'
      : '<ApplicableServiceNS xmlns="http://www.iec.ch/61850/2016/NSD" nsdVersion="2017" nsdRevision="B" nsdRelease="6" version="2" date="2025-04-28T12:00:00Z"><ServiceNsUsage id="BrowserMapping" version="2003"><AppliesTo id="Core" version="2007" revision="B" release="6"/></ServiceNsUsage></ApplicableServiceNS>',
  );
  test(`operator imports ${role} originals with explicit role and recovers exact independent identity after restart`, async ({
    gateway,
    page,
    request,
  }) => {
    const root = '/engineering/iec61850';
    const { token, password } = await initializeAdmin(request, gateway);
    const headers = {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${token}`,
      Origin: gateway.origin,
    };
    for (const suffix of ['', '?role=unknown', '?role=data']) {
      const rejected = await request.post(
        `${gateway.origin}/api${root}/nsd${suffix}`,
        {
          headers,
          multipart: {
            file: {
              name: 'original.xml',
              mimeType: 'application/xml',
              buffer: original,
            },
          },
        },
      );
      expect(rejected.status()).toBe(suffix === '?role=data' ? 422 : 400);
    }
    const locales = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
        'utf8',
      ),
    );
    const labels = locales.southward.channel.engineering;
    const nsd = labels.nsd;
    const digest = createHash('sha256').update(original).digest('hex');
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/southward/channel`);
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    let panel = page
      .getByRole('dialog')
      .getByRole('region', { name: nsd.title, exact: true });
    await panel.getByRole('combobox', { name: nsd.role, exact: true }).click();
    await page.getByText(nsd[`${role}Role`], { exact: true }).last().click();
    await panel.locator('input[type=file]').setInputFiles({
      name: role === 'service' ? 'original.snsd' : 'original.appns',
      mimeType: 'application/xml',
      buffer: original,
    });
    await expect(panel.getByText(digest, { exact: true })).toBeVisible();
    await expect(panel.getByText('2017B6', { exact: true })).toBeVisible();
    const info = await api(
      request,
      gateway,
      token,
      'GET',
      `${root}/assets/${digest}`,
    );
    expect(info.source).toEqual({
      kind: 'nsd',
      schema: '2017B6',
      encoding: 'utf8',
      identity:
        role === 'service'
          ? {
              role,
              namespace: 'BrowserMapping',
              version: 2003,
              revision: 'A',
              release: 4,
              publicationStage: 'IS',
            }
          : { role, version: 2, date: '2025-04-28T12:00:00Z' },
    });
    if (role === 'service') await expect(panel).toContainText('2003A / 4');
    else {
      await expect(panel).toContainText('2025-04-28T12:00:00Z');
      await expect(
        panel.getByText(nsd.coordinates, { exact: true }),
      ).toHaveCount(0);
      await expect(panel.getByText(nsd.namespace, { exact: true })).toHaveCount(
        0,
      );
    }
    await gateway.restart();
    await page.reload();
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    panel = page
      .getByRole('dialog')
      .getByRole('region', { name: nsd.title, exact: true });
    await panel
      .getByRole('textbox', { name: nsd.digest, exact: true })
      .fill(digest);
    await panel.getByRole('button', { name: nsd.open, exact: true }).click();
    await expect(panel.getByText(digest, { exact: true })).toBeVisible();
    const replay = await api(
      request,
      gateway,
      token,
      'GET',
      `${root}/assets/${digest}`,
    );
    expect(replay.source).toEqual(info.source);
    const download = await request.get(
      `${gateway.origin}/api${root}/assets/${digest}/original`,
      { headers },
    );
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain(
      `${digest}.${role === 'service' ? 'snsd' : 'appns'}`,
    );
    expect(await download.body()).toEqual(original);
    expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
      [],
    );
    await page.getByRole('dialog').screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../../roadmap/evidence/2026-10-11-r5-nsd-services/nsd-ingestion-${role}.png`,
      ),
    });
  });
}

for (const schema of ['2016', '2017B5', '2017B6'] as const) {
  const original =
    schema === '2016'
      ? baseOriginal
      : Buffer.from(
          baseOriginal
            .toString()
            .replace(
              'id="BrowserNamespace"',
              `nsdVersion="2017" nsdRevision="B" nsdRelease="${schema === '2017B5' ? 5 : 6}" namespaceType="private" id="BrowserNamespace"`,
            ),
        );
  /** The actual host derives namespace coordinates, persists originals and rejects role shortcuts. */
  test(`operator imports ${schema} NSD originals and recovers exact evidence after rejection and restart`, async ({
    gateway,
    page,
    request,
  }) => {
    const root = '/engineering/iec61850';
    const anonymous = await request.post(
      `${gateway.origin}/api${root}/nsd?role=data`,
      {
        headers: { 'X-Gateway-Contract': 'boot' },
        multipart: {
          file: {
            name: 'original.nsd',
            mimeType: 'application/xml',
            buffer: original,
          },
        },
      },
    );
    expect(anonymous.status()).toBe(401);
    const { token, password } = await initializeAdmin(request, gateway);
    const headers = {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${token}`,
      Origin: gateway.origin,
    };
    const status = await api(request, gateway, token, 'GET', `${root}/status`);
    expect(status.nsdImportAvailable).toBe(true);
    expect(await api(request, gateway, token, 'GET', '/driver/list')).toEqual(
      [],
    );
    const locales = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
        'utf8',
      ),
    );
    const labels = locales.southward.channel.engineering;
    const nsd = labels.nsd;
    const digest = createHash('sha256').update(original).digest('hex');
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/southward/channel`);
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    let panel = page
      .getByRole('dialog')
      .getByRole('region', { name: nsd.title, exact: true });
    await panel.getByRole('combobox', { name: nsd.role, exact: true }).click();
    await page.getByText(nsd.dataRole, { exact: true }).last().click();
    await panel.locator('input[type=file]').setInputFiles({
      name: 'original.nsd',
      mimeType: 'application/xml',
      buffer: original,
    });
    await expect(panel.getByText(digest, { exact: true })).toBeVisible();
    await expect(
      panel.getByText('BrowserNamespace', { exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText('2007B / 3');
    await expect(panel.getByText(schema, { exact: true })).toBeVisible();
    await expect(
      panel.getByText(schema === '2016' ? nsd.undeclared : 'private', {
        exact: true,
      }),
    ).toBeVisible();
    const info = await api(
      request,
      gateway,
      token,
      'GET',
      `${root}/assets/${digest}`,
    );
    expect(info.source).toEqual({
      kind: 'nsd',
      schema,
      identity: {
        role: 'data',
        namespaceType: schema === '2016' ? null : 'private',
        namespace: 'BrowserNamespace',
        version: 2007,
        revision: 'B',
        release: 3,
        publicationStage: 'IS',
      },
      encoding: 'utf8',
    });
    const download = await request.get(
      `${gateway.origin}/api${root}/assets/${digest}/original`,
      { headers },
    );
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain(
      `${digest}.nsd`,
    );
    expect(await download.body()).toEqual(original);
    const serverPreview = await request.get(
      `${gateway.origin}/api${root}/assets/${digest}/preview?offset=0&limit=1`,
      { headers },
    );
    expect(serverPreview.status()).toBe(422);

    const invalid = Buffer.from(
      original
        .toString()
        .replace('id="BrowserNamespace"', 'bogus="true" id="BrowserNamespace"'),
    );
    await panel.locator('input[type=file]').setInputFiles({
      name: 'bad.nsd',
      mimeType: 'application/xml',
      buffer: invalid,
    });
    await expect(panel.getByText(nsd.failed, { exact: true })).toBeVisible();
    await expect(
      panel.getByText('BrowserNamespace', { exact: true }),
    ).toHaveCount(0);
    await panel
      .getByRole('textbox', { name: nsd.digest, exact: true })
      .fill(digest);
    await panel.getByRole('button', { name: nsd.open, exact: true }).click();
    await expect(
      panel.getByText('BrowserNamespace', { exact: true }),
    ).toBeVisible();

    const document = await request.post(
      `${gateway.origin}/api${root}/documents`,
      {
        headers,
        multipart: {
          file: {
            name: 'support.nsd',
            mimeType: 'application/octet-stream',
            buffer: Buffer.from('opaque supporting namespace material'),
          },
        },
      },
    );
    expect(document.status()).toBe(201);
    const documentBody = await document.json();
    const documentDigest = documentBody.data.digest;
    await panel
      .getByRole('textbox', { name: nsd.digest, exact: true })
      .fill(documentDigest);
    await panel.getByRole('button', { name: nsd.open, exact: true }).click();
    await expect(panel.getByText(nsd.wrongRole, { exact: true })).toBeVisible();
    await expect(
      panel.getByText('BrowserNamespace', { exact: true }),
    ).toHaveCount(0);

    await gateway.restart();
    await page.reload();
    await page.getByRole('button', { name: labels.title, exact: true }).click();
    panel = page
      .getByRole('dialog')
      .getByRole('region', { name: nsd.title, exact: true });
    await panel
      .getByRole('textbox', { name: nsd.digest, exact: true })
      .fill(digest);
    await panel.getByRole('button', { name: nsd.open, exact: true }).click();
    await expect(
      panel.getByText('BrowserNamespace', { exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText('2007B / 3');
    await expect(panel.getByText(schema, { exact: true })).toBeVisible();
    await expect(
      panel.getByText(schema === '2016' ? nsd.undeclared : 'private', {
        exact: true,
      }),
    ).toBeVisible();
    const replayInfo = await api(
      request,
      gateway,
      token,
      'GET',
      `${root}/assets/${digest}`,
    );
    expect(replayInfo.source).toEqual(info.source);
    const replayOriginal = await request.get(
      `${gateway.origin}/api${root}/assets/${digest}/original`,
      { headers },
    );
    expect(replayOriginal.status()).toBe(200);
    expect(await replayOriginal.body()).toEqual(original);
    expect(await api(request, gateway, token, 'GET', '/channel/list')).toEqual(
      [],
    );
    await page.getByRole('dialog').screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../../roadmap/evidence/2026-10-11-r5-nsd-services/nsd-ingestion-${schema}.png`,
      ),
    });
  });
}
