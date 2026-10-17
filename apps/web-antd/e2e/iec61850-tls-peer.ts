import type { ChildProcess } from 'node:child_process';

import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

/** Independent OpenSSL PKI; temporary private keys never enter evidence artifacts. */
export async function tlsFixture(directory: string) {
  const root = resolve(directory, 'mms-pki');
  await mkdir(root, { mode: 0o700 });
  const command = async (...args: string[]) => {
    await promisify(execFile)(
      process.env.NG_IEC61850_OPENSSL ?? 'openssl',
      args,
      { cwd: root, timeout: 10_000, maxBuffer: 64 * 1024 },
    );
  };
  await writeFile(resolve(root, 'index.txt'), '');
  await writeFile(resolve(root, 'serial'), '1000\n');
  await writeFile(resolve(root, 'crlnumber'), '1000\n');
  await mkdir(resolve(root, 'issued'));
  await writeFile(
    resolve(root, 'ca.conf'),
    `[ca]\ndefault_ca=authority\n[authority]\ndir=${root}\ndatabase=$dir/index.txt\nnew_certs_dir=$dir/issued\ncertificate=$dir/root.pem\nprivate_key=$dir/root-key.pem\nserial=$dir/serial\ncrlnumber=$dir/crlnumber\ndefault_md=sha256\ndefault_days=1\ndefault_crl_days=1\npolicy=names\ncrl_extensions=crl\n[names]\ncommonName=supplied\n[client]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:ied.example.test\n[crl]\nauthorityKeyIdentifier=keyid:always\n`,
  );
  const key = async (name: string) => {
    await command(
      'genpkey',
      '-algorithm',
      'EC',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-out',
      `${name}-key.pem`,
    );
    await chmod(resolve(root, `${name}-key.pem`), 0o600);
  };
  await key('root');
  await command(
    'req',
    '-new',
    '-x509',
    '-key',
    'root-key.pem',
    '-out',
    'root.pem',
    '-days',
    '2',
    '-subj',
    '/CN=MMS browser test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-addext',
    'subjectKeyIdentifier=hash',
  );
  for (const [name, role] of [
    ['server', 'server'],
    ['client', 'client'],
    ['rotated-client', 'client'],
    ['replacement-server', 'server'],
  ] as const) {
    await key(name);
    await command(
      'req',
      '-new',
      '-key',
      `${name}-key.pem`,
      '-out',
      `${name}.csr`,
      '-subj',
      `/CN=${name}`,
    );
    await command(
      'ca',
      '-config',
      'ca.conf',
      '-batch',
      '-notext',
      '-extensions',
      role,
      '-in',
      `${name}.csr`,
      '-out',
      `${name}.pem`,
    );
  }
  await command('ca', '-config', 'ca.conf', '-gencrl', '-out', 'root.crl');
  await writeFile(
    resolve(root, 'issuer.pem'),
    await readFile(resolve(root, 'root.pem')),
  );
  const reference = async (name: string) => {
    const path = resolve(root, name);
    return {
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    };
  };
  return {
    root,
    security: async (
      client: string,
      version: 'tls12' | 'tls13',
      crl = 'root.crl',
    ) => ({
      serverName: 'ied.example.test',
      clientCertificate: await reference(`${client}.pem`),
      privateKey: await reference(`${client}-key.pem`),
      trustAnchors: [await reference('root.pem')],
      revocationLists: [await reference(crl)],
      revocationIssuers: [await reference('issuer.pem')],
      versions: [version],
      materialCheckIntervalMs: 100,
      materialTimeoutMs: 1000,
    }),
    clientDer: async (name: string) =>
      new X509Certificate(await readFile(resolve(root, `${name}.pem`))).raw,
    revokeServer: async () => {
      await command('ca', '-config', 'ca.conf', '-revoke', 'server.pem');
      await command(
        'ca',
        '-config',
        'ca.conf',
        '-gencrl',
        '-out',
        'revoked.crl',
      );
    },
  };
}

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing owned MMS port');
  server.close();
  await once(server, 'close');
  return address.port;
}

