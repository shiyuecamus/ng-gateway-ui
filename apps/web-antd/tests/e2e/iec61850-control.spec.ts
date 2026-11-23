import type { ChildProcess } from 'node:child_process';
import type { Socket } from 'node:net';

import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const peerBinary = process.env.NG_IEC61850_CONTROL_PEER_BIN;
const peerSource = process.env.NG_IEC61850_PEER_SOURCE;
// ASN.1 context tags for MMS confirmed-request and confirmed-response PDUs.
const confirmedRequestTag = 160;
const confirmedResponseTag = 161;
const readServiceTag = 164;
const writeServiceTag = 165;
test.skip(
  !peerBinary || !peerSource,
  'Requires the fixed-commit independent libIEC61850 control peer',
);

async function reservePort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('No peer port');
  reservation.close();
  await once(reservation, 'close');
  return address.port;
}

function confirmedMms(
  frame: Buffer,
):
  | undefined
  | { invokeId: number; kind: 'request' | 'response'; serviceTag: number } {
  const matches: Array<{
    invokeId: number;
    kind: 'request' | 'response';
    serviceTag: number;
  }> = [];
  for (let start = 4; start + 4 < frame.length; start++) {
    const tag = frame[start];
    if (tag !== confirmedRequestTag && tag !== confirmedResponseTag) continue;
    const lengthByte = frame[start + 1];
    if (lengthByte === undefined) continue;
    let length = 0;
    let content = start + 2;
    if (lengthByte < 128) {
      length = lengthByte;
    } else {
      const count = lengthByte & 127;
      if (count === 0 || count > 3 || content + count >= frame.length) continue;
      length = frame.readUIntBE(content, count);
      content += count;
    }
    if (content + length !== frame.length || frame[content] !== 2) continue;
    const invokeBytes = frame[content + 1];
    if (
      invokeBytes === undefined ||
      invokeBytes === 0 ||
      invokeBytes > 4 ||
      content + 2 + invokeBytes > frame.length
    )
      continue;
    const invokeId = frame.readUIntBE(content + 2, invokeBytes);
    if (invokeId === 0) continue;
    const serviceTag = frame[content + 2 + invokeBytes];
    if (serviceTag === undefined) continue;
    matches.push({
      invokeId,
      kind: tag === confirmedRequestTag ? 'request' : 'response',
      serviceTag,
    });
  }
  if (matches.length > 1)
    throw new Error('Ambiguous confirmed MMS PDU in one TPKT frame');
  return matches[0];
}

async function stopPeer(peer: ChildProcess): Promise<void> {
  if (peer.exitCode !== null || peer.signalCode !== null) return;
  const exited = once(peer, 'exit');
  peer.kill('SIGTERM');
  const timer = new AbortController();
  try {
    await Promise.race([
      exited,
      delay(5000, undefined, { signal: timer.signal }).then(() => {
        peer.kill('SIGKILL');
        throw new Error('Independent control peer did not confirm shutdown');
      }),
    ]);
  } finally {
    timer.abort();
  }
}

async function startPeer(mode: string, port: number): Promise<ChildProcess> {
  if (!peerBinary) throw new Error('Missing independent control peer binary');
  const peer = spawn(peerBinary, [mode, 'ed2', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  peer.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  const timer = new AbortController();
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        let output = '';
        peer.stdout?.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('READY\n')) resolve();
        });
        peer.once('exit', (code) =>
          reject(new Error(`Control peer exited early: ${code} ${errors}`)),
        );
      }),
      delay(5000, undefined, { signal: timer.signal }).then(() => {
        throw new Error(`Control peer did not become ready: ${errors}`);
      }),
    ]);
    return peer;
  } catch (error) {
    await stopPeer(peer);
    throw error;
  } finally {
    timer.abort();
  }
}

async function relayFrames(
  source: Socket,
  target: Socket,
  beforeForward: (frame: Buffer) => Promise<boolean>,
): Promise<void> {
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of source) {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4) {
        const length = pending.readUInt16BE(2);
        if (pending[0] !== 3 || length < 4)
          throw new Error('Invalid TPKT from independent control peer');
        if (pending.length < length) break;
        const frame = pending.subarray(0, length);
        pending = pending.subarray(length);
        if (!(await beforeForward(frame))) continue;
        if (target.destroyed) return;
        await writeFrame(target, frame);
      }
    }
  } catch (error) {
    if (
      source.destroyed &&
      target.destroyed &&
      (error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE'
    )
      return;
    throw error;
  }
  if (pending.length > 0) throw new Error('Truncated independent peer TPKT');
  target.end();
}

async function writeFrame(target: Socket, frame: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    target.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}

