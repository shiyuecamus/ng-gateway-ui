<script lang="ts" setup>
import type { HttpRequest, PingRequest, TcpConnectRequest } from '@vben/types';

import type { NetDebugTabKey } from '../schemas';

import { $t } from '@vben/locales';

import { Tabs } from 'ant-design-vue';

import HttpForm from './http-form.vue';
import PingForm from './ping-form.vue';
import TcpForm from './tcp-form.vue';

defineOptions({ name: 'NetDebugFormTabs' });

const props = defineProps<{
  activeTab: NetDebugTabKey;
  httpForm: HttpRequest;
  httpHeaders: Array<{ key: string; value: string }>;
  httpMethodOptions: Array<{ label: string; value: string }>;
  pingForm: PingRequest;
  running: boolean;
  tcpForm: TcpConnectRequest;
}>();

const emit = defineEmits<{
  (e: 'update:activeTab', v: NetDebugTabKey): void;
  (e: 'update:pingForm', v: PingRequest): void;
  (e: 'update:tcpForm', v: TcpConnectRequest): void;
  (e: 'update:httpForm', v: HttpRequest): void;
  (e: 'update:httpHeaders', v: Array<{ key: string; value: string }>): void;
  (e: 'runPing'): void;
  (e: 'runTcp'): void;
  (e: 'runHttp'): void;
}>();
</script>

<template>
  <Tabs
    :active-key="props.activeTab"
    @update:active-key="(k) => emit('update:activeTab', k as NetDebugTabKey)"
  >
    <Tabs.TabPane key="ping" :tab="$t('page.maintenance.netDebug.tabs.ping')">
      <PingForm
        :form="props.pingForm"
        :running="props.running"
        @update:form="(v) => emit('update:pingForm', v)"
        @run="emit('runPing')"
      />
    </Tabs.TabPane>
    <Tabs.TabPane key="tcp" :tab="$t('page.maintenance.netDebug.tabs.tcp')">
      <TcpForm
        :form="props.tcpForm"
        :running="props.running"
        @update:form="(v) => emit('update:tcpForm', v)"
        @run="emit('runTcp')"
      />
    </Tabs.TabPane>
    <Tabs.TabPane key="http" :tab="$t('page.maintenance.netDebug.tabs.http')">
      <HttpForm
        :form="props.httpForm"
        :headers="props.httpHeaders"
        :http-method-options="props.httpMethodOptions"
        :running="props.running"
        @update:form="(v) => emit('update:httpForm', v)"
        @update:headers="(v) => emit('update:httpHeaders', v)"
        @run="emit('runHttp')"
      />
    </Tabs.TabPane>
  </Tabs>
</template>
