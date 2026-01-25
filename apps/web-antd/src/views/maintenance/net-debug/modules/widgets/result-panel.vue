<script lang="ts" setup>
import type {
  HttpResponse,
  PingResponse,
  TcpConnectResponse,
} from '@vben/types';

import type { NetDebugResultView, NetDebugTabKey } from '../schemas';

import { computed, h } from 'vue';

import { JsonViewer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Alert, Table, Tabs, Tag, Typography } from 'ant-design-vue';

defineOptions({ name: 'NetDebugResultPanel' });

const props = defineProps<{
  activeTab: NetDebugTabKey;
  httpResult: HttpResponse | null;
  pingResult: null | PingResponse;
  resultView: NetDebugResultView;
  tcpResult: null | TcpConnectResponse;
}>();

const emit = defineEmits<{
  (e: 'update:resultView', v: NetDebugResultView): void;
}>();

const resultForActiveTab = computed(() => {
  if (props.activeTab === 'ping') return props.pingResult;
  if (props.activeTab === 'tcp') return props.tcpResult;
  return props.httpResult;
});

const pingSamples = computed(() => props.pingResult?.samples ?? []);

const pingColumns = [
  { title: 'Seq', dataIndex: 'seq', width: 80 },
  {
    title: 'RTT (ms)',
    dataIndex: 'rttMs',
    width: 120,
    customRender: ({ text }: any) => text ?? '-',
  },
  {
    title: 'Status',
    dataIndex: 'ok',
    width: 120,
    customRender: ({ text }: any) =>
      text
        ? h(Tag, { color: 'green' }, () => 'OK')
        : h(Tag, { color: 'red' }, () => 'FAIL'),
  },
  {
    title: 'Error',
    dataIndex: 'error',
    customRender: ({ text }: any) => text ?? '',
  },
];
</script>

<template>
  <div class="flex h-full flex-col">
    <Tabs
      class="mb-2"
      :active-key="props.resultView"
      @update:active-key="
        (k) => emit('update:resultView', k as NetDebugResultView)
      "
    >
      <Tabs.TabPane
        key="summary"
        :tab="$t('page.maintenance.netDebug.resultSummary')"
      />
      <Tabs.TabPane
        key="raw"
        :tab="$t('page.maintenance.netDebug.resultRaw')"
      />
    </Tabs>

    <div class="flex-1 overflow-auto">
      <template v-if="resultForActiveTab !== null">
        <template v-if="activeTab === 'ping'">
          <template v-if="props.resultView === 'summary'">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Tag color="blue">{{ pingResult?.targetIp ?? '-' }}</Tag>
              <Tag>{{ pingResult?.received }}/{{ pingResult?.sent }}</Tag>
              <Tag
                :color="
                  (pingResult?.lossPercent ?? 0) === 0 ? 'green' : 'orange'
                "
              >
                loss {{ (pingResult?.lossPercent ?? 0).toFixed(1) }}%
              </Tag>
              <Tag
                v-if="
                  pingResult?.rttAvgMs !== null &&
                  pingResult?.rttAvgMs !== undefined
                "
              >
                avg {{ pingResult?.rttAvgMs }}ms
              </Tag>
            </div>
            <Alert
              v-if="pingResult?.note"
              class="mb-3"
              type="warning"
              show-icon
              :message="pingResult.note"
            />
            <Table
              :data-source="pingSamples"
              :columns="pingColumns"
              size="small"
              :pagination="false"
              row-key="seq"
            />
          </template>
          <template v-else>
            <JsonViewer :value="pingResult" copyable :sort="false" boxed />
          </template>
        </template>

        <template v-else-if="activeTab === 'tcp'">
          <template v-if="props.resultView === 'summary'">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Tag :color="tcpResult?.connected ? 'green' : 'red'">
                {{ tcpResult?.connected ? 'CONNECTED' : 'FAILED' }}
              </Tag>
              <Tag>{{ tcpResult?.targetIp ?? '-' }}</Tag>
              <Tag
                v-if="
                  tcpResult?.connectMs !== null &&
                  tcpResult?.connectMs !== undefined
                "
              >
                {{ tcpResult?.connectMs }}ms
              </Tag>
            </div>
            <Alert
              v-if="tcpResult?.error"
              class="mb-3"
              type="error"
              show-icon
              :message="tcpResult.error"
            />
            <template v-if="tcpResult?.banner">
              <Typography.Text type="secondary">Banner</Typography.Text>
              <pre
                class="mt-2 whitespace-pre-wrap rounded bg-[var(--color-fill-tertiary)] p-3"
              >
                {{ tcpResult.banner }}
              </pre>
            </template>
          </template>
          <template v-else>
            <JsonViewer :value="tcpResult" copyable :sort="false" boxed />
          </template>
        </template>

        <template v-else>
          <template v-if="props.resultView === 'summary'">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Tag :color="httpResult?.error ? 'red' : 'green'">
                {{ httpResult?.error ? 'ERROR' : 'OK' }}
              </Tag>
              <Tag
                v-if="
                  httpResult?.status !== null &&
                  httpResult?.status !== undefined
                "
              >
                {{ httpResult?.status }}
              </Tag>
              <Tag>{{ httpResult?.totalMs }}ms</Tag>
              <Tag v-if="httpResult?.bodyTruncated" color="orange">
                TRUNCATED
              </Tag>
            </div>
            <Alert
              v-if="httpResult?.error"
              class="mb-3"
              type="error"
              show-icon
              :message="httpResult.error"
            />
            <template v-if="httpResult?.body">
              <Typography.Text type="secondary">Body</Typography.Text>
              <pre
                class="mt-2 whitespace-pre-wrap rounded bg-[var(--color-fill-tertiary)] p-3"
              >
                {{ httpResult.body }}
              </pre>
            </template>
          </template>
          <template v-else>
            <JsonViewer :value="httpResult" copyable :sort="false" boxed />
          </template>
        </template>
      </template>

      <template v-else>
        <div
          class="flex h-full items-center justify-center text-[var(--color-text-tertiary)]"
        >
          {{ $t('common.noData') }}
        </div>
      </template>
    </div>
  </div>
</template>