async function startCancelProxy(peerPort: number): Promise<{
  readonly associationCount: number;
  readonly cancelRequestCount: number;
  delayNextCancel: (milliseconds: number) => void;
  dropNextCancelResponse: () => void;
  readonly droppedCancelResponses: number;
  readonly healthReadsWhileCancelHeld: number;
  readonly heldCancelResponses: number;
  readonly heldSelectionResponses: number;
  holdNextSelection: () => void;
  readonly operateRequestCount: number;
  port: number;
  releaseSelection: () => Promise<void>;
  resumeReconnects: () => void;
  stop: () => Promise<void>;
  suspendReconnects: () => void;
}> {
  const sockets = new Set<Socket>();
  const tasks = new Set<Promise<void>>();
  const delayedWrites = new Set<Promise<void>>();
  const delayStop = new AbortController();
  let nextCancelDelayMs = 0;
  let dropNextCancelResponse = false;
  let droppedCancelResponses = 0;
  let heldCancelResponses = 0;
  let healthReadsWhileCancelHeld = 0;
  let associationCount = 0;
  let operateRequestCount = 0;
  let cancelRequestCount = 0;
  let holdNextSelection = false;
  let heldSelectionResponses = 0;
  let heldSelection: undefined | { client: Socket; frame: Buffer };
  let reconnectsSuspended = false;
  let stopped = false;
  let failure: Error | undefined;
  const proxy = createServer((client) => {
    associationCount += 1;
    if (reconnectsSuspended) {
      client.destroy();
      return;
    }
    const upstream = connect(peerPort, '127.0.0.1');
    sockets.add(client);
    sockets.add(upstream);
    let pendingResponseDelayMs = 0;
    let pendingResponseDrop = false;
    let pendingCancelInvoke: number | undefined;
    let pendingSelectionInvoke: number | undefined;
    let intentionalDisconnect = false;
    const fail = (error: unknown) => {
      if (!stopped && !intentionalDisconnect && !failure)
        failure = error instanceof Error ? error : new Error(String(error));
      client.destroy();
      upstream.destroy();
    };
    client.on('error', fail);
    upstream.on('error', fail);
    client.on('close', () => {
      sockets.delete(client);
      upstream.destroy();
    });
    upstream.on('close', () => {
      sockets.delete(upstream);
      client.destroy();
    });
    const task = Promise.all([
      relayFrames(client, upstream, async (frame) => {
        const confirmed = confirmedMms(frame);
        if (
          confirmed?.kind === 'request' &&
          confirmed.serviceTag === writeServiceTag &&
          frame.includes(Buffer.from('$Oper'))
        )
          operateRequestCount += 1;
        if (
          holdNextSelection &&
          confirmed?.kind === 'request' &&
          ((confirmed.serviceTag === readServiceTag &&
            frame.includes(Buffer.from('$SBO'))) ||
            (confirmed.serviceTag === writeServiceTag &&
              frame.includes(Buffer.from('$SBOw'))))
        ) {
          if (pendingSelectionInvoke !== undefined || heldSelection)
            throw new Error('Selection response already retained');
          pendingSelectionInvoke = confirmed.invokeId;
          holdNextSelection = false;
        }
        if (
          confirmed?.kind === 'request' &&
          confirmed.serviceTag === readServiceTag &&
          frame.includes(Buffer.from('LLN0$RP$ControlEventsRCB01')) &&
          delayedWrites.size > 0
        )
          healthReadsWhileCancelHeld += 1;
        if (
          confirmed?.kind === 'request' &&
          confirmed.serviceTag === writeServiceTag &&
          frame.includes(Buffer.from('$Cancel'))
        ) {
          cancelRequestCount += 1;
          if (pendingCancelInvoke !== undefined)
            throw new Error('Cancel proxy already owns an invoke ID');
          pendingCancelInvoke = confirmed.invokeId;
          if (dropNextCancelResponse) {
            pendingResponseDrop = true;
            dropNextCancelResponse = false;
          } else if (nextCancelDelayMs) {
            pendingResponseDelayMs = nextCancelDelayMs;
            nextCancelDelayMs = 0;
          }
        }
        return true;
      }),
      relayFrames(upstream, client, async (frame) => {
        const confirmed = confirmedMms(frame);
        if (
          confirmed?.kind === 'response' &&
          confirmed.invokeId === pendingSelectionInvoke
        ) {
          if (
            heldSelection ||
            ![readServiceTag, writeServiceTag].includes(confirmed.serviceTag)
          )
            throw new Error('Selection response has another service or owner');
          heldSelection = { client, frame: Buffer.from(frame) };
          pendingSelectionInvoke = undefined;
          heldSelectionResponses += 1;
          return false;
        }
        if (
          confirmed?.kind !== 'response' ||
          confirmed.invokeId !== pendingCancelInvoke
        )
          return true;
        if (confirmed.serviceTag !== writeServiceTag)
          throw new Error('Cancel invoke ID received another MMS service');
        pendingCancelInvoke = undefined;
        if (pendingResponseDrop) {
          pendingResponseDrop = false;
          intentionalDisconnect = true;
          droppedCancelResponses += 1;
          client.destroy();
          upstream.destroy();
          return false;
        }
        if (pendingResponseDelayMs) {
          const milliseconds = pendingResponseDelayMs;
          pendingResponseDelayMs = 0;
          if (delayedWrites.size > 0)
            throw new Error('A Cancel response is already held by this proxy');
          const held = Buffer.from(frame);
          heldCancelResponses += 1;
          const write = delay(milliseconds, undefined, {
            signal: delayStop.signal,
          })
            .then(async () => {
              if (client.destroyed)
                throw new Error('Held Cancel response lost its association');
              await writeFrame(client, held);
            })
            .catch(fail);
          delayedWrites.add(write);
          void write.finally(() => delayedWrites.delete(write));
          return false;
        }
        return true;
      }),
    ]).then(() => undefined, fail);
    tasks.add(task);
    void task.finally(() => tasks.delete(task));
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (!address || typeof address === 'string')
    throw new Error('No Cancel proxy port');
  return {
    port: address.port,
    get associationCount() {
      return associationCount;
    },
    holdNextSelection() {
      if (heldSelection || holdNextSelection)
        throw new Error('Selection is already pending');
      holdNextSelection = true;
    },
    async releaseSelection() {
      const held = heldSelection;
      if (!held || held.client.destroyed)
        throw new Error('Retained selection lost its original association');
      heldSelection = undefined;
      await writeFrame(held.client, held.frame);
    },
    get heldSelectionResponses() {
      return heldSelectionResponses;
    },
    get cancelRequestCount() {
      return cancelRequestCount;
    },
    delayNextCancel(milliseconds) {
      if (milliseconds <= 0) throw new Error('Cancel delay must be positive');
      nextCancelDelayMs = milliseconds;
    },
    dropNextCancelResponse() {
      nextCancelDelayMs = 0;
      dropNextCancelResponse = true;
    },
    get droppedCancelResponses() {
      return droppedCancelResponses;
    },
    get heldCancelResponses() {
      return heldCancelResponses;
    },
    get healthReadsWhileCancelHeld() {
      return healthReadsWhileCancelHeld;
    },
    get operateRequestCount() {
      return operateRequestCount;
    },
    resumeReconnects() {
      reconnectsSuspended = false;
    },
    suspendReconnects() {
      reconnectsSuspended = true;
    },
    async stop() {
      stopped = true;
      delayStop.abort();
      for (const socket of sockets) socket.destroy();
      const closed = once(proxy, 'close');
      proxy.close();
      await closed;
      await Promise.allSettled([...tasks, ...delayedWrites]);
      if (failure) throw failure;
    },
  };
}

test('operator cancellation fences Operate and releases both selections on their original association', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  // Exercise the Web Crypto surface available to HTTP management away from localhost.
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: undefined,
    });
  });
  if (!peerSource) throw new Error('Missing independent control peer source');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const port = await reservePort();
  const peer = await startPeer('server-operator-cancel', port);
  const proxy = await startCancelProxy(port);
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
    const driver = drivers.find(
      (item: { driverType: string }) => item.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    await api(request, gateway, token, 'POST', '/channel', {
      name: 'iec-operator-cancel',
      driverId: driver.id,
      collectionType: 1,
      period: 500,
      reportType: 0,
      connectionPolicy: {
        connectTimeoutMs: 5000,
        readTimeoutMs: 30_000,
        writeTimeoutMs: 30_000,
      },
      driverConfig: {
        protocol: 'mms',
        transport: { kind: 'tcp', host: '127.0.0.1', port: proxy.port },
        association: {
          callingTransport: '0001',
          calledTransport: '0001',
          callingSession: '0001',
          calledSession: '0001',
          callingPresentation: '00000001',
          calledPresentation: '00000001',
        },
      },
    });
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (item: { name: string }) => item.name === 'iec-operator-cancel',
    );
    expect(channel).toBeTruthy();
    await api(request, gateway, token, 'POST', '/device', {
      channelId: channel.id,
      deviceName: 'Operator cancellation IED',
      deviceType: 'independent-peer',
      driverConfig: { logicalDevice: 'simpleIOGenericIO' },
    });
    const devices = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/${channel.id}/sub-devices`,
    );
    const device = devices.find(
      (item: { deviceName: string }) =>
        item.deviceName === 'Operator cancellation IED',
    );
    expect(device).toBeTruthy();
    for (const model of [2, 4]) {
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: `Operator SPCSO${model}`,
        key: `operator-spcso-${model}`,
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: `simpleIOGenericIO/GGIO1.SPCSO${model}`,
            expectedControlModel: model,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            sboClass: 'operateOnce',
            selectionTimeoutMs: 30_000,
            ...(model === 4 ? { terminationTimeoutMs: 5000 } : {}),
          },
        },
      });
    }
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const pointFor = (model: number) => {
      const point = points.find(
        (item: { key: string }) => item.key === `operator-spcso-${model}`,
      );
      expect(point).toBeTruthy();
      return point;
    };
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
            detail.configuration.appliedRevision ===
              detail.configuration.desiredRevision
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
        label: 'Fixed operator cancellation IED',
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
        reason: 'Independent selection and Cancel peer verified',
        evidence: { commit, port },
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
        reason: 'Bind original selected CO objects',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'Both selected control models and timeout verified online',
        evidence: { objects: [2, 4], selectionTimeoutMs: 30_000, commit },
      },
    );
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    const completed: Array<{
      cancellation: unknown;
      events: unknown[];
      id: string;
    }> = [];
    for (const [index, model] of [2, 4].entries()) {
      proxy.holdNextSelection();
      const intent = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        pointId: pointFor(model).id,
        value: true,
        idempotencyKey: randomUUID(),
        timeoutMs: 30_000,
      };
      const receipt = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        intent,
      );
      const details = () =>
        api(
          request,
          gateway,
          token,
          'GET',
          `/control/operations/${receipt.operationId}`,
        );
      await expect.poll(() => proxy.heldSelectionResponses).toBe(index + 1);
      const before = await details();
      expect(before.operation.phase).toBe(
        model === 2 ? 'select' : 'selectWithValue',
      );
      expect(before.canCancel).toBe(true);
      const anonymous = await request.post(
        `${gateway.origin}/api/control/operations/${receipt.operationId}/cancel`,
        {
          headers: { 'X-Gateway-Contract': 'boot' },
          data: {
            expectedFingerprint: before.operation.fingerprint,
            idempotencyKey: randomUUID(),
            reason: 'Unauthenticated cancellation must be denied',
          },
        },
      );
      expect(anonymous.status()).toBe(401);
      const wrongTarget = await request.post(
        `${gateway.origin}/api/control/operations/${receipt.operationId}/cancel`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: {
            expectedFingerprint: 'f'.repeat(64),
            idempotencyKey: randomUUID(),
            reason: 'Another original target must be denied',
          },
        },
      );
      expect(wrongTarget.status()).toBe(409);
      const afterDenied = await details();
      expect(afterDenied.operation.cancellation).toBeNull();
      expect(afterDenied.events).toEqual(before.events);
      await page
        .getByPlaceholder('操作 ID', { exact: true })
        .fill(receipt.operationId);
      await page.getByRole('button', { name: '查询操作', exact: true }).click();
      const form = page.getByRole('region', {
        name: '取消原控制操作',
        exact: true,
      });
      await expect(form).toBeVisible();
      const submit = form.getByRole('button', {
        name: '确认并请求取消',
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await form.getByRole('checkbox').check();
      const reasonInput = form.getByRole('textbox', {
        name: '取消理由',
        exact: true,
      });
      await reasonInput.fill('中'.repeat(171));
      await expect(submit).toBeDisabled();
      await expect(
        form.getByText(
          '取消理由须为 1 至 512 个 UTF-8 字节，且不能包含控制字符。',
          { exact: true },
        ),
      ).toBeVisible();
      const afterInvalidReason = await details();
      expect(afterInvalidReason.operation.cancellation).toBeNull();
      expect(afterInvalidReason.events).toEqual(before.events);
      const reason = `Operator cancels original SPCSO${model} selection`;
      await reasonInput.fill(reason);
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect
        .poll(async () => {
          const detail = await details();
          return detail.operation.cancellation?.reason;
        })
        .toBe(reason);
      const recorded = await details();
      expect(recorded.operation.state).toBe('dispatching');
      expect(recorded.operation.phase).toBe(
        model === 2 ? 'select' : 'selectWithValue',
      );
      expect(recorded.operation.fingerprint).toBe(before.operation.fingerprint);
      const requestIdentity = {
        expectedFingerprint: before.operation.fingerprint,
        idempotencyKey: recorded.operation.cancellation.idempotencyKey,
        reason,
      };
      const originalAssociations = proxy.associationCount;
      proxy.delayNextCancel(1500);
      await proxy.releaseSelection();
      await expect.poll(() => proxy.heldCancelResponses).toBe(index + 1);
      const occupied = await request.post(`${gateway.origin}/api/point/write`, {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: { ...intent, idempotencyKey: randomUUID() },
      });
      expect(occupied.status()).toBe(409);
      const cancelPending = await details();
      expect(cancelPending.operation.state).toBe('dispatching');
      await expect
        .poll(async () => {
          const detail = await details();
          return detail.operation.state;
        })
        .toBe('cancelled');
      await expect
        .poll(async () => {
          const detail = await details();
          return detail.events.at(-1)?.completionFingerprint;
        })
        .toEqual(expect.any(String));
      const finished = await details();
      expect(
        finished.events
          .filter(
            (event: { cancellation: unknown; phase: string; state: string }) =>
              event.state === 'dispatching' && event.cancellation === null,
          )
          .map((event: { phase: string }) => event.phase),
      ).toEqual([model === 2 ? 'select' : 'selectWithValue', 'cancel']);
      expect(
        finished.events.some(
          (event: {
            evidence: null | { service?: string };
            phase: string;
            state: string;
          }) =>
            event.phase === 'cancel' &&
            event.state === 'cancelled' &&
            event.evidence?.service === 'CancelAccepted',
        ),
      ).toBe(true);
      expect(
        finished.events.filter(
          (event: { cancellation: unknown }) => event.cancellation !== null,
        ),
      ).toHaveLength(1);
      expect(finished.canCancel).toBe(false);
      expect(proxy.operateRequestCount).toBe(0);
      expect(proxy.cancelRequestCount).toBe(index + 1);
      expect(proxy.associationCount).toBe(originalAssociations);
      const replayResponse = await request.post(
        `${gateway.origin}/api/control/operations/${receipt.operationId}/cancel`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: requestIdentity,
        },
      );
      expect(replayResponse.status()).toBe(202);
      const replayBody = await replayResponse.json();
      const replay = replayBody.data;
      expect(replay.operationId).toBe(receipt.operationId);
      expect(replay.cancellation).toEqual(finished.operation.cancellation);
      const afterReplay = await details();
      expect(afterReplay.events).toEqual(finished.events);
      const conflict = await request.post(
        `${gateway.origin}/api/control/operations/${receipt.operationId}/cancel`,
        {
          headers: {
            'X-Gateway-Contract': 'boot',
            Authorization: `Bearer ${token}`,
          },
          data: { ...requestIdentity, reason: 'Changed cancellation reason' },
        },
      );
      expect(conflict.status()).toBe(409);
      const duplicate = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        intent,
      );
      expect(duplicate.operationId).toBe(receipt.operationId);
      expect(proxy.operateRequestCount).toBe(0);
      await expect(
        page.getByRole('region', { name: '取消请求记录', exact: true }),
      ).toBeVisible();
      completed.push({
        id: receipt.operationId,
        cancellation: finished.operation.cancellation,
        events: finished.events,
      });
    }
    await page.screenshot({
      path: test.info().outputPath('operator-cancel-confirmed.png'),
      fullPage: true,
    });
    await gateway.restart();
    for (const original of completed) {
      const restored = await api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${original.id}`,
      );
      expect(restored.operation.state).toBe('cancelled');
      expect(restored.operation.cancellation).toEqual(original.cancellation);
      expect(restored.events).toEqual(original.events);
      expect(restored.canCancel).toBe(false);
    }
    await page.reload();
    const restoredId = completed.at(-1)?.id;
    if (!restoredId)
      throw new Error('Original cancellation evidence is absent');
    await page.getByPlaceholder('操作 ID', { exact: true }).fill(restoredId);
    await page.getByRole('button', { name: '查询操作', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '取消请求记录', exact: true }),
    ).toBeVisible();
    expect(proxy.operateRequestCount).toBe(0);
    expect(proxy.cancelRequestCount).toBe(2);
  } finally {
    try {
      await proxy.stop();
    } finally {
      await stopPeer(peer);
    }
  }
});

