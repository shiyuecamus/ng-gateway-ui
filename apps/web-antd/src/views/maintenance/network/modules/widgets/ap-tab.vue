<script lang="ts" setup>
import type { ApStatus, ConfigureApRequest, NetworkCapabilities } from '@vben/types';

import { computed, onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Spin,
} from 'ant-design-vue';

import { configureAp, fetchApStatus, startAp, stopAp } from '#/api/core';

const props = defineProps<{
  capabilities: NetworkCapabilities | null;
  isMobile: boolean;
}>();

const { handleRequest } = useRequestHandler();

const loading = ref(false);
const applying = ref(false);
const starting = ref(false);
const stopping = ref(false);
const status = ref<ApStatus | null>(null);

const form = ref({
  ssid: '',
  password: '',
  channel: 0,
});

const canManageAp = computed(
  () => props.capabilities?.canManageAp === true,
);

const apMode = computed(
  () => props.capabilities?.apMode ?? 'unavailable',
);

const isExclusive = computed(
  () => apMode.value === 'exclusive',
);

const isActive = computed(
  () => status.value?.active === true,
);

const staApLabel = computed(() => {
  switch (apMode.value) {
    case 'concurrent': {
      return $t('page.maintenance.network.apConfig.staApSingle');
    }
    case 'dedicated_card': {
      return $t('page.maintenance.network.apConfig.staApDual');
    }
    case 'exclusive': {
      return $t('page.maintenance.network.apConfig.staApExclusive');
    }
    default: {
      return $t('page.maintenance.network.apConfig.staApNone');
    }
  }
});

async function loadStatus() {
  loading.value = true;
  await handleRequest(
    () => fetchApStatus(),
    (data: ApStatus) => {
      status.value = data;
      if (data.ssid) form.value.ssid = data.ssid;
      if (data.channel) form.value.channel = data.channel;
    },
  );
  loading.value = false;
}

// ─── Start / Stop ───

const confirmStartOpen = ref(false);
const confirmStopOpen = ref(false);

function requestStart() {
  if (isExclusive.value) {
    if (props.isMobile) {
      confirmStartOpen.value = true;
    } else {
      Modal.confirm({
        title: $t('page.maintenance.network.apConfig.start'),
        content: $t('page.maintenance.network.apConfig.startConfirmExclusive'),
        okText: $t('page.maintenance.network.confirmAction'),
        cancelText: $t('page.maintenance.network.confirmCancel'),
        okType: 'danger',
        onOk: () => doStart(),
      });
    }
  } else {
    doStart();
  }
}

async function doStart() {
  confirmStartOpen.value = false;
  starting.value = true;
  await handleRequest(
    () => startAp(),
    (data: ApStatus) => {
      status.value = data;
      message.success($t('page.maintenance.network.apConfig.startSuccess'));
    },
  );
  starting.value = false;
}

function requestStop() {
  if (props.isMobile) {
    confirmStopOpen.value = true;
  } else {
    Modal.confirm({
      title: $t('page.maintenance.network.apConfig.stop'),
      content: $t('page.maintenance.network.apConfig.stopConfirm'),
      okText: $t('page.maintenance.network.confirmAction'),
      cancelText: $t('page.maintenance.network.confirmCancel'),
      onOk: () => doStop(),
    });
  }
}

async function doStop() {
  confirmStopOpen.value = false;
  stopping.value = true;
  await handleRequest(
    () => stopAp(),
    (data: ApStatus) => {
      status.value = data;
      message.success($t('page.maintenance.network.apConfig.stopSuccess'));
      if (data.staRestoreFailed) {
        Modal.warning({
          title: $t('page.maintenance.network.apConfig.staRestoreFailedTitle'),
          content: $t('page.maintenance.network.apConfig.staRestoreFailedDesc'),
        });
      }
    },
  );
  stopping.value = false;
}

// ─── Configure ───

const confirmApplyOpen = ref(false);

function requestApply() {
  if (props.isMobile) {
    confirmApplyOpen.value = true;
  } else {
    Modal.confirm({
      title: $t('page.maintenance.network.apConfig.confirmApply'),
      content: $t('page.maintenance.network.apConfig.confirmApplyDesc'),
      okText: $t('page.maintenance.network.confirmAction'),
      cancelText: $t('page.maintenance.network.confirmCancel'),
      onOk: () => applyConfig(),
    });
  }
}

async function applyConfig() {
  confirmApplyOpen.value = false;
  applying.value = true;
  const payload: ConfigureApRequest = {
    ssid: form.value.ssid || undefined,
    password: form.value.password || undefined,
    channel: form.value.channel,
    restart: true,
  };

  await handleRequest(
    () => configureAp(payload),
    (data: ApStatus) => {
      status.value = data;
      form.value.password = '';
      message.success($t('page.maintenance.network.apConfig.applySuccess'));
    },
  );
  applying.value = false;
}

onMounted(() => {
  loadStatus();
});
</script>

