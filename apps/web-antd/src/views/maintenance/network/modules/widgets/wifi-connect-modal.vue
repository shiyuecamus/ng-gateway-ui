<script lang="ts" setup>
import type { WifiAccessPoint, WifiConnectRequest } from '@vben/types';

import { computed, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import { Button, Checkbox, Form, Input, Modal, Result, Spin, Tag } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    ap: WifiAccessPoint | null;
    connecting: boolean;
    connectResult?: 'idle' | 'success' | 'failed';
    isMobile?: boolean;
    /** Render as inline form (used inside Drawer bottom-sheet) */
    inlineMode?: boolean;
  }>(),
  {
    connectResult: 'idle',
    isMobile: false,
    inlineMode: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  connect: [request: WifiConnectRequest];
}>();

const password = ref('');
const isHidden = ref(false);
const hiddenSsid = ref('');

watch(
  () => props.open,
  (val) => {
    if (val) {
      password.value = '';
      isHidden.value = false;
      hiddenSsid.value = '';
    }
  },
);

const needsPassword = computed(
  () => props.ap && props.ap.security !== 'OPEN',
);

const title = computed(() =>
  props.ap
    ? `${$t('page.maintenance.network.wifiConfig.connect')} — ${props.ap.ssid}`
    : $t('page.maintenance.network.wifiConfig.connectToHidden'),
);

const securityLabel = computed(() => {
  if (!props.ap) return '';
  const map: Record<string, string> = {
    OPEN: $t('page.maintenance.network.wifiConfig.securityOpen'),
    WPA_PSK: 'WPA-PSK',
    WPA2_PSK: 'WPA2-PSK',
    WPA3_SAE: 'WPA3-SAE',
    WEP: 'WEP',
    WPA_ENTERPRISE: 'WPA-Enterprise',
    WPA2_ENTERPRISE: 'WPA2-Enterprise',
  };
  return map[props.ap.security] ?? props.ap.security;
});

function handleOk() {
  const ssid = isHidden.value ? hiddenSsid.value.trim() : props.ap?.ssid;
  if (!ssid) return;

  emit('connect', {
    ssid,
    password: password.value || undefined,
    hidden: isHidden.value || undefined,
  });
}
</script>

<template>
  <!-- Success/failure animation overlay -->
  <template v-if="connectResult !== 'idle' && inlineMode">
    <div class="flex flex-col items-center py-6">
      <Result
        v-if="connectResult === 'success'"
        status="success"
        :title="$t('page.maintenance.network.wifiConfig.connectSuccess')"
      />
      <Result
        v-else
        status="error"
        :title="$t('page.maintenance.network.wifiConfig.connectFailed')"
      />
    </div>
  </template>

  <!-- Inline mode: rendered inside parent Drawer (bottom-sheet) -->
  <template v-else-if="inlineMode">
    <Spin :spinning="connecting" :tip="$t('page.maintenance.network.wifiConfig.connecting')">
      <Form layout="vertical" class="pt-2">
        <div v-if="ap" class="mb-4 flex flex-wrap items-center gap-2">
          <Tag>{{ securityLabel }}</Tag>
          <Tag>{{ ap.band }}</Tag>
          <Tag>Ch {{ ap.channel }}</Tag>
          <span class="text-xs text-gray-400">{{ ap.signalQuality }}%</span>
        </div>

        <Form.Item
          v-if="!ap"
          :label="$t('page.maintenance.network.wifiConfig.hiddenSsid')"
          required
        >
          <Input
            v-model:value="hiddenSsid"
            class="!text-base"
            inputmode="text"
          />
        </Form.Item>

        <Form.Item
          v-if="needsPassword || !ap"
          :label="$t('page.maintenance.network.wifiConfig.password')"
          :help="needsPassword ? $t('page.maintenance.network.wifiConfig.passwordRequired') : undefined"
        >
          <Input.Password
            v-model:value="password"
            class="!text-base"
          />
        </Form.Item>

        <Form.Item v-if="!ap">
          <Checkbox v-model:checked="isHidden">
            {{ $t('page.maintenance.network.wifiConfig.hiddenNetwork') }}
          </Checkbox>
        </Form.Item>

        <Form.Item class="!mb-0">
          <div class="flex gap-3">
            <Button block @click="emit('cancel')">
              {{ $t('common.cancel') }}
            </Button>
            <Button type="primary" block :loading="connecting" @click="handleOk">
              {{ $t('page.maintenance.network.wifiConfig.connect') }}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Spin>
  </template>

  <!-- Desktop mode: standard Modal -->
  <Modal
    v-else
    :open="open"
    :title="title"
    :confirm-loading="connecting"
    :ok-text="$t('page.maintenance.network.wifiConfig.connect')"
    @ok="handleOk"
    @cancel="emit('cancel')"
  >
    <!-- Connect result overlay inside modal -->
    <template v-if="connectResult !== 'idle'">
      <div class="flex flex-col items-center py-4">
        <Result
          v-if="connectResult === 'success'"
          status="success"
          :title="$t('page.maintenance.network.wifiConfig.connectSuccess')"
        />
        <Result
          v-else
          status="error"
          :title="$t('page.maintenance.network.wifiConfig.connectFailed')"
        />
      </div>
    </template>

    <Spin v-else :spinning="connecting" :tip="$t('page.maintenance.network.wifiConfig.connecting')">
      <Form layout="vertical" class="mt-4">
        <div v-if="ap" class="mb-4 flex items-center gap-2">
          <Tag>{{ securityLabel }}</Tag>
          <Tag>{{ ap.band }}</Tag>
          <Tag>Ch {{ ap.channel }}</Tag>
          <span class="text-xs text-gray-400">{{ ap.signalQuality }}%</span>
        </div>

        <Form.Item
          v-if="!ap"
          :label="$t('page.maintenance.network.wifiConfig.hiddenSsid')"
          required
        >
          <Input v-model:value="hiddenSsid" />
        </Form.Item>

        <Form.Item
          v-if="needsPassword || !ap"
          :label="$t('page.maintenance.network.wifiConfig.password')"
          :help="needsPassword ? $t('page.maintenance.network.wifiConfig.passwordRequired') : undefined"
        >
          <Input.Password v-model:value="password" />
        </Form.Item>

        <Form.Item v-if="!ap">
          <Checkbox v-model:checked="isHidden">
            {{ $t('page.maintenance.network.wifiConfig.hiddenNetwork') }}
          </Checkbox>
        </Form.Item>
      </Form>
    </Spin>
  </Modal>
</template>