test('IEC CO control persists four models, negative evidence and operator history', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  if (!peerBinary || !peerSource)
    throw new Error('Missing independent control peer inputs');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const port = await reservePort();
  const peer = await startPeer('server', port);
  let delayedPeer: ChildProcess | undefined;
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
    const driver = drivers.find(
      (candidate: { driverType: string }) =>
        candidate.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'iec-control-loopback',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) =>
        candidate.name === 'iec-control-loopback',
    );
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'IEC control IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
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
        candidate.deviceName === 'IEC control IED',
    );
    expect(device).toBeTruthy();

    for (const model of [1, 2, 3, 4]) {
      const selected = model === 2 || model === 4;
      const enhanced = model === 3 || model === 4;
      expect(
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name: `SPCSO${model} control`,
          key: `spcso-${model}`,
          type: 0,
          dataType: 0,
          accessMode: 1,
          unit: null,
          minValue: null,
          maxValue: null,
          transformDataType: null,
          transformScale: null,
          transformOffset: null,
          transformNegate: false,
          driverConfig: {
            kind: 'control',
            configuration: {
              objectReference: `simpleIOGenericIO/GGIO1.SPCSO${model}`,
              expectedControlModel: model,
              originCategory: 3,
              originIdentifierHex: '6e672d67617465776179',
              synchronismCheck: false,
              interlockingCheck: false,
              test: false,
              ...(selected
                ? { sboClass: 'operateOnce', selectionTimeoutMs: 2000 }
                : {}),
              ...(enhanced ? { terminationTimeoutMs: 5000 } : {}),
            },
          },
        }),
      ).toBe(true);
    }
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const controlPoints = [1, 2, 3, 4].map((model) => {
      const point = points.find(
        (candidate: { key: string }) => candidate.key === `spcso-${model}`,
      );
      expect(point).toBeTruthy();
      return point;
    });
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
      { authorityId, label: 'Fixed libIEC61850 CO peer' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed-commit local MMS CO peer verified',
        evidence: { commit, port },
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
        reason: 'Bind IEC CO objects to the verified peer',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'Four ctlModel and CO types verified online',
        evidence: { objects: [1, 2, 3, 4], commit },
      },
    );

    const operationIds: string[] = [];
    for (const [index, point] of controlPoints.entries()) {
      const enhanced = index >= 2;
      const receipt = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          pointId: point.id,
          value: true,
          idempotencyKey: randomUUID(),
          timeoutMs: 6000,
        },
      );
      operationIds.push(receipt.operationId);
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
          { timeout: 10_000 },
        )
        .toBe(enhanced ? 'protocolSucceeded' : 'serviceAccepted');
    }
    for (const point of controlPoints.slice(2)) {
      const receipt = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          pointId: point.id,
          value: false,
          idempotencyKey: randomUUID(),
          timeoutMs: 6000,
        },
      );
      operationIds.push(receipt.operationId);
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
          { timeout: 10_000 },
        )
        .toBe('protocolRejected');
    }
    const history = await api(
      request,
      gateway,
      token,
      'GET',
      '/control/operations?audience=mine',
    );
    for (const operationId of operationIds) {
      expect(
        history.items.some(
          (operation: { operationId: string }) =>
            operation.operationId === operationId,
        ),
      ).toBe(true);
    }

    const delayedPort = await reservePort();
    delayedPeer = await startPeer('server-delayed', delayedPort);
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'iec-delayed-control-loopback',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port: delayedPort },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const delayedChannels = await api(
      request,
      gateway,
      token,
      'GET',
      '/channel/list',
    );
    const delayedChannel = delayedChannels.find(
      (candidate: { name: string }) =>
        candidate.name === 'iec-delayed-control-loopback',
    );
    expect(delayedChannel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: delayedChannel.id,
        deviceName: 'IEC delayed control IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
      }),
    ).toBe(true);
    const delayedDevices = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/${delayedChannel.id}/sub-devices`,
    );
    const delayedDevice = delayedDevices.find(
      (candidate: { deviceName: string }) =>
        candidate.deviceName === 'IEC delayed control IED',
    );
    expect(delayedDevice).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: delayedDevice.id,
        name: 'Delayed enhanced control',
        key: 'delayed-spcso-3',
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: 'simpleIOGenericIO/GGIO1.SPCSO3',
            expectedControlModel: 3,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            terminationTimeoutMs: 5000,
          },
        },
      }),
    ).toBe(true);
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: delayedDevice.id,
        name: 'Delayed negative enhanced control',
        key: 'delayed-spcso-4',
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: 'simpleIOGenericIO/GGIO1.SPCSO4',
            expectedControlModel: 4,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            sboClass: 'operateOnce',
            selectionTimeoutMs: 2000,
            terminationTimeoutMs: 5000,
          },
        },
      }),
    ).toBe(true);
    const delayedPoints = await api(
      request,
      gateway,
      token,
      'GET',
      '/point/list',
    );
    const delayedPoint = delayedPoints.find(
      (candidate: { key: string }) => candidate.key === 'delayed-spcso-3',
    );
    expect(delayedPoint).toBeTruthy();
    const delayedNegativePoint = delayedPoints.find(
      (candidate: { key: string }) => candidate.key === 'delayed-spcso-4',
    );
    expect(delayedNegativePoint).toBeTruthy();
    await expect
      .poll(
        async () => {
          const current = await api(
            request,
            gateway,
            token,
            'GET',
            `/channel/detail/${delayedChannel.id}`,
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
    const delayedActive = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${delayedChannel.id}`,
    );
    const delayedAuthorityId = randomUUID();
    const delayedAuthority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      { authorityId: delayedAuthorityId, label: 'Fixed delayed CO peer' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${delayedAuthorityId}/verify`,
      {
        expectedRevision: delayedAuthority.revision,
        reason: 'Fixed-commit delayed control peer verified',
        evidence: { commit, delayedPort },
      },
    );
    const delayedRoute = await api(
      request,
      gateway,
      token,
      'PUT',
      `/control/routes/${delayedDevice.id}`,
      {
        authorityId: delayedAuthorityId,
        channelId: delayedChannel.id,
        expectedRevision: null,
        reason: 'Bind delayed IEC CO object',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', delayedPort },
      },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/routes/${delayedDevice.id}/verify`,
      {
        expectedRevision: delayedRoute.revision,
        reason: 'Delayed enhanced CO type verified online',
        evidence: { objects: ['GGIO1$CO$SPCSO3', 'GGIO1$CO$SPCSO4'], commit },
      },
    );
    const lateReceipt = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      {
        expectedChannelId: delayedChannel.id,
        expectedDeviceId: delayedDevice.id,
        expectedConfigurationRevision:
          delayedActive.configuration.appliedRevision,
        pointId: delayedPoint.id,
        value: true,
        idempotencyKey: randomUUID(),
        timeoutMs: 1000,
      },
    );
    const lateState = async () => {
      const details = await api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${lateReceipt.operationId}`,
      );
      return details.operation.state;
    };
    await expect.poll(lateState, { timeout: 5000 }).toBe('indeterminate');
    await expect.poll(lateState, { timeout: 10_000 }).toBe('protocolSucceeded');
    const negativeLateReceipt = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      {
        expectedChannelId: delayedChannel.id,
        expectedDeviceId: delayedDevice.id,
        expectedConfigurationRevision:
          delayedActive.configuration.appliedRevision,
        pointId: delayedNegativePoint.id,
        value: false,
        idempotencyKey: randomUUID(),
        timeoutMs: 1000,
      },
    );
    const negativeLateState = async () => {
      const details = await api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${negativeLateReceipt.operationId}`,
      );
      return details.operation.state;
    };
    await expect
      .poll(negativeLateState, { timeout: 5000 })
      .toBe('indeterminate');
    await expect
      .poll(negativeLateState, { timeout: 10_000 })
      .toBe('protocolRejected');

    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await expect(page.getByText('操作历史与未决记录')).toBeVisible();
  } finally {
    if (delayedPeer) await stopPeer(delayedPeer);
    await stopPeer(peer);
  }
});

