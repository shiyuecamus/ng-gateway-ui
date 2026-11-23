import type { APIRequestContext, TestInfo } from '@playwright/test';

import type { MonitorPointEntry } from '@vben/types';

import type { Gateway } from './gateway';

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { api, installNativeArtifact } from './gateway';

type Broker = 'kafka' | 'pulsar';
type Format = 'envelope_json' | 'kv' | 'mapped_json' | 'timeseries_rows';
type Sample = MonitorPointEntry & { ts_ms?: number };

interface RecordEvidence {
  body: unknown;
  brokerTimeMs: number;
  key: string;
  observedAtMs: number;
  properties: Record<string, string>;
  publishTimeMs?: number;
  timestampType?: number;
  topic: string;
}

interface ProbeEvidence {
  broker: Broker;
  clientVersion: string;
  expectedTopics: string[];
  matchedTopics: string[];
  records: RecordEvidence[];
}

/** Real transport peers remain opt-in and reject incomplete fixture configuration. */
export class BrokerTimePeers {
  private readonly stopped = new Set<string>();

  private readonly topics: Record<Broker, Map<string, Format>> = {
    kafka: new Map(),
    pulsar: new Map(),
  };

  private constructor(
    private readonly python: string,
    private readonly connections: Record<
      Broker,
      { container: string; url: string }
    >,
  ) {}

  static fromEnvironment(): BrokerTimePeers | undefined {
    const settings = [
      process.env.NG_TIME_BROKER_PYTHON,
      process.env.NG_TIME_KAFKA_BOOTSTRAP,
      process.env.NG_TIME_KAFKA_CONTAINER,
      process.env.NG_TIME_PULSAR_URL,
      process.env.NG_TIME_PULSAR_CONTAINER,
    ];
    if (settings.every((value) => !value)) return;
    const [python, kafka, kafkaContainer, pulsar, pulsarContainer] = settings;
    if (!python || !kafka || !kafkaContainer || !pulsar || !pulsarContainer)
      throw new Error(
        'Real broker verification requires all five fixture settings',
      );
    return new BrokerTimePeers(python, {
      kafka: { url: kafka, container: kafkaContainer },
      pulsar: { url: pulsar, container: pulsarContainer },
    });
  }

  /** Every codec is exercised through an actual separately installed native app. */
  async install(
    request: APIRequestContext,
    gateway: Gateway,
    token: string,
    deviceId: number,
  ) {
    const run = randomUUID().replaceAll('-', '');
    for (const broker of ['kafka', 'pulsar'] as const) {
      await installNativeArtifact(
        request,
        gateway,
        token,
        'plugin',
        `ng_plugin_${broker}`,
      );
      const plugins = await api(request, gateway, token, 'GET', '/plugin/list');
      const plugin = plugins.find(
        (item: { pluginType: string }) => item.pluginType === broker,
      );
      expect(plugin).toBeTruthy();
      for (const format of [
        'envelope_json',
        'kv',
        'timeseries_rows',
        'mapped_json',
      ] as const) {
        const name = `time-${broker}-${format}`;
        const topic = `${broker === 'pulsar' ? 'persistent://public/default/' : ''}ng-time-${run}-${format}`;
        this.topics[broker].set(topic, format);
        await api(request, gateway, token, 'POST', '/northward-app', {
          pluginId: plugin.id,
          name,
          description: 'Independent real broker timestamp evidence',
          config: {
            connection:
              broker === 'kafka'
                ? { bootstrapServers: this.connections.kafka.url }
                : { serviceUrl: this.connections.pulsar.url },
            uplink: {
              // Bound recovery across a real JVM broker restart on a loaded test host.
              ...(broker === 'pulsar'
                ? { producer: { closeTimeoutMs: 60_000 } }
                : {}),
              deviceConnected: {
                enabled: true,
                topic: `${topic}-lifecycle`,
                key: '{{device_id}}',
              },
              deviceDisconnected: {
                enabled: true,
                topic: `${topic}-lifecycle`,
                key: '{{device_id}}',
              },
              attributes: {
                enabled: true,
                topic: `${topic}-attributes`,
                key: '{{device_id}}',
              },
              telemetry: {
                enabled: true,
                topic,
                key: '{{device_id}}',
                payload:
                  format === 'mapped_json'
                    ? {
                        mode: format,
                        config: {
                          sourceTime: "'1999-01-01T00:00:00Z'",
                          batchTime: 'ts_ms',
                        },
                      }
                    : { mode: format, includeMeta: true },
              },
            },
            downlink: { enabled: false },
          },
          retryPolicy: {},
          queuePolicy: {
            latestCapacity: 10_000,
            latestMaxBytes: 32 * 1024 * 1024,
            deliveryMaxInFlight: 16,
            deliveryMaxPayloadBytes: 256 * 1024,
            deliveryTimeoutMs: 30_000,
            deliveryRetryMs: 1000,
          },
        });
        const apps = await api(
          request,
          gateway,
          token,
          'GET',
          '/northward-app/list',
        );
        const app = apps.find((item: { name: string }) => item.name === name);
        expect(app).toBeTruthy();
        await api(request, gateway, token, 'POST', '/northward-sub', {
          appId: app.id,
          allDevices: false,
          deviceIds: [deviceId],
          priority: 0,
        });
      }
    }
  }