<template>
  <div>
    <!-- Hardware not supported warning -->
    <Alert
      v-if="!canManageAp"
      type="warning"
      show-icon
      :message="$t('page.maintenance.network.apConfig.notAvailable')"
      class="mb-4"
    />

    <!-- Exclusive mode warning -->
    <Alert
      v-if="canManageAp && isExclusive"
      type="warning"
      show-icon
      :message="$t('page.maintenance.network.apConfig.exclusiveWarning')"
      class="mb-4"
    />

    <Spin :spinning="loading">
      <!-- Status display + Start/Stop controls -->
      <div v-if="status" class="mb-4">
        <div v-if="canManageAp" class="mb-3 flex items-center gap-3">
          <Badge
            :status="isActive ? 'success' : 'default'"
            :text="isActive
              ? $t('page.maintenance.network.apConfig.active')
              : $t('page.maintenance.network.apConfig.inactive')"
          />
          <Button
            v-if="!isActive"
            type="primary"
            size="small"
            :loading="starting"
            @click="requestStart"
          >
            {{ $t('page.maintenance.network.apConfig.start') }}
          </Button>
          <Button
            v-if="isActive"
            danger
            size="small"
            :loading="stopping"
            @click="requestStop"
          >
            {{ $t('page.maintenance.network.apConfig.stop') }}
          </Button>
        </div>

        <Descriptions size="small" :column="isMobile ? 1 : 2" bordered>
          <Descriptions.Item :label="$t('page.maintenance.network.apConfig.status')">
            <Badge
              :status="isActive ? 'success' : 'default'"
              :text="isActive
                ? $t('page.maintenance.network.apConfig.active')
                : $t('page.maintenance.network.apConfig.inactive')"
            />
          </Descriptions.Item>
          <Descriptions.Item label="SSID">
            {{ status.ssid || '—' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.apConfig.channel')">
            {{ status.channel || '—' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.apConfig.ip')">
            {{ status.ipAddress || '—' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('page.maintenance.network.apConfig.clients')">
            {{ status.connectedClients ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="STA+AP">
            {{ staApLabel }}
          </Descriptions.Item>
        </Descriptions>
      </div>

      <!-- Configuration form -->
      <Form
        v-if="canManageAp"
        layout="vertical"
        :class="isMobile ? 'w-full' : 'max-w-lg'"
      >
        <Alert
          type="info"
          show-icon
          :message="$t('page.maintenance.network.apConfig.restartHint')"
          class="!mb-4"
        />

        <Form.Item :label="$t('page.maintenance.network.apConfig.ssid')">
          <Input
            v-model:value="form.ssid"
            placeholder="NG-Gateway-XXXX"
            class="!text-base"
          />
        </Form.Item>

        <Form.Item :label="$t('page.maintenance.network.apConfig.password')">
          <Input.Password
            v-model:value="form.password"
            placeholder="8-63 characters"
            class="!text-base"
          />
        </Form.Item>

        <Form.Item :label="$t('page.maintenance.network.apConfig.channel')">
          <InputNumber
            v-model:value="form.channel"
            :min="0"
            :max="13"
            class="!w-full"
            inputmode="numeric"
          />
          <span class="text-xs text-gray-400">
            0 = {{ $t('page.maintenance.network.apConfig.channelAuto') }}
          </span>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            :loading="applying"
            :block="isMobile"
            @click="requestApply"
          >
            {{ applying
              ? $t('page.maintenance.network.apConfig.applying')
              : $t('page.maintenance.network.apConfig.apply') }}
          </Button>
        </Form.Item>
      </Form>
    </Spin>

    <!-- Mobile confirmation sheets -->
    <Drawer
      v-if="isMobile"
      :open="confirmStartOpen"
      placement="bottom"
      height="auto"
      :closable="true"
      :title="$t('page.maintenance.network.apConfig.start')"
      class="confirm-sheet"
      @close="confirmStartOpen = false"
    >
      <p class="mb-4 text-sm text-gray-600">
        {{ isExclusive
          ? $t('page.maintenance.network.apConfig.startConfirmExclusive')
          : $t('page.maintenance.network.apConfig.startConfirmNormal') }}
      </p>
      <div class="flex gap-3">
        <Button block @click="confirmStartOpen = false">
          {{ $t('page.maintenance.network.confirmCancel') }}
        </Button>
        <Button type="primary" :danger="isExclusive" block :loading="starting" @click="doStart">
          {{ $t('page.maintenance.network.confirmAction') }}
        </Button>
      </div>
    </Drawer>

    <Drawer
      v-if="isMobile"
      :open="confirmStopOpen"
      placement="bottom"
      height="auto"
      :closable="true"
      :title="$t('page.maintenance.network.apConfig.stop')"
      class="confirm-sheet"
      @close="confirmStopOpen = false"
    >
      <p class="mb-4 text-sm text-gray-600">
        {{ $t('page.maintenance.network.apConfig.stopConfirm') }}
      </p>
      <div class="flex gap-3">
        <Button block @click="confirmStopOpen = false">
          {{ $t('page.maintenance.network.confirmCancel') }}
        </Button>
        <Button type="primary" danger block :loading="stopping" @click="doStop">
          {{ $t('page.maintenance.network.confirmAction') }}
        </Button>
      </div>
    </Drawer>

    <Drawer
      v-if="isMobile"
      :open="confirmApplyOpen"
      placement="bottom"
      height="auto"
      :closable="true"
      :title="$t('page.maintenance.network.apConfig.confirmApply')"
      class="confirm-sheet"
      @close="confirmApplyOpen = false"
    >
      <p class="mb-4 text-sm text-gray-600">
        {{ $t('page.maintenance.network.apConfig.confirmApplyDesc') }}
      </p>
      <div class="flex gap-3">
        <Button block @click="confirmApplyOpen = false">
          {{ $t('page.maintenance.network.confirmCancel') }}
        </Button>
        <Button type="primary" block :loading="applying" @click="applyConfig">
          {{ $t('page.maintenance.network.confirmAction') }}
        </Button>
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
.confirm-sheet :deep(.ant-drawer-content-wrapper) {
  border-radius: 12px 12px 0 0;
}

.confirm-sheet :deep(.ant-drawer-body) {
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