test('operateMany keeps the result and object occupied until a separately granted Cancel', async ({
  gateway,
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!peerSource) throw new Error('Missing independent control peer source');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const port = await reservePort();
  const peer = await startPeer('server-operate-many', port);
  const proxy = await startCancelProxy(port);
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
    const driver = drivers.find(
      (candidate: { driverType: string }) =>
        candidate.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: 'iec-operate-many',
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port: proxy.port },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) => candidate.name === 'iec-operate-many',
    );
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Operate many IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
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
        candidate.deviceName === 'Operate many IED',
    );
    expect(device).toBeTruthy();
    for (const model of [2, 4]) {
      expect(
        await api(request, gateway, token, 'POST', '/point', {
          deviceId: device.id,
          name: `Operate many SPCSO${model}`,
          key: `many-spcso-${model}`,
          type: 0,
          dataType: 0,
          accessMode: 1,
          unit: null,
          minValue: null,
          maxValue: null,
          transformDataType: null,
          transformScale: null,
          transformOffset: null,
          transformNegate: false,
          driverConfig: {
            kind: 'control',
            configuration: {
              objectReference: `simpleIOGenericIO/GGIO1.SPCSO${model}`,
              expectedControlModel: model,
              originCategory: 3,
              originIdentifierHex: '6e672d67617465776179',
              synchronismCheck: false,
              interlockingCheck: false,
              test: false,
              sboClass: 'operateMany',
              selectionTimeoutMs: 2000,
              ...(model === 4 ? { terminationTimeoutMs: 5000 } : {}),
            },
          },
        }),
      ).toBe(true);
    }
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const byModel = (model: number) => {
      const point = points.find(
        (candidate: { key: string }) => candidate.key === `many-spcso-${model}`,
      );
      expect(point).toBeTruthy();
      return point;
    };
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
      { authorityId, label: 'Fixed operate-many IED' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed-commit operate-many peer verified',
        evidence: { commit, port },
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
        reason: 'Bind selected CO objects',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'sboClass and CO types verified online',
        evidence: { objects: [2, 4], sboClass: 1, commit },
      },
    );

    let inspectedOperationId = '';
    for (const [model, value, expected] of [
      [2, true, 'serviceAccepted'],
      [4, true, 'protocolSucceeded'],
      [4, false, 'protocolRejected'],
      [4, true, 'protocolSucceeded'],
    ] as const) {
      const receipt = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        {
          expectedChannelId: channel.id,
          expectedDeviceId: device.id,
          expectedConfigurationRevision: active.configuration.appliedRevision,
          pointId: byModel(model).id,
          value,
          idempotencyKey: randomUUID(),
          timeoutMs: 6000,
        },
      );
      inspectedOperationId = receipt.operationId;
      await expect
        .poll(
          async () => {
            const current = await api(
              request,
              gateway,
              token,
              'GET',
              `/control/operations/${receipt.operationId}`,
            );
            return current.operation.state;
          },
          { timeout: 10_000 },
        )
        .toBe(expected);
      const details = await api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${receipt.operationId}`,
      );
      expect(details.operation.state).toBe(expected);
      const states = details.events.map(
        (event: { state: string }) => event.state,
      );
      const retained = states.indexOf('releasePending');
      expect(retained).toBeGreaterThan(-1);
      expect(states.at(-1)).toBe(expected);
      expect(
        details.events
          .slice(retained + 1)
          .some(
            (event: { phase: string; state: string }) =>
              event.state === 'dispatching' && event.phase === 'cancel',
          ),
      ).toBe(true);
      expect(
        details.events.some(
          (event: {
            evidence?: { cancel?: { service?: string } };
            phase: string;
            state: string;
          }) =>
            event.state === expected &&
            event.phase === 'cancel' &&
            event.evidence?.cancel?.service === 'CancelAccepted',
        ),
      ).toBe(true);
    }
    proxy.delayNextCancel(4500);
    const lateIntent = {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: byModel(2).id,
      value: true,
      idempotencyKey: randomUUID(),
      timeoutMs: 1500,
    };
    const lateReceipt = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lateIntent,
    );
    const lateDetails = () =>
      api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${lateReceipt.operationId}`,
      );
    await expect
      .poll(() => proxy.heldCancelResponses, { timeout: 5000 })
      .toBe(1);
    const sameIntent = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lateIntent,
    );
    expect(sameIntent.operationId).toBe(lateReceipt.operationId);
    const occupied = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...lateIntent, idempotencyKey: randomUUID(), value: false },
    });
    expect(occupied.status()).toBe(409);
    const concurrent = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      {
        ...lateIntent,
        pointId: byModel(4).id,
        idempotencyKey: randomUUID(),
        timeoutMs: 6000,
      },
    );
    await expect
      .poll(
        async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${concurrent.operationId}`,
          );
          return details.operation.state;
        },
        { timeout: 3000 },
      )
      .toBe('protocolSucceeded');
    const concurrentDetails = await api(
      request,
      gateway,
      token,
      'GET',
      `/control/operations/${concurrent.operationId}`,
    );
    expect(
      concurrentDetails.events.some(
        (event: { phase: string; state: string }) =>
          event.phase === 'cancel' && event.state === 'dispatching',
      ),
    ).toBe(true);
    const heldOperation = await lateDetails();
    expect(heldOperation.operation.state).not.toBe('serviceAccepted');
    const lateState = async () => {
      const details = await lateDetails();
      return details.operation.state;
    };
    await expect
      .poll(lateState, {
        timeout: 5000,
      })
      .toBe('indeterminate');
    await expect
      .poll(lateState, {
        timeout: 10_000,
      })
      .toBe('serviceAccepted');
    const recovered = await lateDetails();
    const states = recovered.events.map(
      (event: { state: string }) => event.state,
    );
    expect(states).toContain('releasePending');
    expect(states).toContain('indeterminate');
    expect(states.at(-1)).toBe('serviceAccepted');
    expect(
      recovered.events.some(
        (event: {
          evidence?: { cancel?: { service?: string } };
          phase: string;
          state: string;
        }) =>
          event.phase === 'cancel' &&
          event.state === 'serviceAccepted' &&
          event.evidence?.cancel?.service === 'CancelAccepted',
      ),
    ).toBe(true);
    const retry = await api(request, gateway, token, 'POST', '/point/write', {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: byModel(2).id,
      value: false,
      idempotencyKey: randomUUID(),
      timeoutMs: 6000,
    });
    await expect
      .poll(
        async () => {
          const details = await api(
            request,
            gateway,
            token,
            'GET',
            `/control/operations/${retry.operationId}`,
          );
          return details.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('serviceAccepted');
    proxy.suspendReconnects();
    proxy.dropNextCancelResponse();
    const lostIntent = {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: byModel(2).id,
      value: true,
      idempotencyKey: randomUUID(),
      timeoutMs: 1500,
    };
    const lostReceipt = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lostIntent,
    );
    const lostDetails = () =>
      api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${lostReceipt.operationId}`,
      );
    await expect
      .poll(async () => {
        const details = await lostDetails();
        return details.operation.state;
      })
      .toBe('indeterminate');
    expect(proxy.droppedCancelResponses).toBe(1);
    const unknown = await lostDetails();
    expect(
      unknown.events.map((event: { state: string }) => event.state),
    ).toContain('releasePending');
    expect(unknown.events.at(-1)?.state).toBe('indeterminate');
    const duplicate = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lostIntent,
    );
    expect(duplicate.operationId).toBe(lostReceipt.operationId);
    const connectionPhase = async () => {
      const current = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/detail/${channel.id}`,
      );
      return current.connectionState?.phase;
    };
    await expect.poll(connectionPhase).not.toBe('Connected');
    const operateCount = proxy.operateRequestCount;
    const offline = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...lostIntent, idempotencyKey: randomUUID() },
    });
    const offlineBody = await offline.json();
    await writeFile(
      testInfo.outputPath('operate-many-offline-response.json'),
      JSON.stringify({ status: offline.status(), body: offlineBody }, null, 2),
    );
    expect(offline.status(), JSON.stringify(offlineBody)).toBe(503);
    expect(proxy.operateRequestCount).toBe(operateCount);
    const offlineDetails = await lostDetails();
    expect(offlineDetails.operation.state).toBe('indeterminate');
    proxy.resumeReconnects();
    await expect.poll(connectionPhase, { timeout: 20_000 }).toBe('Connected');
    const conflict = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...lostIntent, idempotencyKey: randomUUID() },
    });
    const conflictBody = await conflict.json();
    expect(conflict.status(), JSON.stringify(conflictBody)).toBe(409);
    expect(proxy.operateRequestCount).toBe(operateCount);
    const reconnectedDetails = await lostDetails();
    await writeFile(
      testInfo.outputPath('operate-many-outage-recovery.json'),
      JSON.stringify(
        {
          originalOperationId: lostReceipt.operationId,
          idempotentOperationId: duplicate.operationId,
          offline: { status: offline.status(), body: offlineBody },
          reconnected: { status: conflict.status(), body: conflictBody },
          operateCount,
          operateCountAfter: proxy.operateRequestCount,
          retainedState: reconnectedDetails.operation.state,
        },
        null,
        2,
      ),
    );
    const afterConflict = await lostDetails();
    expect(afterConflict.operation.state).toBe('indeterminate');
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await page
      .getByPlaceholder('操作 ID', { exact: true })
      .fill(inspectedOperationId);
    await page.getByRole('button', { name: '查询操作', exact: true }).click();
    await expect(
      page.getByText(inspectedOperationId, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('操作结果已记录，正在释放选择')).toBeVisible();
  } finally {
    try {
      await proxy.stop();
    } finally {
      await stopPeer(peer);
    }
  }
});

test('URCB keeps current observations and distinct controls live during late Cancel', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  if (!peerSource) throw new Error('Missing independent control peer source');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const port = await reservePort();
  const peer = await startPeer('server-operate-many', port);
  const proxy = await startCancelProxy(port);
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
    const driver = drivers.find(
      (candidate: { driverType: string }) =>
        candidate.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    const schemas = await api(
      request,
      gateway,
      token,
      'GET',
      `/driver/metadata/${driver.id}`,
    );
    const protocolSchema = schemas.channel.find(
      (node: { discriminator?: string; kind: string }) =>
        node.kind === 'Union' && node.discriminator === 'protocol',
    );
    const mmsSchema = protocolSchema?.mapping.find(
      (branch: { case_value: unknown }) => branch.case_value === 'mms',
    );
    const limitsField = mmsSchema?.children.find(
      (node: {
        default_value?: Record<string, unknown>;
        kind: string;
        path?: string;
      }) => node.kind === 'Field' && node.path === 'limits',
    );
    if (limitsField?.kind !== 'Field' || !limitsField.default_value)
      throw new Error('IEC metadata lacks canonical resource defaults');
    const limits = {
      ...limitsField.default_value,
      reportHealthIntervalMs: 1000,
    };
    const channelName = 'iec-urcb-concurrent-controls';
    const connectionPolicy = {
      connectTimeoutMs: 5000,
      readTimeoutMs: 1000,
      writeTimeoutMs: 1000,
    };
    const transport = { kind: 'tcp', host: '127.0.0.1', port: proxy.port };
    const association = {
      callingTransport: '0001',
      calledTransport: '0001',
      callingSession: '0001',
      calledSession: '0001',
      callingPresentation: '00000001',
      calledPresentation: '00000001',
    };
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: channelName,
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy,
        driverConfig: { protocol: 'mms', transport, association },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) => candidate.name === channelName,
    );
    expect(channel).toBeTruthy();
    expect(channel.period).toBe(500);
    const deviceName = 'URCB concurrent IED';
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName,
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
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
        candidate.deviceName === deviceName,
    );
    expect(device).toBeTruthy();
    for (const model of [2, 4]) {
      const base = {
        deviceId: device.id,
        dataType: 0,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
      };
      expect(
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          name: `Reported SPCSO${model} status`,
          key: `report-status-${model}`,
          type: 1,
          accessMode: 0,
          driverConfig: {
            kind: 'read',
            configuration: {
              objectReference: `simpleIOGenericIO/GGIO1.SPCSO${model}`,
              functionalConstraint: 'ST',
              valuePath: ['stVal'],
            },
          },
        }),
      ).toBe(true);
      expect(
        await api(request, gateway, token, 'POST', '/point', {
          ...base,
          name: `Reported SPCSO${model} control`,
          key: `report-control-${model}`,
          type: 0,
          accessMode: 1,
          driverConfig: {
            kind: 'control',
            configuration: {
              objectReference: `simpleIOGenericIO/GGIO1.SPCSO${model}`,
              expectedControlModel: model,
              originCategory: 3,
              originIdentifierHex: '6e672d67617465776179',
              synchronismCheck: false,
              interlockingCheck: false,
              test: false,
              sboClass: 'operateMany',
              selectionTimeoutMs: 2000,
              ...(model === 4 ? { terminationTimeoutMs: 5000 } : {}),
            },
          },
        }),
      ).toBe(true);
    }
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const pointFor = (key: string) => {
      const point = points.find(
        (candidate: { key: string }) => candidate.key === key,
      );
      expect(point).toBeTruthy();
      return point;
    };
    const reference = (item: string) => ({ domain: 'simpleIOGenericIO', item });
    const members = [
      'GGIO1$ST$SPCSO1$stVal',
      'GGIO1$ST$SPCSO2$stVal',
      'GGIO1$ST$SPCSO3$stVal',
      'GGIO1$ST$SPCSO4$stVal',
      'GGIO1$ST$SPCSO5$stVal',
      'GGIO1$ST$SPCSO6$stVal',
      'GGIO1$ST$SPCSO7$stVal',
      'GGIO1$ST$SPCSO8$stVal',
      'GGIO1$ST$SPCSO9$stVal',
      'GGIO1$ST$SPCSO2$stSeld',
      'GGIO1$OR$SPCSO2$opRcvd',
      'GGIO1$OR$SPCSO2$opOk',
    ].map((item) => ({ variable: reference(item), selection: [] }));
    expect(
      await api(request, gateway, token, 'PUT', '/channel', {
        id: channel.id,
        name: channelName,
        driverId: driver.id,
        collectionType: 0,
        period: null,
        reportType: 0,
        connectionPolicy,
        driverConfig: {
          protocol: 'mms',
          transport,
          association,
          limits,
          reportSources: [
            {
              rcb: reference('LLN0$RP$ControlEventsRCB01'),
              kind: 'unbuffered',
              reportId: 'ControlEvents',
              dataSet: reference('LLN0$ControlEvents'),
              confRev: 1,
              reservation: { kind: 'urUnreserved' },
              members,
              points: [2, 4].map((model) => ({
                pointId: pointFor(`report-status-${model}`).id,
                valueMember: model - 1,
                qualityMember: null,
                timeMember: null,
              })),
            },
          ],
        },
      }),
    ).toBe(true);
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
        { timeout: 20_000 },
      )
      .toBe(true);
    const active = await api(
      request,
      gateway,
      token,
      'GET',
      `/channel/detail/${channel.id}`,
    );
    expect(active.collectionType).toBe(0);
    expect(active.period).toBeNull();
    expect(active.driverConfig).not.toHaveProperty('mode');
    const authorityId = randomUUID();
    const authority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      {
        authorityId,
        label: 'Fixed URCB control peer',
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
        reason: 'Fixed URCB IED identity verified',
        evidence: { commit, port },
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
        reason: 'Bind URCB and distinct CO objects to one IED',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'URCB baseline and CO online layouts verified',
        evidence: { commit, objects: [2, 4] },
      },
    );
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await page.goto(`${gateway.origin}/#/maintenance/monitor`);
    await page.getByRole('combobox').nth(0).click();
    await page.getByText(channelName, { exact: true }).last().click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByText(deviceName, { exact: true }).last().click();
    const reportedRow = (model: number) =>
      page.locator('tr').filter({ hasText: `report-status-${model}` });
    for (const model of [2, 4]) {
      await expect(
        reportedRow(model).getByText('false', { exact: true }),
      ).toBeVisible();
      await expect(
        reportedRow(model).getByText('当前', { exact: true }),
      ).toBeVisible();
      await expect(
        reportedRow(model).getByText('未知', { exact: true }),
      ).toBeVisible();
    }
    const reportAssociation = proxy.associationCount;
    proxy.delayNextCancel(4500);
    const intent = {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: pointFor('report-control-2').id,
      value: true,
      idempotencyKey: randomUUID(),
      timeoutMs: 1500,
    };
    const first = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    await expect.poll(() => proxy.heldCancelResponses).toBe(1);
    await expect(
      reportedRow(2).getByText('true', { exact: true }),
    ).toBeVisible();
    const same = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    expect(same.operationId).toBe(first.operationId);
    const occupied = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...intent, idempotencyKey: randomUUID() },
    });
    expect(occupied.status()).toBe(409);
    const second = await api(request, gateway, token, 'POST', '/point/write', {
      ...intent,
      pointId: pointFor('report-control-4').id,
      idempotencyKey: randomUUID(),
      timeoutMs: 6000,
    });
    const details = (operationId: string) =>
      api(request, gateway, token, 'GET', `/control/operations/${operationId}`);
    await expect
      .poll(
        async () => {
          const operation = await details(second.operationId);
          return operation.operation.state;
        },
        { timeout: 3000 },
      )
      .toBe('protocolSucceeded');
    await expect(
      reportedRow(4).getByText('true', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => proxy.healthReadsWhileCancelHeld, { timeout: 2000 })
      .toBeGreaterThan(0);
    const pending = await details(first.operationId);
    expect(pending.operation.state).not.toBe('serviceAccepted');
    expect(proxy.associationCount).toBe(reportAssociation);
    await expect
      .poll(
        async () => {
          const operation = await details(first.operationId);
          return operation.operation.state;
        },
        { timeout: 10_000 },
      )
      .toBe('serviceAccepted');
    for (const model of [2, 4])
      await expect(
        reportedRow(model).getByText('当前', { exact: true }),
      ).toBeVisible();
    const completed = await details(first.operationId);
    expect(
      completed.events.map((event: { state: string }) => event.state),
    ).toContain('indeterminate');
    proxy.suspendReconnects();
    proxy.dropNextCancelResponse();
    const sentBeforeLoss = proxy.operateRequestCount;
    const lostIntent = { ...intent, idempotencyKey: randomUUID() };
    const lost = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lostIntent,
    );
    await expect
      .poll(async () => {
        const operation = await details(lost.operationId);
        return operation.operation.state;
      })
      .toBe('indeterminate');
    expect(proxy.droppedCancelResponses).toBe(1);
    for (const model of [2, 4]) {
      await expect(
        reportedRow(model).getByText('true', { exact: true }),
      ).toBeVisible();
      await expect(
        reportedRow(model).getByText('陈旧', { exact: true }),
      ).toBeVisible();
    }
    const duplicateUnknown = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      lostIntent,
    );
    expect(duplicateUnknown.operationId).toBe(lost.operationId);
    expect(proxy.operateRequestCount).toBe(sentBeforeLoss + 1);
    proxy.resumeReconnects();
    for (const model of [2, 4])
      await expect(
        reportedRow(model).getByText('当前', { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
    const stillUnknown = await details(lost.operationId);
    expect(stillUnknown.operation.state).toBe('indeterminate');
    expect(proxy.operateRequestCount).toBe(sentBeforeLoss + 1);
    const unknownOccupancy = await request.post(
      `${gateway.origin}/api/point/write`,
      {
        headers: {
          'X-Gateway-Contract': 'boot',
          Authorization: `Bearer ${token}`,
        },
        data: { ...lostIntent, idempotencyKey: randomUUID() },
      },
    );
    expect(unknownOccupancy.status()).toBe(409);
    expect(proxy.operateRequestCount).toBe(sentBeforeLoss + 1);
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await page
      .getByPlaceholder('操作 ID', { exact: true })
      .fill(lost.operationId);
    await page.getByRole('button', { name: '查询操作', exact: true }).click();
    await expect(
      page.locator('code').filter({ hasText: lost.operationId }),
    ).toBeVisible();
    await expect(page.getByText('操作结果已记录，正在释放选择')).toBeVisible();
    await expect(
      page.getByText(
        '结果未知。请核实现场；系统不会自动重发，也不会根据读回值推断命令已执行。',
      ),
    ).toBeVisible();
  } finally {
    try {
      await proxy.stop();
    } finally {
      await stopPeer(peer);
    }
  }
});

