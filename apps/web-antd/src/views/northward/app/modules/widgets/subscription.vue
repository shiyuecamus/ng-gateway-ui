<script lang="ts" setup>
import type { FormOpenData } from '@vben/constants';
import type { AppSubInfo, ChannelDeviceTree, IdType } from '@vben/types';
import type { TreeProps } from 'ant-design-vue';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Spin, TreeSelect, message } from 'ant-design-vue';

import {
  createAppSub,
  fetchAppSubs,
  fetchDeviceTree,
  updateAppSub,
} from '#/api';
import { useVbenForm } from '#/adapter/form';

import { useSubscriptionFormSchema } from '../schemas/form';

const CHANNEL_KEY_PREFIX = 'channel-';
const DEVICE_KEY_PREFIX = 'device-';

const emit = defineEmits<{
  submitted: [];
}>();

const { handleRequest } = useRequestHandler();

const loading = ref(false);
const saving = ref(false);
const appId = ref<IdType>();
const appName = ref('');
const subscriptionId = ref<IdType>();
const channelTree = ref<ChannelDeviceTree[]>([]);

const [Form, formApi] = useVbenForm({
  schema: useSubscriptionFormSchema(),
  showDefaultActions: false,
  handleSubmit: handleSubmit,
  submitButtonOptions: {
    show: false,
  },
  resetButtonOptions: {
    show: false,
  },
  handleValuesChange: async (values, fieldsChanged) => {
    if (fieldsChanged.includes('allDevices')) {
      if (values.allDevices) {
        if (normalizeDeviceKeys(values.deviceIds).length > 0) {
          await formApi.setFieldValue('deviceIds', []);
        }
      }
    }
  },
});

const [Modal, modalApi] = useVbenModal({
  class: 'w-1/2',
  destroyOnClose: true,
  closeOnClickModal: false,
  fullscreen: false,
  fullscreenButton: false,
  onCancel() {
    modalApi.close();
  },
  onConfirm: async () => {
    await formApi.validateAndSubmitForm();
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

const treeData = computed<TreeProps['treeData']>(() => {
  if (!channelTree.value || channelTree.value.length === 0) {
    return [];
  }
  return buildTreeData(channelTree.value);
});

function normalizeDeviceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function toChannelKey(id: IdType) {
  return `${CHANNEL_KEY_PREFIX}${id}`;
}

function toDeviceKey(id: IdType) {
  return `${DEVICE_KEY_PREFIX}${id}`;
}

function extractDeviceId(key: string) {
  return key.startsWith(DEVICE_KEY_PREFIX)
    ? key.slice(DEVICE_KEY_PREFIX.length)
    : key;
}

function buildTreeData(data: ChannelDeviceTree[]): TreeProps['treeData'] {
  return data.map((channel) => ({
    key: toChannelKey(channel.id),
    title: channel.name,
    selectable: false,
    children: channel.devices.map((device) => {
      const deviceKey = toDeviceKey(device.id);
      return {
        key: deviceKey,
        title: device.name,
      };
    }),
  }));
}

async function init() {
  const data = modalApi.getData<FormOpenData & { name?: string }>();
  appId.value = data?.id;
  appName.value = data?.name ?? '';
  subscriptionId.value = undefined;
  loading.value = true;
  await formApi.resetForm();
  try {
    await Promise.all([loadDeviceTree(), loadSubscription()]);
    await formApi.resetValidate();
  } finally {
    loading.value = false;
  }
}

async function loadDeviceTree() {
  await handleRequest(
    () => fetchDeviceTree(),
    (data) => {
      channelTree.value = data ?? [];
    },
  );
}

async function loadSubscription() {
  if (appId.value === undefined || appId.value === null) return;
  await handleRequest(
    () => fetchAppSubs(appId.value),
    async (resp) => {
      const record = (resp?.records ?? [])[0] as AppSubInfo | undefined;
      if (!record) {
        subscriptionId.value = undefined;
        return;
      }
      subscriptionId.value = record.id;
      const deviceKeys = (record.deviceIds ?? []).map((id) => toDeviceKey(id));
      await formApi.setValues(
        {
          allDevices: record.allDevices,
          deviceIds: record.allDevices ? [] : deviceKeys,
          priority: record.priority ?? 0,
        },
        false,
      );
    },
  );
}

async function handleSubmit(values: Record<string, any>) {
  if (appId.value === undefined || appId.value === null) {
    message.error($t('common.error.unknown'));
    return;
  }

  const allDevices = values.allDevices ?? false;
  const deviceKeys = normalizeDeviceKeys(values.deviceIds);
  if (!allDevices && deviceKeys.length === 0) {
    message.warning(
      $t('page.northward.app.subscriptionForm.validation.deviceRequired'),
    );
    return;
  }

  const payload = {
    appId: Number(appId.value),
    allDevices,
    deviceIds: allDevices
      ? null
      : deviceKeys.map((key) => Number(extractDeviceId(key))),
    priority: values.priority ?? 0,
  };

  saving.value = true;
  const action =
    subscriptionId.value === undefined || subscriptionId.value === null
      ? () => createAppSub(payload as AppSubInfo)
      : () =>
          updateAppSub({
            id: Number(subscriptionId.value),
            ...payload,
          } as AppSubInfo);

  await handleRequest(
    action,
    () => {
      message.success($t('common.action.saveSuccess'));
      emit('submitted');
      modalApi.close();
    },
    (error) => {
      console.error(error);
    },
  ).finally(() => {
    saving.value = false;
  });
}
</script>

<template>
  <Modal>
    <Spin :spinning="loading">
      <Form>
        <template #deviceIds="slotProps">
          <TreeSelect
            v-bind="slotProps"
            class="w-full"
            :tree-data="treeData ?? []"
            :field-names="{
              label: 'title',
              value: 'key',
              children: 'children',
            }"
            :tree-checkable="true"
            :show-search="true"
            :allow-clear="true"
            :tree-default-expand-all="true"
            :placeholder="
              $t('ui.placeholder.selectWithName', {
                name: $t('page.northward.app.subscriptionForm.devices'),
              })
            "
            :tree-node-filter-prop="'title'"
          />
        </template>
      </Form>
    </Spin>
  </Modal>
</template>

