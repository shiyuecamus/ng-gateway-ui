import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  listener.close();
  await once(listener, 'close');
  return address.port;
}

test('operator views northward and southward public certificates from the real gateway', async ({
  page,
  gateway,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const headers = { 'X-Gateway-Contract': 'boot' };
  const { token: admin, password } = await initializeAdmin(request, gateway);

  await installNativeArtifact(
    request,
    gateway,
    admin,
    'driver',
    'ng_driver_opcua',
  );
  await installNativeArtifact(
    request,
    gateway,
    admin,
    'plugin',
    'ng_plugin_opcua_server',
  );
  const drivers = await api(request, gateway, admin, 'GET', '/driver/list');
  const driver = drivers.find(
    (item: { driverType: string }) => item.driverType === 'opcua',
  );
  const plugins = await api(request, gateway, admin, 'GET', '/plugin/list');
  const plugin = plugins.find(
    (item: { pluginType: string }) => item.pluginType === 'opcua-server',
  );
  expect(driver).toBeTruthy();
  expect(plugin).toBeTruthy();

  const serverPort = await freePort();
  const serverConfig = {
    bind_addr: `127.0.0.1:${serverPort}`,
    advertised_endpoints: [`opc.tcp://127.0.0.1:${serverPort}/`],
    application_uri: 'urn:ng:browser:server',
    product_uri: 'urn:ng:browser:product',
    namespace_uri: 'urn:ng:browser:points',
    trusted_client_certs: [],
    allow_no_security_endpoint: false,
    drop_policy: 'discard_oldest',
  };
  const queuePolicy = {
    latestCapacity: 10_000,
    latestMaxBytes: 32 * 1024 * 1024,
    deliveryMaxInFlight: 16,
    deliveryMaxPayloadBytes: 256 * 1024,
    deliveryTimeoutMs: 30_000,
    deliveryRetryMs: 1000,
  };
  await api(request, gateway, admin, 'POST', '/northward-app', {
    pluginId: plugin.id,
    name: 'browser-server',
    description: 'Real certificate browser peer',
    config: serverConfig,
    retryPolicy: {},
    queuePolicy,
  });
  const apps = await api(request, gateway, admin, 'GET', '/northward-app/list');
  const app = apps.find(
    (item: { name: string }) => item.name === 'browser-server',
  );
  expect(app).toBeTruthy();
  const serverResponse = await request.get(
    `${gateway.origin}/api/northward-app/${app.id}/opcua-server/certificate.der`,
    { headers: { ...headers, Authorization: `Bearer ${admin}` } },
  );
  expect(serverResponse.status()).toBe(200);
  const serverDer = await serverResponse.body();
  const whitespaceTailDer = Buffer.from(serverDer);
  whitespaceTailDer[whitespaceTailDer.length - 1] = 0x09;
  const binaryPreview = await request.post(
    `${gateway.origin}/api/certificate/preview`,
    {
      headers: { ...headers, Authorization: `Bearer ${admin}` },
      multipart: {
        file: {
          name: 'signature-tail.der',
          mimeType: 'application/pkix-cert',
          buffer: whitespaceTailDer,
        },
      },
    },
  );
  expect(binaryPreview.status(), 'DER signature octets must be preserved').toBe(
    200,
  );
  const binaryPreviewBody = await binaryPreview.json();
  expect(Buffer.from(binaryPreviewBody.data.derBase64, 'base64')).toEqual(
    whitespaceTailDer,
  );

  const channelConfig = {
    applicationName: 'browser-client',
    applicationUri: 'urn:ng:browser:client',
    url: `opc.tcp://127.0.0.1:${serverPort}/`,
    auth: { kind: 'anonymous' },
    securityPolicy: 3,
    securityMode: 3,
    trustedServerCerts: [serverDer.toString('base64')],
  };
  const channelBase = {
    driverId: driver.id,
    collectionType: 1,
    period: 1000,
    reportType: 0,
    connectionPolicy: {
      connectTimeoutMs: 1000,
      readTimeoutMs: 1000,
      writeTimeoutMs: 1000,
    },
  };
  await api(request, gateway, admin, 'POST', '/channel', {
    ...channelBase,
    name: 'browser-secure-client',
    driverConfig: channelConfig,
  });
  await api(request, gateway, admin, 'POST', '/channel', {
    ...channelBase,
    name: 'browser-none-client',
    driverConfig: {
      ...channelConfig,
      applicationName: 'browser-none',
      applicationUri: 'urn:ng:browser:none',
      securityPolicy: 0,
      securityMode: 1,
      trustedServerCerts: [],
    },
  });
  const channels = await api(request, gateway, admin, 'GET', '/channel/list');
  const secure = channels.find(
    (item: { name: string }) => item.name === 'browser-secure-client',
  );
  const noSecurity = channels.find(
    (item: { name: string }) => item.name === 'browser-none-client',
  );
  expect(secure).toBeTruthy();
  expect(noSecurity).toBeTruthy();
  const secureIdentity = await api(
    request,
    gateway,
    admin,
    'GET',
    `/channel/${secure.id}/opcua-client/certificate`,
  );
  const clientDer = Buffer.from(secureIdentity.certificate.derBase64, 'base64');
  expect(createHash('sha256').update(clientDer).digest('hex')).toBe(
    secureIdentity.certificate.sha256Hex,
  );

  await page.goto(`${gateway.origin}/#/auth/login`);
  await page
    .getByPlaceholder('请输入用户名', { exact: true })
    .fill('system_admin');
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'login', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);

  await page.goto(`${gateway.origin}/#/northward/app`);
  const appRow = page.locator('tr').filter({ hasText: 'browser-server' });
  await expect(appRow).toBeVisible();
  await appRow.locator('button[code="certificate"]').click();
  const serverDialog = page.getByRole('dialog');
  await expect(serverDialog.getByText('urn:ng:browser:server')).toBeVisible();
  await expect(
    serverDialog.getByTitle(
      createHash('sha256').update(serverDer).digest('hex'),
      { exact: true },
    ),
  ).toBeVisible();
  const serverDownload = page.waitForEvent('download');
  await serverDialog
    .getByRole('button', { name: '下载公钥证书（DER）' })
    .click();
  const serverFile = await serverDownload;
  expect(await readFile(await serverFile.path())).toEqual(serverDer);
  await serverDialog.getByRole('button', { name: /关\s*闭/ }).click();

  await appRow.locator('button[code="edit"]').click();
  const appDrawer = page.getByRole('dialog');
  await expect(appDrawer).toBeVisible();
  for (let step = 0; step < 3; step += 1) {
    await appDrawer.getByRole('button', { name: '下一步' }).click();
  }
  await expect(
    appDrawer.getByRole('button', { name: '上传并预览客户端证书' }),
  ).toBeVisible();
  await appDrawer.locator('input[type="file"]').setInputFiles({
    name: 'browser-client.der',
    mimeType: 'application/pkix-cert',
    buffer: clientDer,
  });
  await expect(page.getByText('确认信任客户端证书')).toBeVisible();
  await page
    .getByRole('button', { name: /确\s*认/ })
    .last()
    .click();
  await expect(page.getByText('证书已加入表单')).toBeVisible();
  await appDrawer.getByRole('button', { name: /提\s*交/ }).click();
  await expect(appDrawer).not.toBeVisible();
  const updatedApp = await api(
    request,
    gateway,
    admin,
    'GET',
    `/northward-app/detail/${app.id}`,
  );
  expect(updatedApp.desiredRevision).toBe('2');
  expect(updatedApp.config.trusted_client_certs).toContain(
    clientDer.toString('base64'),
  );
  await api(request, gateway, admin, 'POST', `/channel/${secure.id}/activate`, {
    expectedRevision: secure.configuration?.desiredRevision ?? '1',
  });
  await expect
    .poll(async () => {
      const channel = await api(
        request,
        gateway,
        admin,
        'GET',
        `/channel/detail/${secure.id}`,
      );
      return channel.connectionState?.phase;
    })
    .toBe('Connected');

  await page.goto(`${gateway.origin}/#/southward/channel`);
  const secureRow = page
    .locator('tr')
    .filter({ hasText: 'browser-secure-client' });
  await expect(secureRow).toBeVisible();
  await secureRow.locator('button[code="certificate"]').click();
  const clientDialog = page.getByRole('dialog');
  await expect(clientDialog.getByText('urn:ng:browser:client')).toBeVisible();
  await expect(
    clientDialog.getByTitle(secureIdentity.certificate.sha256Hex, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    clientDialog.getByText(secureIdentity.configurationRevision, {
      exact: true,
    }),
  ).toBeVisible();
  const clientDownload = page.waitForEvent('download');
  await clientDialog.getByRole('button', { name: '下载公钥 DER' }).click();
  const clientFile = await clientDownload;
  expect(await readFile(await clientFile.path())).toEqual(clientDer);
  await clientDialog.getByRole('button', { name: /关\s*闭/ }).click();

  const noneRow = page.locator('tr').filter({ hasText: 'browser-none-client' });
  await expect(noneRow).toBeVisible();
  await noneRow.locator('button[code="certificate"]').click();
  await expect(page.getByText('不使用 OPC UA 客户端应用证书')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载公钥 DER' })).toHaveCount(
    0,
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /关\s*闭/ })
    .click();

  const created = await api(request, gateway, admin, 'POST', '/channel', {
    ...channelBase,
    name: 'browser-upload-client',
    driverConfig: {
      ...channelConfig,
      applicationName: 'browser-upload-client',
      applicationUri: 'urn:ng:browser:upload-client',
      trustedServerCerts: [],
    },
  });
  expect(created).toBe(true);
  await page.reload();
  const uploadRow = page
    .locator('tr')
    .filter({ hasText: 'browser-upload-client' });
  await expect(uploadRow).toBeVisible();
  await uploadRow.locator('button[code="edit"]').click();
  const channelDrawer = page.getByRole('dialog');
  await expect(channelDrawer).toBeVisible();
  for (let step = 0; step < 2; step += 1) {
    await channelDrawer.getByRole('button', { name: '下一步' }).click();
  }
  await expect(
    channelDrawer.getByRole('button', {
      name: '上传并预览设备证书',
    }),
  ).toBeVisible();
  const [previewResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/certificate/preview') &&
        response.request().method() === 'POST',
      { timeout: 15_000 },
    ),
    channelDrawer.locator('input[type="file"]').setInputFiles({
      name: 'server.der',
      mimeType: 'application/pkix-cert',
      buffer: serverDer,
    }),
  ]);
  expect(
    previewResponse.status(),
    `Server certificate preview response: ${await previewResponse.text()}`,
  ).toBe(200);
  await expect(page.getByText('确认信任设备证书')).toBeVisible();
  await page
    .getByRole('button', { name: /确\s*认/ })
    .last()
    .click();
  await expect(page.getByText('证书已加入表单')).toBeVisible();
  await channelDrawer.getByRole('button', { name: /提\s*交/ }).click();
  await expect(channelDrawer).not.toBeVisible();
  const updatedChannels = await api(
    request,
    gateway,
    admin,
    'GET',
    '/channel/list',
  );
  const uploaded = updatedChannels.find(
    (item: { name: string }) => item.name === 'browser-upload-client',
  );
  expect(uploaded.driverConfig.trustedServerCerts).toContain(
    serverDer.toString('base64'),
  );
  expect(errors).toEqual([]);
});