/** Join actual peer termination, including forced cleanup on a failing test. */
async function stopPeer(peer: ChildProcess) {
  if (peer.exitCode !== null || peer.signalCode !== null) {
    if (peer.exitCode !== 0)
      throw new Error('Independent MMS peer exited unexpectedly');
    return;
  }
  const exited = once(peer, 'exit');
  peer.kill('SIGTERM');
  const timer = new AbortController();
  try {
    const status = await Promise.race([
      exited,
      delay(5000, undefined, { signal: timer.signal }).then(async () => {
        peer.kill('SIGKILL');
        await exited;
        throw new Error('Independent MMS peer required forced shutdown');
      }),
    ]);
    if (status[0] !== 0)
      throw new Error('Independent MMS peer shutdown failed');
  } finally {
    timer.abort();
  }
}

/** Fixed libIEC61850 and Mbed TLS own the same native TLS/MMS association. */
export async function tlsMmsPeer(root: string) {
  const binary = process.env.NG_IEC61850_NATIVE_TLS_PEER;
  if (!binary) throw new Error('Missing fixed independent native TLS/MMS peer');
  const endpoint = await port();
  const authenticated: { fingerprint: string; protocol: string }[] = [];
  const failures: string[] = [];
  let peer: ChildProcess | undefined;
  async function start(binary: string, identity: string, crl: string) {
    const child = spawn(
      binary,
      [
        'ed21',
        String(endpoint),
        'no-data-reference',
        resolve(root, `${identity}.pem`),
        resolve(root, `${identity}-key.pem`),
        resolve(root, 'root.pem'),
        resolve(root, crl),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    peer = child;
    let pending = '';
    let output = '';
    const state = { started: false };
    let spawnError: Error | undefined;
    child.once('error', (error) => {
      spawnError = error;
    });
    child.stdout?.on('data', (bytes) => {
      const text = String(bytes);
      output = (output + text).slice(-64 * 1024);
      pending += text;
      if (pending.length > 128 * 1024) {
        failures.push('native-event-bound');
        child.kill('SIGTERM');
        return;
      }
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line === 'READY') state.started = true;
        const event = /^TLS_AUTH=(TLS [13]\.[23]):([a-f0-9]+)$/.exec(line);
        if (event?.[1] && event[2]) {
          if (authenticated.length >= 256) {
            failures.push('native-session-bound');
            child.kill('SIGTERM');
            return;
          }
          authenticated.push({
            fingerprint: createHash('sha256')
              .update(Buffer.from(event[2], 'hex'))
              .digest('hex'),
            protocol: event[1].replace('TLS ', 'TLSv'),
          });
        } else if (line.startsWith('TLS_EVENT=') && failures.length < 256) {
          failures.push(line);
        }
        newline = pending.indexOf('\n');
      }
    });
    child.stderr?.on('data', (bytes) => {
      output = (output + String(bytes)).slice(-64 * 1024);
    });
    const deadline = Date.now() + 5000;
    try {
      while (!state.started) {
        if (spawnError) throw spawnError;
        if (
          child.exitCode !== null ||
          child.signalCode !== null ||
          Date.now() >= deadline
        )
          throw new Error(`Independent native TLS startup failed: ${output}`);
        await delay(10);
      }
    } catch (error) {
      if (!spawnError) await stopPeer(child);
      throw error;
    }
  }
  await start(binary, 'server', 'root.crl');
  return {
    port: endpoint,
    authenticated,
    failures,
    stop: async () => {
      if (peer) await stopPeer(peer);
    },
    rotateServer: async () => {
      if (!peer) throw new Error('Native TLS server owner missing');
      await stopPeer(peer);
      await start(binary, 'replacement-server', 'revoked.crl');
    },
  };
}