test('negative Cancel retains the original Operate result and physical occupancy', async ({
  gateway,
  request,
}) => {
  test.setTimeout(90_000);
  if (!peerSource) throw new Error('Missing independent control peer source');
  const commit = execFileSync('git', ['-C', peerSource, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  expect(commit).toBe('a13961110b8238d2d8ea577c1fb7592ba3017ad8');
  const port = await reservePort();
  const peer = await startPeer('server-operate-many-cancel-rejected', port);
  try {
    const { token } = await initializeAdmin(request, gateway);
    await installNativeArtifact(
      request,
      gateway,
      token,
      'driver',
      'ng_driver_iec61850',
    );
    const drivers = await api(request, gateway, token, 'GET', '/driver/list');
    const driver = drivers.find(
      (candidate: { driverType: string }) =>
        candidate.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    const channelName = 'iec-negative-cancel';
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name: channelName,
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find(
      (candidate: { name: string }) => candidate.name === channelName,
    );
    expect(channel).toBeTruthy();
    const deviceName = 'Cancel rejection IED';
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName,
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
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
        candidate.deviceName === deviceName,
    );
    expect(device).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: 'SPCSO2 held Operate',
        key: 'held-spcso-2',
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: 'simpleIOGenericIO/GGIO1.SPCSO2',
            expectedControlModel: 2,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            sboClass: 'operateMany',
            selectionTimeoutMs: 2000,
          },
        },
      }),
    ).toBe(true);
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const point = points.find(
      (candidate: { key: string }) => candidate.key === 'held-spcso-2',
    );
    expect(point).toBeTruthy();
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
      { authorityId, label: 'Cancel rejection peer' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed-commit held Operate verified',
        evidence: { commit, port },
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
        reason: 'Bind negative Cancel control object',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'operateMany and CO type verified online',
        evidence: { object: 'GGIO1$CO$SPCSO2', sboClass: 1, commit },
      },
    );
    const intent = {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: point.id,
      value: true,
      idempotencyKey: randomUUID(),
      timeoutMs: 6000,
    };
    const receipt = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    const detail = () =>
      api(
        request,
        gateway,
        token,
        'GET',
        `/control/operations/${receipt.operationId}`,
      );
    await expect
      .poll(async () => {
        const result = await detail();
        return result.operation.state;
      })
      .toBe('indeterminate');
    const unknown = await detail();
    const states = unknown.events.map(
      (event: { state: string }) => event.state,
    );
    expect(states).toContain('releasePending');
    expect(states.at(-1)).toBe('indeterminate');
    const conclusion = unknown.events.find(
      (event: { state: string }) => event.state === 'indeterminate',
    );
    expect(conclusion?.evidence?.unreleasedOutcome).toMatchObject({
      kind: 'indeterminate',
      evidence: {
        service: 'CancelRejected',
        operateDiagnosis: null,
        cancelDiagnosis: [0, expect.any(Number)],
      },
    });
    const duplicate = await api(
      request,
      gateway,
      token,
      'POST',
      '/point/write',
      intent,
    );
    expect(duplicate.operationId).toBe(receipt.operationId);
    await delay(3000);
    const afterExecution = await detail();
    expect(afterExecution.operation.state).toBe('indeterminate');
    const conflict = await request.post(`${gateway.origin}/api/point/write`, {
      headers: {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      },
      data: { ...intent, idempotencyKey: randomUUID() },
    });
    expect(conflict.status()).toBe(409);
  } finally {
    await stopPeer(peer);
  }
});

