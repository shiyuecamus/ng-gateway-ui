import type { Page } from '@playwright/test';

import type { Gateway } from './gateway';

import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect } from '@playwright/test';

import { api, test } from './gateway';

function observeMetrics(page: Page) {
  const streams: Array<{
    acknowledged: Set<string>;
    closed: boolean;
    received: Set<string>;
  }> = [];
  page.on('websocket', (socket) => {
    expect(new URL(socket.url()).search).toBe('');
    if (!socket.url().endsWith('/api/ws/metrics')) return;
    const stream = {
      closed: false,
      received: new Set<string>(),
      acknowledged: new Set<string>(),
    };
    streams.push(stream);
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'batch') stream.received.add(message.sequence);
    });
    socket.on('framesent', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'ack') {
        expect(stream.received.has(message.sequence)).toBe(true);
        stream.acknowledged.add(message.sequence);
      }
    });
    socket.on('close', () => {
      stream.closed = true;
    });
  });
  return streams;
}

async function login(
  page: Page,
  gateway: Gateway,
  username: string,
  password: string,
) {
  await page.goto(`${gateway.origin}/#/auth/login`);
  await page.getByPlaceholder('请输入用户名', { exact: true }).fill(username);
  await page.getByPlaceholder('密码', { exact: true }).fill(password);
  const [result] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith('/api/auth/login') &&
        res.request().method() === 'POST',
      { timeout: 10_000 },
    ),
    page.getByRole('button', { name: 'login', exact: true }).click(),
  ]);
  expect(result.status()).toBe(200);
  const body = await result.json();
  return body.data.token as string;
}

async function changePassword(
  page: Page,
  oldPassword: string,
  password: string,
) {
  await expect(
    page.getByRole('heading', { name: '修改登录密码' }),
  ).toBeVisible();
  await page.getByLabel(/当前密码$/).fill(oldPassword);
  await page.getByLabel(/新密码$/).fill(password);
  await page.getByLabel(/确认密码$/).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith('/api/auth/password') &&
        res.request().method() === 'PUT',
      { timeout: 10_000 },
    ),
    page.getByRole('button', { name: '保存并重新登录' }).click(),
  ]);
  expect(
    response.status(),
    'Password change must be confirmed by the gateway',
  ).toBe(200);
  await expect(page).toHaveURL(/\/auth\/login/);
}

