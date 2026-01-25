<script lang="ts" setup>
import type { ActionInfo, ChannelInfo, DeviceInfo, IdType } from '@vben/types';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { JsonViewer, Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Card, message, Select } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchChannelList, getSubDevicesById } from '#/api';
import { debugAction, fetchActionsByDevice } from '#/api/core';

import {
  buildActionDebugInitialValues,
  buildActionDebugSchema,
} from './modules/schemas';

defineOptions({ name: 'MaintenanceActionDebug' });

const actionInfo = ref<ActionInfo | null>(null);
const result = ref<any>(null);

const channelOptions = ref<ChannelInfo[]>([]);
const deviceOptions = ref<DeviceInfo[]>([]);
const actionOptions = ref<ActionInfo[]>([]);

const selectedChannelId = ref<IdType | undefined>();
const selectedDeviceId = ref<IdType | undefined>();
const selectedActionId = ref<IdType | undefined>();

const isFormDisabled = computed(
  () => !selectedActionId.value || !actionInfo.value,
);

const { handleRequest } = useRequestHandler();

const [Form, formApi] = useVbenForm({
  commonConfig: {
    labelClass: 'text-[14px] w-1/4',
  },
  handleSubmit: async (values: Record<string, any>) => {
    if (!selectedActionId.value) return;
    const { timeoutMs, ...params } = values;
    await handleRequest(
      () =>
        debugAction(selectedActionId.value!, {
          params,
          timeoutMs: timeoutMs ?? 5000,
        }),
      (data) => {
        result.value = data;
        message.success($t('common.success'));
      },
    );
  },
  schema: [],
  submitButtonOptions: {
    content: $t('page.southward.action.test'),
  },
  resetButtonOptions: {
    show: false,
  },
  showDefaultActions: true,
});

function resetForm() {
  actionInfo.value = null;
  result.value = null;
  formApi.setState({ schema: [] });
  formApi.setValues({});
}

async function applyAction(info: ActionInfo | null) {
  if (!info) {
    resetForm();
    return;
  }

  // 选择动作只做表单初始化，不再显示 loading 骨架
  result.value = null;
  actionInfo.value = info;
  const schema = buildActionDebugSchema(info);
  formApi.setState({ schema });
  const initValues = buildActionDebugInitialValues(info);
  formApi.setValues(initValues);
}

async function loadChannels() {
  const resp = await handleRequest(() => fetchChannelList());
  if (!resp) {
    return;
  }
  channelOptions.value = resp ?? [];
}

async function loadDevices() {
  if (!selectedChannelId.value) {
    deviceOptions.value = [];
    return;
  }
  const resp = await handleRequest(() =>
    getSubDevicesById(selectedChannelId.value!),
  );
  if (!resp) {
    return;
  }
  deviceOptions.value = resp ?? [];
}

async function loadActions() {
  if (!selectedDeviceId.value) {
    actionOptions.value = [];
    resetForm();
    return;
  }
  const resp = await handleRequest(() =>
    fetchActionsByDevice(selectedDeviceId.value!),
  );
  if (!resp) {
    return;
  }
  actionOptions.value = resp ?? [];
  const matched = actionOptions.value.find(
    (item) => item.id === selectedActionId.value,
  );
  await applyAction(matched ?? null);
}

watch(selectedChannelId, async () => {
  selectedDeviceId.value = undefined;
  selectedActionId.value = undefined;
  deviceOptions.value = [];
  actionOptions.value = [];
  resetForm();
  await loadDevices();
});

watch(selectedDeviceId, async () => {
  selectedActionId.value = undefined;
  resetForm();
  await loadActions();
});

watch(selectedActionId, async () => {
  const matched = actionOptions.value.find(
    (item) => item.id === selectedActionId.value,
  );
  await applyAction(matched ?? null);
});

onMounted(async () => {
  await nextTick();
  await loadChannels();
});
</script>

<template>
  <Page auto-content-height class="h-full">
    <div class="flex h-full flex-col gap-4">
      <Card :body-style="{ padding: '16px' }">
        <div class="flex items-center gap-3">
          <Select
            v-model:value="selectedChannelId"
            :allow-clear="true"
            :options="
              channelOptions.map((c) => ({
                label: c.name,
                value: c.id,
              }))
            "
            class="w-52"
            :placeholder="$t('page.monitor.realtime.channel')"
          />
          <Select
            v-model:value="selectedDeviceId"
            :allow-clear="true"
            :disabled="!selectedChannelId"
            :options="
              deviceOptions.map((d) => ({
                label: d.deviceName,
                value: d.id,
              }))
            "
            class="w-64"
            :placeholder="$t('page.monitor.realtime.device')"
          />
          <Select
            v-model:value="selectedActionId"
            :allow-clear="true"
            :options="
              actionOptions.map((a) => ({
                label: a.name,
                value: a.id,
              }))
            "
            class="w-64"
            :placeholder="$t('page.southward.action.title')"
            :disabled="!selectedDeviceId"
          />
        </div>
      </Card>

      <div class="flex flex-1 flex-col">
        <div class="grid h-full grid-cols-2 gap-4">
          <Card
            :title="$t('page.southward.action.parameter.title')"
            class="flex h-full flex-col"
            :body-style="{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
            }"
          >
            <div class="flex-1 overflow-auto">
              <Form :disabled="isFormDisabled" />
            </div>
          </Card>
          <Card
            :title="$t('common.result')"
            class="flex h-full flex-col"
            :body-style="{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
            }"
          >
            <div class="flex-1 overflow-auto">
              <template v-if="result !== null">
                <JsonViewer :value="result" copyable :sort="false" boxed />
              </template>
              <template v-else>
                <div
                  class="flex h-full items-center justify-center text-[var(--color-text-tertiary)]"
                >
                  {{ $t('common.noData') }}
                </div>
              </template>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </Page>
</template>
