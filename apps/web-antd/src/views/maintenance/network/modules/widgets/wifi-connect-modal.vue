<script lang="ts" setup>
import type { IpConfig, IpMethod, WifiAccessPoint, WifiConnectRequest } from '@vben/types';

import { computed, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

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

const ipMethod = ref<IpMethod>('dhcp');
const staticIp = ref('');
const staticPrefix = ref(24);
const staticGateway = ref('');
const staticDns = ref('');

watch(
  () => props.open,
  (val) => {
    if (val) {
      password.value = '';
      isHidden.value = false;
      hiddenSsid.value = '';
      ipMethod.value = 'dhcp';
      staticIp.value = '';
      staticPrefix.value = 24;
      staticGateway.value = '';
      staticDns.value = '';
    }
  },
);

const isStaticIp = computed(() => ipMethod.value === 'static');

const ipModeOptions = computed(() => [
  { label: $t('page.maintenance.network.dhcp'), value: 'dhcp' },
  { label: $t('page.maintenance.network.static'), value: 'static' },
]);

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

function buildIpConfig(): IpConfig | undefined {
  if (ipMethod.value !== 'static') return undefined;
  if (!staticIp.value) return undefined;
  const dnsServers = staticDns.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    method: 'static' as const,
    ipAddress: staticIp.value,
    prefixLength: staticPrefix.value,
    gateway: staticGateway.value || null,
    dns: dnsServers.length > 0 ? dnsServers : null,
  };
}

function handleOk() {
  const ssid = isHidden.value ? hiddenSsid.value.trim() : props.ap?.ssid;
  if (!ssid) return;

  const ipConfig = buildIpConfig();

  emit('connect', {
    ssid,
    password: password.value || undefined,
    hidden: isHidden.value || undefined,
    ...(ipConfig ? { ipConfig } : {}),
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

        <Collapse ghost class="!-mx-4 !mb-2">
          <Collapse.Panel key="ip" :header="$t('page.maintenance.network.wifiConfig.advancedSettings')">
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
              <Select v-model:value="ipMethod" :options="ipModeOptions" class="!text-base" />
            </Form.Item>
            <template v-if="isStaticIp">
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipAddress')" required>
                <Input v-model:value="staticIp" placeholder="192.168.1.100" inputmode="decimal" class="!text-base" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.prefixLength')" required>
                <InputNumber v-model:value="staticPrefix" :min="1" :max="32" class="!w-full" inputmode="numeric" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.gateway')">
                <Input v-model:value="staticGateway" placeholder="192.168.1.1" inputmode="decimal" class="!text-base" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.dnsServers')">
                <Input.TextArea v-model:value="staticDns" :rows="2" :placeholder="$t('page.maintenance.network.wiredConfig.dnsHint')" class="!text-base" />
              </Form.Item>
            </template>
          </Collapse.Panel>
        </Collapse>

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

        <Collapse ghost class="!mb-2">
          <Collapse.Panel key="ip" :header="$t('page.maintenance.network.wifiConfig.advancedSettings')">
            <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipMode')">
              <Select v-model:value="ipMethod" :options="ipModeOptions" />
            </Form.Item>
            <template v-if="isStaticIp">
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.ipAddress')" required>
                <Input v-model:value="staticIp" placeholder="192.168.1.100" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.prefixLength')" required>
                <InputNumber v-model:value="staticPrefix" :min="1" :max="32" class="!w-full" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.gateway')">
                <Input v-model:value="staticGateway" placeholder="192.168.1.1" />
              </Form.Item>
              <Form.Item :label="$t('page.maintenance.network.wiredConfig.dnsServers')">
                <Input.TextArea v-model:value="staticDns" :rows="2" :placeholder="$t('page.maintenance.network.wiredConfig.dnsHint')" />
              </Form.Item>
            </template>
          </Collapse.Panel>
        </Collapse>
      </Form>
    </Spin>
  </Modal>
</template>
