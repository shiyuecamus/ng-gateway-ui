import type { APIRequestContext } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { test as base, expect } from '@playwright/test';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const uiStore = resolve(
  process.env.NG_UI_ARTIFACT_STORE ?? resolve(workspaceRoot, 'target/e2e-ui'),
);

/** A fresh real binary, SQLite database and production UI for each journey. */
export interface Gateway {
  origin: string;
  directory: string;
  bootstrapPassword: string;
  restart: (trustEnvironment?: BrokerTrustEnvironment) => Promise<void>;
}

interface BrokerTrustEnvironment {
  file?: string;
  directory?: string;
}

function nativeArtifactDirectory() {
  const directory = process.env.NG_TEST_NATIVE_ARTIFACT_DIR;
  if (!directory) {
    throw new Error(
      'Set NG_TEST_NATIVE_ARTIFACT_DIR to a published xtask cohort or run pnpm test:e2e',
    );
  }
  return resolve(directory);
}

async function nativeArtifact(name: string) {
  const suffix = process.platform === 'darwin' ? 'dylib' : 'so';
  const file = resolve(nativeArtifactDirectory(), `lib${name}.${suffix}`);
  await access(file);
  return file;
}

export async function initializeAdmin(
  request: APIRequestContext,
  gateway: Gateway,
) {
  async function login(password: string) {
    const response = await request.post(`${gateway.origin}/api/auth/login`, {
      headers: { 'X-Gateway-Contract': 'boot' },
      data: {
        username: 'system_admin',
        password,
        requestId: randomUUID(),
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    return body.data.token as string;
  }
  const bootstrap = await login(gateway.bootstrapPassword);
  const password = `Browser administrator ${randomUUID()}`;
  await api(request, gateway, bootstrap, 'PUT', '/auth/password', {
    oldPassword: gateway.bootstrapPassword,
    newPassword: password,
  });
  return { token: await login(password), password };
}

export async function installNativeArtifact(
  request: APIRequestContext,
  gateway: Gateway,
  token: string,
  kind: 'driver' | 'plugin',
  name: string,
) {
  const file = await nativeArtifact(name);
  const response = await request.post(`${gateway.origin}/api/${kind}/install`, {
    headers: {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${token}`,
    },
    multipart: {
      file: {
        name: basename(file),
        mimeType: 'application/octet-stream',
        buffer: await readFile(file),
      },
    },
  });
  expect(response.status(), `${kind} install: ${await response.text()}`).toBe(
    200,
  );
  const installed = await response.json();
  expect(installed.data).toBe(true);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error('Gateway exited before owned shutdown');
  }
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = new AbortController();
  try {
    const result = await Promise.race([
      exited,
      delay(15_000, undefined, { signal: timer.signal }).then(() => {
        child.kill('SIGKILL');
        throw new Error('Gateway did not confirm shutdown within 15 seconds');
      }),
    ]);
    expect(result[0], 'Gateway must join its owners before exiting').toBe(0);
  } finally {
    timer.abort();
  }
}

export const test = base.extend<{
  gateway: Gateway;
  controlLimits:
    | { maxRequestBytes: number; maxBindingBytes: number; maxPending: number }
    | undefined;
}>({
  controlLimits: [undefined, { option: true }],
  gateway: async ({ request, controlLimits }, use) => {
    const binary = resolve(nativeArtifactDirectory(), 'ng-gateway-bin');
    await access(binary);
    const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const platform =
      process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu';
    const validator = resolve(
      process.env.NG__GENERAL__ENGINEERING__VALIDATOR_PATH ??
        resolve(
          workspaceRoot,
          'target/xsd-validator',
          `${architecture}-${platform}`,
          'xmllint',
        ),
    );
    await access(validator);
    await access(resolve(uiStore, 'CURRENT'));
    const directory = await mkdtemp(resolve(tmpdir(), 'ng-auth-browser-'));
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('No test port');
    const port = address.port;
    listener.close();
    await once(listener, 'close');
    const config = resolve(directory, 'gateway.toml');
    const controlSection = controlLimits
      ? `[general.control]
max_request_bytes = ${controlLimits.maxRequestBytes}
max_binding_bytes = ${controlLimits.maxBindingBytes}
max_pending = ${controlLimits.maxPending}
`
      : '';
    await writeFile(
      config,
      `[general]
runtime_dir = ${JSON.stringify(directory)}
[general.capabilities]
max_pending = 1
${controlSection}[general.engineering]
validator_path = ${JSON.stringify(validator)}
[web]
host = "127.0.0.1"
port = ${port}
workers = 2
[web.ui]
enabled = true
mode = "filesystem"
filesystem_root = ${JSON.stringify(uiStore)}
[web.authentication]
request_timeout_ms = 15000
login_account_burst = 64
login_burst = 128
`,
    );
    const log = createWriteStream(resolve(directory, 'gateway.log'), {
      mode: 0o600,
    });
    const launch = (trust?: BrokerTrustEnvironment) => {
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('NG_')),
      );
      if (trust) {
        delete environment.SSL_CERT_FILE;
        delete environment.SSL_CERT_DIR;
        if (trust.file) environment.SSL_CERT_FILE = trust.file;
        if (trust.directory) environment.SSL_CERT_DIR = trust.directory;
      }
      return spawn(binary, ['--config', config], {
        cwd: directory,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    };
    let child = launch();
    function pipeLogs() {
      child.stdout?.pipe(log, { end: false });
      child.stderr?.pipe(log, { end: false });
    }
    pipeLogs();
    const origin = `http://127.0.0.1:${port}`;
    async function ready() {
      await expect
        .poll(
          async () => {
            if (child.exitCode !== null || child.signalCode !== null)
              throw new Error(`Gateway failed; log: ${directory}/gateway.log`);
            try {
              const response = await request.get(
                `${origin}/api/user/userinfo`,
                {
                  headers: { 'X-Gateway-Contract': 'boot' },
                  timeout: 500,
                },
              );
              return response.status();
            } catch {
              return 0;
            }
          },
          { timeout: 20_000 },
        )
        .toBe(401);
    }
    async function restart(trustEnvironment?: BrokerTrustEnvironment) {
      await stop(child);
      child = launch(trustEnvironment);
      pipeLogs();
      await ready();
    }
    let completed = false;
    try {
      await ready();
      const credential = JSON.parse(
        await readFile(
          resolve(
            directory,
            'data/ng-gateway.db.identity/bootstrap-admin.json',
          ),
          'utf8',
        ),
      );
      await use({
        origin,
        directory,
        bootstrapPassword: credential.password,
        restart,
      });
      completed = true;
    } finally {
      let shutdownConfirmed = false;
      try {
        if (
          completed ||
          (child.exitCode === null && child.signalCode === null)
        ) {
          await stop(child);
          shutdownConfirmed = true;
        }
      } finally {
        log.end();
        if (
          completed &&
          shutdownConfirmed &&
          test.info().status === test.info().expectedStatus
        ) {
          await rm(directory, { recursive: true });
        } else {
          console.warn(`Isolated gateway evidence retained in ${directory}`);
        }
      }
    }
  },
});

export async function api(
  request: APIRequestContext,
  gateway: Gateway,
  token: string,
  method: string,
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`${gateway.origin}/api${path}`, {
    method,
    data,
    headers: {
      'X-Gateway-Contract': 'boot',
      Authorization: `Bearer ${token}`,
      Origin: gateway.origin,
    },
  });
  const diagnostic =
    response.status() === 200
      ? `${method} ${path}`
      : `${method} ${path}: ${(await response.text()).slice(0, 1024)}`;
  expect(response.status(), diagnostic).toBe(200);
  const body = await response.json();
  return body.data;
}