  /** Only explicitly labelled, owned timestamp fixtures may be stopped. */
  async interrupt() {
    for (const { container } of Object.values(this.connections)) {
      const result = await promisify(execFile)('docker', [
        'inspect',
        container,
      ]);
      const [inspected] = JSON.parse(result.stdout);
      expect(inspected.Config.Labels['io.ng-gateway.time-fixture']).toBe(
        'timestamp-semantics',
      );
      expect(inspected.State.Running).toBe(true);
    }
    for (const { container } of Object.values(this.connections)) {
      this.stopped.add(container);
      await promisify(execFile)('docker', ['stop', '--time', '20', container], {
        timeout: 30_000,
      });
    }
  }

  /** Capture broker metadata and canonical sample bodies through independent clients. */
  async observe(
    freshness: 'current' | 'stale',
    oracle: MonitorPointEntry,
    testInfo: TestInfo,
    resumedAt?: number,
  ) {
    for (const broker of ['kafka', 'pulsar'] as const) {
      const result = await promisify(execFile)(
        this.python,
        [
          resolve(import.meta.dirname, 'fixtures/broker_time_probe.py'),
          broker,
          this.connections[broker].url,
          freshness,
          ...this.topics[broker].keys(),
        ],
        { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      ).catch(async (error: Error & { stderr?: string; stdout?: string }) => {
        await writeFile(
          testInfo.outputPath(`northward-${broker}-${freshness}-failure.json`),
          JSON.stringify(
            {
              message: error.message,
              stdout: error.stdout,
              stderr: error.stderr,
            },
            null,
            2,
          ),
        );
        throw error;
      });
      await writeFile(
        testInfo.outputPath(`northward-${broker}-${freshness}-consumer.stdout`),
        result.stdout,
      );
      await writeFile(
        testInfo.outputPath(`northward-${broker}-${freshness}-client.log`),
        result.stderr,
      );
      const evidence = JSON.parse(result.stdout) as ProbeEvidence;
      await writeFile(
        testInfo.outputPath(`northward-${broker}-${freshness}.json`),
        JSON.stringify(evidence, null, 2),
      );
      expect(evidence.matchedTopics).toEqual(evidence.expectedTopics);
      for (const [topic, format] of this.topics[broker]) {
        const record = evidence.records.find(
          (entry) =>
            entry.topic === topic &&
            canonicalSamples(entry.body).some(
              (sample) => sample.freshness === freshness,
            ),
        );
        if (!record)
          throw new Error(`No ${freshness} transport record for ${topic}`);
        expect(record.properties.ts_origin).toBe('batch');
        expect(record.brokerTimeMs).toBe(Number(record.properties.ts_ms));
        expect(record.key).toBe(record.properties.device_id);
        if (broker === 'kafka') expect(record.timestampType).toBe(0);
        else expect(record.publishTimeMs).toBeGreaterThan(0);
        const samples = canonicalSamples(record.body);
        expect(samples).toHaveLength(1);
        const sample = samples[0];
        if (!sample?.dataTime || !sample.receivedTime)
          throw new Error('Broker lost the complete observed sample');
        expect(sample.sourceTime).toBe(oracle.sourceTime);
        expect(sample.sourceTimeStatus).toBe(oracle.sourceTimeStatus);
        expect(sample.value).toBe(oracle.value);
        expect(sample.stateChangedAt).toBe(oracle.stateChangedAt);
        const observedOrigin = sample.sourceTime ? 'source' : 'gatewayReceived';
        expect(sample.dataTime).toEqual({
          time:
            freshness === 'stale'
              ? sample.stateChangedAt
              : (sample.sourceTime ?? sample.receivedTime),
          origin:
            freshness === 'stale' ? 'gatewayStateChanged' : observedOrigin,
          fallback:
            freshness === 'stale' || sample.sourceTime
              ? null
              : { kind: 'unavailable', status: 'notProvided' },
        });
        if (sample.sourceTime && freshness === 'current')
          expect(record.brokerTimeMs).toBeGreaterThan(
            Date.parse(sample.sourceTime),
          );
        if (format === 'timeseries_rows')
          expect(sample.ts_ms).toBe(Date.parse(sample.dataTime.time));
        if (format === 'mapped_json')
          expect(record.body).toMatchObject({
            mapped: { sourceTime: '1999-01-01T00:00:00Z' },
            sampleContract: 'boot',
          });
        if (freshness === 'stale') {
          for (const field of [
            'dataTime',
            'protocolTime',
            'receivedTime',
            'sourceQuality',
            'timeQuality',
            'updateKind',
          ] as const)
            expect(sample[field]).toEqual(oracle[field]);
          if (resumedAt === undefined)
            throw new Error('Missing broker recovery boundary');
          expect(Date.parse(sample.stateChangedAt)).toBeLessThan(resumedAt);
          expect(record.observedAtMs).toBeGreaterThanOrEqual(resumedAt);
        }
      }
    }
  }

  /** Preserve broker storage across restart and confirm protocol readiness. */
  async resume() {
    if (this.stopped.size === 0) return;
    await promisify(execFile)('docker', ['start', ...this.stopped], {
      timeout: 15_000,
    });
    for (const container of this.stopped) {
      await expect
        .poll(
          async () => {
            const result = await promisify(execFile)('docker', [
              'inspect',
              '--format',
              '{{.State.Health.Status}}',
              container,
            ]);
            return result.stdout.trim();
          },
          { timeout: 90_000, intervals: [1000, 2000] },
        )
        .toBe('healthy');
      this.stopped.delete(container);
    }
  }
}

/** Recursively locate the complete sample in any supported codec. */
function canonicalSamples(body: unknown): Sample[] {
  if (Array.isArray(body))
    return body.flatMap((child) => canonicalSamples(child));
  if (!body || typeof body !== 'object') return [];
  if ('pointId' in body && 'sourceTimeStatus' in body) return [body as Sample];
  return Object.values(body).flatMap((child) => canonicalSamples(child));
}
