<script lang="ts" setup>
import type {
  HttpRequest,
  HttpResponse,
  PingRequest,
  PingResponse,
  TcpConnectRequest,
  TcpConnectResponse,
} from '@vben/types';

import type { NetDebugTabKey } from './modules/schemas';

import { computed, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Card } from 'ant-design-vue';

import { netDebugHttp, netDebugPing, netDebugTcp } from '#/api/core';

import {
  DEFAULT_HTTP_FORM,
  DEFAULT_HTTP_HEADERS,
  DEFAULT_PING_FORM,
  DEFAULT_TCP_FORM,
  HTTP_METHOD_OPTIONS,
} from './modules/schemas';
import FormTabs from './modules/widgets/form-tabs.vue';
import ResultPanel from './modules/widgets/result-panel.vue';

defineOptions({ name: 'MaintenanceNetDebug' });

const activeTab = ref<NetDebugTabKey>('ping');
const running = ref(false);
const resultView = ref<'raw' | 'summary'>('summary');

const { handleRequest } = useRequestHandler();

const pingForm = ref<PingRequest>({ ...DEFAULT_PING_FORM });

const tcpForm = ref<TcpConnectRequest>({ ...DEFAULT_TCP_FORM });

const httpHeaders = ref<Array<{ key: string; value: string }>>([
  ...DEFAULT_HTTP_HEADERS,
]);

const httpForm = ref<HttpRequest>({ ...DEFAULT_HTTP_FORM });

const pingResult = ref<null | PingResponse>(null);
const tcpResult = ref<null | TcpConnectResponse>(null);
const httpResult = ref<HttpResponse | null>(null);

watch(activeTab, () => {
  // keep form state; only reset result view
  resultView.value = 'summary';
});

async function runPing() {
  const form = pingForm.value;
  if (!form.host?.trim()) return;
  running.value = true;
  pingResult.value = null;

  const req: PingRequest = {
    host: form.host.trim(),
    count: form.count,
    timeoutMs: form.timeoutMs,
    intervalMs: form.intervalMs,
    mode: form.mode,
    tcpPort: form.tcpPort,
    payloadBytes: form.payloadBytes,
  };

  await handleRequest(
    () => netDebugPing(req),
    (data) => {
      pingResult.value = data;
    },
  );

  running.value = false;
}

async function runTcp() {
  const form = tcpForm.value;
  if (!form.host?.trim() || !form.port) return;
  running.value = true;
  tcpResult.value = null;

  const req: TcpConnectRequest = {
    host: form.host.trim(),
    port: form.port,
    timeoutMs: form.timeoutMs,
    readBanner: form.readBanner,
    bannerBytes: form.bannerBytes,
  };

  await handleRequest(
    () => netDebugTcp(req),
    (data) => {
      tcpResult.value = data;
    },
  );

  running.value = false;
}

function normalizeHeaders() {
  return httpHeaders.value
    .map((h) => [h.key.trim(), h.value] as [string, string])
    .filter(([k]) => k.length > 0);
}

async function runHttp() {
  const form = httpForm.value;
  if (!form.url?.trim()) return;
  running.value = true;
  httpResult.value = null;

  const headers = normalizeHeaders();
  const req: HttpRequest = {
    method: form.method,
    url: form.url.trim(),
    timeoutMs: form.timeoutMs,
    followRedirects: form.followRedirects,
    insecureTls: form.insecureTls,
    maxResponseBytes: form.maxResponseBytes,
    headers: headers.length > 0 ? headers : undefined,
    body: form.body?.length ? form.body : undefined,
  };

  await handleRequest(
    () => netDebugHttp(req),
    (data) => {
      httpResult.value = data;
    },
  );

  running.value = false;
}

const httpMethodOptions = computed(() => HTTP_METHOD_OPTIONS);
</script>

<template>
  <Page auto-content-height class="h-full">
    <div class="flex h-full flex-col gap-4">
      <div class="grid flex-1 grid-cols-2 gap-4">
        <Card
          class="flex h-full flex-col"
          :body-style="{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
          }"
        >
          <div class="flex-1 overflow-auto">
            <FormTabs
              v-model:active-tab="activeTab"
              v-model:ping-form="pingForm"
              v-model:tcp-form="tcpForm"
              v-model:http-form="httpForm"
              v-model:http-headers="httpHeaders"
              :running="running"
              :http-method-options="httpMethodOptions"
              @run-ping="runPing"
              @run-tcp="runTcp"
              @run-http="runHttp"
            />
          </div>
        </Card>

        <Card
          class="flex h-full flex-col"
          :body-style="{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
          }"
          :title="$t('common.result')"
        >
          <ResultPanel
            v-model:result-view="resultView"
            :active-tab="activeTab"
            :ping-result="pingResult"
            :tcp-result="tcpResult"
            :http-result="httpResult"
          />
        </Card>
      </div>
    </div>
  </Page>
</template>