test('bootstrap, profile editing, role assignment, stream revocation and logout use the real gateway', async ({
  page,
  gateway,
  request,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const password = `Browser admin ${randomUUID()}`;
  const oldToken = await login(
    page,
    gateway,
    'system_admin',
    gateway.bootstrapPassword,
  );
  await expect(page).toHaveURL(/\/auth\/password/);
  await page.reload();
  await changePassword(page, gateway.bootstrapPassword, password);
  await expect(
    access(
      resolve(
        gateway.directory,
        'data/ng-gateway.db.identity/bootstrap-admin.json',
      ),
    ),
  ).rejects.toThrow();
  const revoked = await request.get(`${gateway.origin}/api/user/userinfo`, {
    headers: {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${oldToken}`,
    },
  });
  expect(revoked.status()).toBe(401);
  const admin = await login(page, gateway, 'system_admin', password);
  await expect(page).toHaveURL(/\/home/);
  const initialHistory = await api(
    request,
    gateway,
    admin,
    'GET',
    '/control/operations?audience=mine&unresolvedOnly=true',
  );
  expect(initialHistory).toEqual({ items: [], nextCursor: null });
  expect(
    await api(
      request,
      gateway,
      admin,
      'GET',
      '/control/operations?audience=all',
    ),
  ).toEqual({ items: [], nextCursor: null });
  const rejectedHistory = await request.get(
    `${gateway.origin}/api/control/operations?audience=all`,
    { headers: { 'X-Gateway-Contract': 'boot' } },
  );
  expect(rejectedHistory.status()).toBe(401);
  const unboundedHistory = await request.get(
    `${gateway.origin}/api/control/operations?limit=101`,
    {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${admin}`,
      },
    },
  );
  expect(unboundedHistory.status()).toBe(400);
  await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
  await expect(page.getByText('操作历史与未决记录')).toBeVisible();
  await expect(page.getByText('当前筛选条件下没有操作记录。')).toBeVisible();
  await page.goto(`${gateway.origin}/#/system/user`);
  await page.getByRole('button', { name: /创建\s*用户/ }).click();
  const drawer = page.getByRole('dialog');
  const viewerPassword = `Browser viewer ${randomUUID()}`;
  await drawer.getByLabel(/用户名$/).fill('browser_viewer');
  await drawer.getByLabel(/昵称$/).fill('Browser Viewer');
  await drawer.getByLabel(/^\*?\s*密码$/).fill(viewerPassword);
  await drawer.getByLabel(/邮箱$/).fill('viewer@example.test');
  await drawer.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(drawer).not.toBeVisible();
  const row = page.locator('tr').filter({ hasText: 'browser_viewer' });
  await expect(row).toBeVisible();
  const users = await api(request, gateway, admin, 'GET', '/user/list');
  const user = users.find(
    (candidate: { username: string }) =>
      candidate.username === 'browser_viewer',
  );
  expect(user).toBeTruthy();
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  await drawer.getByLabel(/邮箱$/).fill('');
  await drawer.getByLabel(/昵称$/).fill('Browser Viewer Edited');
  await drawer.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(drawer).not.toBeVisible();
  const profile = await api(
    request,
    gateway,
    admin,
    'GET',
    `/user/detail/${user.id}`,
  );
  expect(profile.email).toBeNull();
  expect(profile.nickname).toBe('Browser Viewer Edited');

  await api(request, gateway, admin, 'POST', '/role', {
    name: 'Browser Metrics',
    code: 'BROWSER_METRICS',
    type: 1,
  });
  const roles = await api(request, gateway, admin, 'GET', '/role/list');
  const role = roles.find(
    (candidate: { code: string }) => candidate.code === 'BROWSER_METRICS',
  );
  await api(request, gateway, admin, 'PUT', `/role/${role.id}/permissions`, [
    { kind: 'scope', resource: 'metrics:read', operation: 'access' },
    { kind: 'scope', resource: 'metrics:global', operation: 'access' },
  ]);
  await row.getByRole('button', { name: '分配角色', exact: true }).click();
  await drawer.getByRole('combobox').click();
  await page.getByTitle('Browser Metrics', { exact: true }).click();
  await drawer.getByRole('button', { name: /^确\s*认$/ }).click();
  await expect(drawer).not.toBeVisible();
  expect(
    await api(request, gateway, admin, 'GET', `/user/${user.id}/roles`),
  ).toEqual([role.id]);

  const viewerContext = await browser.newContext({ locale: 'zh-CN' });
  try {
    // The existing menu model assigns navigation independently of API scopes.
    // Grant a navigation-bearing role for login, then revoke it while the page is live.
    const administrator = roles.find(
      (candidate: { code: string }) => candidate.code === 'SYSTEM_ADMIN',
    );
    await api(request, gateway, admin, 'PUT', `/user/${user.id}/roles`, [
      role.id,
      administrator.id,
    ]);
    const viewerPage = await viewerContext.newPage();
    const streams = observeMetrics(viewerPage);
    viewerPage.on('pageerror', (error) => errors.push(error.message));
    await login(viewerPage, gateway, 'browser_viewer', viewerPassword);
    const changedViewerPassword = `Changed viewer ${randomUUID()}`;
    await changePassword(viewerPage, viewerPassword, changedViewerPassword);
    const viewer = await login(
      viewerPage,
      gateway,
      'browser_viewer',
      changedViewerPassword,
    );
    await expect(viewerPage).toHaveURL(/\/home/);
    await expect
      .poll(() => streams.at(-1)?.acknowledged.size ?? 0)
      .toBeGreaterThan(1);
    await expect(
      viewerPage.getByText('实时连接正常', { exact: false }),
    ).toBeVisible();
    await api(request, gateway, admin, 'PUT', `/user/${user.id}/roles`, [
      role.id,
    ]);
    const deniedControlHistory = await request.get(
      `${gateway.origin}/api/control/operations?audience=all`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${viewer}`,
        },
      },
    );
    expect(deniedControlHistory.status()).toBe(403);
    const monitor = await request.post(`${gateway.origin}/api/auth/ws-ticket`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${viewer}`,
        Origin: gateway.origin,
      },
      data: { endpoint: 'monitor' },
    });
    expect(monitor.status()).toBe(403);

    await row.getByRole('button', { name: '分配角色', exact: true }).click();
    await expect(drawer.locator('.ant-select-selection-item')).toHaveCount(1);
    await drawer.locator('.ant-select-selection-item-remove').click();
    await drawer.getByRole('button', { name: /^确\s*认$/ }).click();
    await expect(drawer).not.toBeVisible();
    await expect
      .poll(() => streams.every((stream) => stream.closed))
      .toBe(true);
    await expect(
      viewerPage.getByText('实时连接正常', { exact: false }),
    ).not.toBeVisible();
    await expect(
      viewerPage.locator('div.h-3.w-3.rounded-full'),
    ).not.toHaveClass(/bg-emerald-400/);
    const denied = await request.post(`${gateway.origin}/api/auth/ws-ticket`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${viewer}`,
        Origin: gateway.origin,
      },
      data: { endpoint: 'metrics' },
    });
    expect(denied.status()).toBe(403);

    await row.getByRole('button', { name: '分配角色', exact: true }).click();
    await drawer.getByRole('combobox').click();
    await page.getByTitle('系统管理员', { exact: true }).click();
    await drawer.getByRole('button', { name: /^确\s*认$/ }).click();
    await expect(drawer).not.toBeVisible();
    await viewerPage.reload();
    await expect
      .poll(() => streams.at(-1)?.acknowledged.size ?? 0)
      .toBeGreaterThan(1);
    await expect(
      viewerPage.getByText('实时连接正常', { exact: false }),
    ).toBeVisible();

    // Existing session identity remains valid after scope revocation; logout must revoke it.
    await viewerPage
      .locator('header button[aria-haspopup="menu"]')
      .filter({ has: viewerPage.locator('.size-8') })
      .click();
    await viewerPage.getByRole('menuitem', { name: /退出登录/ }).click();
    await viewerPage
      .getByRole('dialog')
      .getByRole('button', { name: /^确\s*认$/ })
      .click();
    await expect(viewerPage).toHaveURL(/\/auth\/login/);
    const loggedOut = await request.get(`${gateway.origin}/api/user/userinfo`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${viewer}`,
      },
    });
    expect(loggedOut.status()).toBe(401);
  } finally {
    await viewerContext.close();
  }
  expect(errors).toEqual([]);
});
