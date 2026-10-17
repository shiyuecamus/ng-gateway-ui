import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';

import { expect } from '@playwright/test';

import { api, initializeAdmin, installNativeArtifact, test } from './gateway';

const root = '/engineering/iec61850';
const fixtures = resolve(
  import.meta.dirname,
  '../../../../ng-gateway-protocols/iec61850/tests/fixtures/goose-engineering',
);
const scenarios = [
  {
    mode: 'complete',
    peerArgs: [],
    title:
      'Chromium commits a complete qualified GOOSE source group and preserves captured dependency evidence',
  },
  {
    mode: 'narrow',
    peerArgs: ['narrow-namespace'],
    title:
      'Chromium refuses independent actual namespace type mismatch before GOOSE publication',
  },
  {
    mode: 'absent-ex',
    peerArgs: ['absent-ex-metadata'],
    title:
      'Chromium qualifies directory-proven absent EX metadata without fabricating a Read and publishes GOOSE',
  },
] as const;
for (const scenario of scenarios) {
  const narrowNamespace = scenario.mode === 'narrow';
  const absentEx = scenario.mode === 'absent-ex';
  test(scenario.title, async ({ gateway, request, page }) => {
    const peerPath = process.env.NG_IEC61850_GOOSE_ENGINEERING_PEER;
    test.skip(
      !peerPath,
      'requires fixed independent complete namespace MMS peer',
    );
    if (!peerPath) return;
    test.setTimeout(120_000);
    const listener = createServer();
    await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
    const address = listener.address();
    if (!address || typeof address === 'string')
      throw new Error('local peer port missing');
    const port = address.port;
    await new Promise<void>((done) => listener.close(() => done()));
    const peer = spawn(peerPath, [String(port), ...scenario.peerArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    peer.stdout.on('data', (chunk) => {
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
      const headers = {
        'X-Gateway-Contract': 'boot',
        Authorization: `Bearer ${token}`,
      };
      async function upload(path: string, name: string, role?: string) {
        const response = await request.post(
          `${gateway.origin}/api${root}/${role ? `nsd?role=${role}` : 'assets'}`,
          {
            headers,
            multipart: {
              file: {
                name,
                mimeType: 'application/xml',
                buffer: await readFile(path),
              },
            },
          },
        );
        expect(response.status(), await response.text()).toBe(201);
        const body = await response.json();
        return body.data;
      }
      const source = await upload(
        resolve(fixtures, absentEx ? 'source-absent-ex.scd' : 'source.scd'),
        'qualified-source.scd',
      );
      // Synthetic originals test owner boundaries; they do not certify the IEC data model.
      const dataClasses = await upload(
        resolve(
          fixtures,
          absentEx ? 'data-classes-absent-ex.nsd' : 'data-classes.nsd',
        ),
        'data-classes.nsd',
        'data',
      );
      const acsi = await upload(
        resolve(fixtures, 'acsi.nsd'),
        'acsi.nsd',
        'data',
      );
      const logicalNodes = await upload(
        resolve(fixtures, 'logical-nodes.nsd'),
        'logical-nodes.nsd',
        'data',
      );
      const doc = await request.post(`${gateway.origin}/api${root}/documents`, {
        headers,
        multipart: {
          file: {
            name: 'lab-parts.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from(
              'Synthetic six-part source ownership fixture. PICS S17/server: substitution unsupported for PlantDomain/GGIO1/Ind.',
            ),
          },
        },
      });
      expect(doc.status(), await doc.text()).toBe(201);
      const documentBody = await doc.json();
      const document = documentBody.data;
      const modellingSources = new Map([
        ['acsi72', acsi.digest],
        ['dataClasses73', dataClasses.digest],
        ['logicalNodes74', logicalNodes.digest],
      ]);
      const drivers = await api(request, gateway, token, 'GET', '/driver/list');
      const initial = {
        target: { kind: 'create' },
        channel: {
          name: 'source-mms-capture',
          driverId: drivers[0].id,
          status: 0,
          period: 1000,
          reportType: 0,
          connectionPolicy: {
            connectTimeoutMs: 2000,
            readTimeoutMs: 2000,
            writeTimeoutMs: 2000,
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
            association: {
              callingTransport: '0001',
              calledTransport: '0001',
              callingSession: '0001',
              calledSession: '0001',
              callingPresentation: '00000001',
              calledPresentation: '00000001',
            },
          },
        },
        acquisition: {
          protocol: 'mms',
          contract: {
            substitution: [
              {
                support: 'unsupported',
                source: document.digest,
                locator: 'PICS S17/server; PlantDomain/GGIO1/Ind',
                objects: [
                  {
                    domain: 'PlantDomain',
                    logicalNode: 'GGIO1',
                    path: [{ name: 'Ind', indices: [] }],
                  },
                ],
              },
            ],
            manufacturer: null,
            model: null,
            firmware: null,
            domains: ['PlantDomain'],
            documents: [
              {
                digest: document.digest,
                roles: ['vendorDocumentation', 'pics'],
                label: 'Laboratory rule evidence',
                locator: null,
              },
              ...[acsi, dataClasses, logicalNodes].map((original) => ({
                digest: original.digest,
                roles: ['standardReference'],
                label: 'Synthetic modelling owner fixture',
                locator: null,
              })),
            ],
            parts: [
              'scl6',
              'semantics71',
              'acsi72',
              'dataClasses73',
              'logicalNodes74',
              'mapping81',
            ].map((part) => ({
              part,
              edition: { major: 2, amendment: 0 },
              publication: 'Explicit implemented 2011 ordinary rule basis',
              sources: [modellingSources.get(part) ?? document.digest],
            })),
          },
          mapping: {
            server: 0,
            accessPoint: 'AP',
            reports: [],
            points: [
              {
                name: 'source-value',
                key: 'source-value',
                type: 1,
                unit: null,
                purpose: {
                  kind: 'read',
                  value: {
                    domain: 'PlantDomain',
                    logicalNode: 'GGIO1',
                    functionalConstraint: 'ST',
                    path: [
                      { name: 'Ind', indices: [] },
                      { name: 'stVal', indices: [] },
                    ],
                  },
                  quality: null,
                  sourceTime: null,
                },
              },
            ],
          },
        },
      };
      const preview = await api(
        request,
        gateway,
        token,
        'POST',
        `${root}/assets/${source.digest}/publication-preview`,
        initial,
      );
      const publishedMms = await request.post(
        `${gateway.origin}/api${root}/assets/${source.digest}/publish`,
        {
          headers,
          data: { proposal: initial, previewDigest: preview.previewDigest },
        },
      );
      expect(publishedMms.status(), await publishedMms.text()).toBe(202);
      const publishedMmsBody = await publishedMms.json();
      const receipt = publishedMmsBody.data;
      expect(receipt.configuration.state).toBe('active');
      const captureReply = await request.post(
        `${gateway.origin}/api${root}/snapshots`,
        {
          headers,
          data: {
            channelId: receipt.publication.channelId,
            configurationRevision: receipt.publication.desiredRevision,
            domains: ['PlantDomain'],
          },
        },
      );
      expect(captureReply.status(), await captureReply.text()).toBe(201);
      const captureBody = await captureReply.json();
      const capture = captureBody.data;
      expect(capture.source.declarations.kind).toBe('published');
      const locales = JSON.parse(
        await readFile(
          resolve(import.meta.dirname, '../src/locales/langs/zh-CN/page.json'),
          'utf8',
        ),
      ) as typeof import('../src/locales/langs/zh-CN/page.json');
      const labels = locales.southward.channel.engineering;
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
        .fill(source.digest);
      await engineering
        .getByRole('button', { name: labels.open, exact: true })
        .click();
      await engineering.getByRole('button', { name: 'I', exact: true }).click();
      await engineering
        .getByRole('button', { name: labels.goose.title, exact: true })
        .click();
      const goose = page.getByRole('dialog', {
        name: labels.goose.title,
        exact: true,
      });
      await goose
        .getByLabel(labels.goose.observation, { exact: true })
        .fill(capture.digest);
      await goose
        .getByRole('button', { name: labels.goose.load, exact: true })
        .click();
      const server = goose.getByRole('combobox', {
        name: labels.goose.server,
        exact: true,
      });
      await expect(server).toBeEnabled();
      await server.press('ArrowDown');
      await server.press('Enter');
      for (const [label, value] of [
        [labels.goose.domain, 'PlantDomain'],
        [labels.goose.control, 'events'],
        [labels.goose.accessPoint, 'AP'],
        [labels.goose.subnetwork, 'Station'],
      ] as const)
        await goose.getByLabel(label, { exact: true }).fill(value);
      for (const [index, digest] of [
        acsi.digest,
        dataClasses.digest,
        logicalNodes.digest,
      ].entries()) {
        await goose
          .getByRole('button', {
            name: labels.goose.addNamespaceData,
            exact: true,
          })
          .click();
        await goose
          .getByLabel(
            labels.goose.namespaceData.replace('{index}', String(index + 1)),
            { exact: true },
          )
          .fill(digest);
      }
      const planReply = page.waitForResponse(
        (response) =>
          response.url().endsWith('/goose/source-plans') &&
          response.request().method() === 'POST',
      );
      await goose
        .getByRole('button', { name: labels.goose.compile, exact: true })
        .click();
      const planResponse = await planReply;
      expect(planResponse.status(), await planResponse.text()).toBe(200);
      const planBody = await planResponse.json();
      if (absentEx) {
        const node = planBody.data.namespaces.logicalNodes.find(
          (node: { logicalNode: string }) => node.logicalNode === 'GGIO1',
        );
        const pointOwner = node.objects.find(
          (object: { name: string }) => object.name === 'Ind',
        );
        expect(pointOwner.observations.data.typeEvidence).toEqual({
          status: 'functionalConstraintAbsent',
        });
        expect(pointOwner.observations.data.readEvidence).toEqual({
          status: 'unobserved',
        });
        expect(pointOwner.observations.data.value).toBeNull();
        expect(pointOwner.observations.data.effectiveNamespace).toMatchObject({
          status: 'known',
          digest: logicalNodes.digest,
          origin: { kind: 'hierarchy', level: 'logicalDevice' },
        });
        await writeFile(
          test.info().outputPath('directory-proven-absent-ex-source-plan.json'),
          JSON.stringify(planBody.data, null, 2),
        );
        const table = goose.getByTestId('goose-namespace-logical-nodes');
        await table
          .getByRole('button', { name: /^right PlantDomain\/GGIO1/ })
          .click();
        const evidence = goose
          .getByTestId('namespace-object-evidence')
          .filter({ hasText: 'PlantDomain/GGIO1/Ind' });
        const dataEvidence = evidence.getByTestId('namespace-level-data');
        await expect(
          table.locator('.ant-motion-collapse-enter-active'),
        ).toHaveCount(0);
        await dataEvidence.scrollIntoViewIfNeeded();
        await expect(dataEvidence).toBeInViewport({ ratio: 0.9 });
        await expect(dataEvidence).toContainText(
          labels.goose.namespaceTypeStates.functionalConstraintAbsent,
        );
        await expect(dataEvidence).toContainText(
          labels.goose.namespaceReadStates.unobserved,
        );
        await expect(dataEvidence).toContainText(
          labels.goose.namespaceEffectiveStates.hierarchy,
        );
        await dataEvidence.screenshot({
          path: test
            .info()
            .outputPath('directory-proven-absent-ex-no-read.png'),
        });
      }

      const editor = goose.getByTestId('goose-publication');
      await expect(editor).toBeVisible();
      const ui = labels.goosePublication;
      await editor
        .getByLabel(ui.sourceId, { exact: true })
        .fill('qualified-events');
      await editor
        .getByLabel(ui.publisher, { exact: true })
        .fill('02:11:22:33:44:55');
      await editor
        .getByRole('button', { name: ui.addSource, exact: true })
        .click();
      await editor
        .getByLabel(ui.deviceName.replace('{domain}', 'PlantDomain'), {
          exact: true,
        })
        .fill('Browser GOOSE IED');
      await editor
        .getByLabel(ui.name, { exact: true })
        .fill('Published Boolean');
      await editor
        .getByLabel(ui.pointKey, { exact: true })
        .fill('published-value');
      const value = editor.getByRole('combobox', {
        name: ui.value,
        exact: true,
      });
      await value.press('ArrowDown');
      await value.press('Enter');
      await editor
        .getByRole('button', { name: ui.addPoint, exact: true })
        .click();
      const driver = editor.getByRole('combobox', {
        name: ui.driver,
        exact: true,
      });
      await driver.press('ArrowDown');
      await driver.press('Enter');
      await editor
        .getByLabel(ui.channelName, { exact: true })
        .fill('browser-goose-publication');
      await editor
        .getByLabel(ui.interface, { exact: true })
        .fill('qualification');
      for (const section of [
        ui.capturePolicy,
        ui.limits,
        ui.connectionPolicy,
      ]) {
        await editor
          .getByRole('button', { name: `right ${section}`, exact: true })
          .click();
      }
      for (const [field, value] of Object.entries({
        maxSources: 1,
        maxPoints: 2,
        maxDevices: 1,
        maxSourceModelBytes: 65_536,
        maxGroupModelBytes: 262_144,
        maxSourceOutputBytes: 16_384,
        maxRetainedSampleBytes: 65_536,
        maxRetainedFrameBytes: 262_144,
        maxTypeNodes: 4096,
        maxDatasetMembers: 64,
        maxDecodeBytes: 65_536,
        maxDecodeWork: 1_048_576,
      })) {
        await editor
          .getByLabel(ui.policyFields[field as keyof typeof ui.policyFields], {
            exact: true,
          })
          .fill(String(value));
      }
      const previewReply = page.waitForResponse(
        (response) =>
          response.url().endsWith('/publication-preview') &&
          response.request().method() === 'POST',
      );
      await editor
        .getByRole('button', { name: ui.preview, exact: true })
        .click();
      const reviewed = await previewReply;
      if (narrowNamespace) {
        expect(reviewed.status(), await reviewed.text()).toBe(422);
        const rejection = await reviewed.json();
        expect(JSON.stringify(rejection)).toContain(
          'complete source type/namespace/original qualification conflicts',
        );
        const channels = await api(
          request,
          gateway,
          token,
          'GET',
          '/channel/list',
        );
        expect(channels).toHaveLength(1);
        expect(channels[0].id).toBe(receipt.publication.channelId);
        await expect(
          editor.getByRole('button', { name: ui.publish, exact: true }),
        ).toBeDisabled();
        await writeFile(
          test
            .info()
            .outputPath(
              'independent-namespace-type-publication-rejection.json',
            ),
          JSON.stringify(
            {
              original: source.digest,
              captured: capture.digest,
              rejection,
              channelIds: channels.map((channel: { id: number }) => channel.id),
            },
            null,
            2,
          ),
        );
        const errorAlert = editor.locator('.ant-alert').filter({
          hasText:
            'complete source type/namespace/original qualification conflicts',
        });
        await errorAlert.scrollIntoViewIfNeeded();
        await expect(errorAlert).toBeInViewport({ ratio: 0.9 });
        await errorAlert.screenshot({
          path: test
            .info()
            .outputPath('independent-namespace-type-publication-rejected.png'),
        });
        const publishDisabled = editor.getByRole('button', {
          name: ui.publish,
          exact: true,
        });
        await publishDisabled.scrollIntoViewIfNeeded();
        await expect(publishDisabled).toBeInViewport({ ratio: 0.9 });
        await publishDisabled.screenshot({
          path: test
            .info()
            .outputPath('independent-namespace-type-publish-disabled.png'),
        });
        return;
      }
      expect(reviewed.status(), await reviewed.text()).toBe(200);
      const compiledBody = await reviewed.json();
      const compiled = compiledBody.data;
      expect(compiled.contract).toBeNull();
      expect(compiled.mapping.acquisition.protocol).toBe('goose');
      expect(compiled.mapping.acquisition.sources[0].dependencies).toEqual(
        expect.arrayContaining([
          source.digest,
          capture.digest,
          acsi.digest,
          dataClasses.digest,
          logicalNodes.digest,
          document.digest,
        ]),
      );
      await editor
        .getByRole('button', {
          name: `right ${ui.capturedDependencies}`,
          exact: true,
        })
        .click();
      await expect(
        editor.locator(
          `[title="${capture.source.declarations.snapshotDigest}"]`,
        ),
      ).toBeVisible();
      await editor
        .locator(`[title="${capture.source.declarations.snapshotDigest}"]`)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath('goose-complete-publication-preview.png'),
        fullPage: true,
      });
      const committedReply = page.waitForResponse(
        (response) =>
          response.url().endsWith('/publish') &&
          response.request().method() === 'POST',
      );
      await editor
        .getByRole('button', { name: ui.publish, exact: true })
        .click();
      const committed = await committedReply;
      expect(committed.status(), await committed.text()).toBe(202);
      const publishedBody = await committed.json();
      const published = publishedBody.data;
      expect(published.contract).toBeNull();
      expect(published.configuration.state).toBe('disabled');
      const topology = await api(
        request,
        gateway,
        token,
        'GET',
        `/channel/detail/${published.publication.channelId}`,
      );
      expect(topology.driverConfig.protocol).toBe('goose');
      expect(topology.period).toBeNull();
      expect(topology.driverConfig.reportSources).toBeUndefined();
      await editor
        .getByText(locales.southward.channel.activation.disabled, {
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test
          .info()
          .outputPath('goose-complete-publication-committed.png'),
        fullPage: true,
      });
    } finally {
      if (peer.exitCode === null && peer.signalCode === null) {
        peer.kill('SIGTERM');
        await once(peer, 'exit');
      }
    }
  });
}