/** A rejected selection is persisted separately and never authorizes Operate. */
test('SBOw rejection is durable and subsequent control remains available', async ({
  gateway,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const port = await reservePort();
  const peer = await startPeer('server-select-rejected', port);
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
    const driver = drivers.find(
      (v: { driverType: string }) => v.driverType === 'iec61850',
    );
    expect(driver).toBeTruthy();
    const name = 'iec-sbow-diagnosis';
    expect(
      await api(request, gateway, token, 'POST', '/channel', {
        name,
        driverId: driver.id,
        collectionType: 1,
        period: 500,
        reportType: 0,
        connectionPolicy: {
          connectTimeoutMs: 5000,
          readTimeoutMs: 1000,
          writeTimeoutMs: 1000,
        },
        driverConfig: {
          protocol: 'mms',
          transport: { kind: 'tcp', host: '127.0.0.1', port },
          association: {
            callingTransport: '0001',
            calledTransport: '0001',
            callingSession: '0001',
            calledSession: '0001',
            callingPresentation: '00000001',
            calledPresentation: '00000001',
          },
        },
      }),
    ).toBe(true);
    const channels = await api(request, gateway, token, 'GET', '/channel/list');
    const channel = channels.find((v: { name: string }) => v.name === name);
    expect(channel).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/device', {
        channelId: channel.id,
        deviceName: 'Selection IED',
        deviceType: 'independent-peer',
        driverConfig: { logicalDevice: 'simpleIOGenericIO' },
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
      (v: { deviceName: string }) => v.deviceName === 'Selection IED',
    );
    expect(device).toBeTruthy();
    expect(
      await api(request, gateway, token, 'POST', '/point', {
        deviceId: device.id,
        name: 'SBOw control',
        key: 'sbow-control',
        type: 0,
        dataType: 0,
        accessMode: 1,
        unit: null,
        minValue: null,
        maxValue: null,
        transformDataType: null,
        transformScale: null,
        transformOffset: null,
        transformNegate: false,
        driverConfig: {
          kind: 'control',
          configuration: {
            objectReference: 'simpleIOGenericIO/GGIO1.SPCSO4',
            expectedControlModel: 4,
            originCategory: 3,
            originIdentifierHex: '6e672d67617465776179',
            synchronismCheck: false,
            interlockingCheck: false,
            test: false,
            sboClass: 'operateOnce',
            selectionTimeoutMs: 2000,
            terminationTimeoutMs: 5000,
          },
        },
      }),
    ).toBe(true);
    const points = await api(request, gateway, token, 'GET', '/point/list');
    const point = points.find((v: { key: string }) => v.key === 'sbow-control');
    expect(point).toBeTruthy();
    const current = () =>
      api(request, gateway, token, 'GET', `/channel/detail/${channel.id}`);
    await expect
      .poll(
        async () => {
          const state = await current();
          return state.configuration.state;
        },
        {
          timeout: 15_000,
        },
      )
      .toBe('active');
    const active = await current();
    const authorityId = randomUUID();
    const authority = await api(
      request,
      gateway,
      token,
      'POST',
      '/control/authorities',
      { authorityId, label: 'Independent selection peer' },
    );
    await api(
      request,
      gateway,
      token,
      'POST',
      `/control/authorities/${authorityId}/verify`,
      {
        expectedRevision: authority.revision,
        reason: 'Fixed loopback reference peer verified',
        evidence: { commit: 'a13961110b8238d2d8ea577c1fb7592ba3017ad8', port },
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
        reason: 'Bind observed CO object',
        routeSnapshot: { logicalDevice: 'simpleIOGenericIO', port },
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
        reason: 'Actual control model and layout verified',
        evidence: { object: 'GGIO1$CO$SPCSO4' },
      },
    );
    const details = (id: string) =>
      api(request, gateway, token, 'GET', `/control/operations/${id}`);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const intent = {
        expectedChannelId: channel.id,
        expectedDeviceId: device.id,
        expectedConfigurationRevision: active.configuration.appliedRevision,
        pointId: point.id,
        value: false,
        idempotencyKey: randomUUID(),
        timeoutMs: 6000,
      };
      const receipt = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        intent,
      );
      ids.push(receipt.operationId);
      await expect
        .poll(
          async () => {
            const state = await details(receipt.operationId);
            return state.operation.state;
          },
          { timeout: 10_000 },
        )
        .toBe('protocolRejected');
      const record = await details(receipt.operationId);
      const conclusion = record.events.find(
        (event: { state: string }) => event.state === 'protocolRejected',
      );
      expect(conclusion?.evidence).toMatchObject({
        selectionDiagnosis: [3, 10],
        operateDiagnosis: null,
        cancelDiagnosis: null,
      });
      const duplicate = await api(
        request,
        gateway,
        token,
        'POST',
        '/point/write',
        intent,
      );
      expect(duplicate.operationId).toBe(receipt.operationId);
      const currentState = await current();
      expect(currentState.configuration.state).toBe('active');
      expect(currentState.configuration.appliedRevision).toBe(
        active.configuration.appliedRevision,
      );
    }
    const success = await api(request, gateway, token, 'POST', '/point/write', {
      expectedChannelId: channel.id,
      expectedDeviceId: device.id,
      expectedConfigurationRevision: active.configuration.appliedRevision,
      pointId: point.id,
      value: true,
      idempotencyKey: randomUUID(),
      timeoutMs: 6000,
    });
    await expect
      .poll(
        async () => {
          const state = await details(success.operationId);
          return state.operation.state;
        },
        {
          timeout: 10_000,
        },
      )
      .toBe('protocolSucceeded');
    await page.goto(`${gateway.origin}/#/auth/login`);
    await page
      .getByPlaceholder('请输入用户名', { exact: true })
      .fill('system_admin');
    await page.getByPlaceholder('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'login', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    const rejectedId = ids[0];
    if (!rejectedId) throw new Error('Missing rejected selection operation');
    await page.goto(`${gateway.origin}/#/maintenance/action-debug`);
    await page.getByPlaceholder('操作 ID', { exact: true }).fill(rejectedId);
    await page.getByRole('button', { name: '查询操作', exact: true }).click();
    await expect(
      page.locator('code').filter({ hasText: rejectedId }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('sbow-rejected-history.png'),
      fullPage: true,
    });
  } finally {
    await stopPeer(peer);
  }
});
