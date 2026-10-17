<script lang="ts" setup>
import type {
  ActionDebugRequest,
  ActionInfo,
  ChannelInfo,
  DeviceInfo,
  IdType,
} from '@vben/types';

import type { ControlIntent, StoredControlIntent } from './modules/intent';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { JsonViewer, Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { Alert, Button, Card, Input, Select } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { fetchChannelList, getSubDevicesById } from '#/api';
import { debugAction, fetchActionsByDevice } from '#/api/core';
import {
  findControlOperation,
  getControlCapabilities,
  getControlServiceStatus,
} from '#/api/core/control';

import ControlAuthorityView from './modules/authority.vue';
import ControlHistoryView from './modules/history.vue';
import {
  listControlIntents,
  loadControlIntent,
  prepareControlIntent,
  resetControlIntent,
} from './modules/intent';
import ControlOperationView from './modules/operation.vue';
import {
  buildActionDebugInitialValues,
  buildActionDebugSchema,
} from './modules/schemas';

defineOptions({ name: 'MaintenanceActionDebug' });

const userStore = useUserStore();
const principal = computed(() =>
  userStore.userInfo ? `user:${userStore.userInfo.id}` : '',
);

const actionInfo = ref<ActionInfo | null>(null);
const operationId = ref('');
const lookupId = ref('');
const lookupKey = ref('');
const lookupMessage = ref('');
const storedIntents = ref<StoredControlIntent[]>([]);
const submitting = ref(false);
const canExecute = ref(false);
const canEngineer = ref(false);
const canReadAll = ref(false);
const controlFault = ref('');
const canReconcile = ref(false);

const channelOptions = ref<ChannelInfo[]>([]);
const deviceOptions = ref<DeviceInfo[]>([]);
const actionOptions = ref<ActionInfo[]>([]);

const selectedChannelId = ref<IdType | undefined>();
const selectedDeviceId = ref<IdType | undefined>();
const selectedActionId = ref<IdType | undefined>();
let disposed = false;
let mounted = false;
type ActionIntentRequest = Omit<ActionDebugRequest, 'idempotencyKey'>;
const selectedIntent = computed(() =>
  storedIntents.value.find(
    (intent) => intent.target === `action:${selectedActionId.value}`,
  ),
);

function refreshStoredIntents() {
  storedIntents.value = listControlIntents(principal.value).filter((intent) =>
    intent.target.startsWith('action:'),
  );
}

function replaceIntent() {
  if (!selectedActionId.value || !principal.value) return;
  resetControlIntent(principal.value, `action:${selectedActionId.value}`);
  refreshStoredIntents();
}

function displayOperation(id: string, owner: string) {
  if (disposed || owner !== principal.value) return;
  operationId.value = id;
  sessionStorage.setItem(`ng-control-last-operation:${owner}`, id);
}

async function recoverIntent() {
  const owner = principal.value;
  const key = lookupKey.value.trim();
  if (!owner || !key) return;
  lookupMessage.value = '';
  await handleRequest(
    () => findControlOperation(key),
    (details) => {
      if (owner !== principal.value) return;
      if (details) displayOperation(details.operation.operationId, owner);
      else lookupMessage.value = $t('page.control.operationNotRegistered');
    },
  );
}

async function sendIntent(
  actionId: Exclude<IdType, undefined>,
  intent: ControlIntent<ActionIntentRequest>,
) {
  if (submitting.value) return;
  const owner = principal.value;
  submitting.value = true;
  try {
    await handleRequest(
      async () => {
        const existing = await findControlOperation(intent.idempotencyKey);
        if (disposed || owner !== principal.value) return null;
        return (
          existing?.operation ??
          (await debugAction(actionId, {
            ...intent.request,
            idempotencyKey: intent.idempotencyKey,
          }))
        );
      },
      (operation) => {
        if (operation) displayOperation(operation.operationId, owner);
      },
    );
  } finally {
    if (owner === principal.value) submitting.value = false;
  }
}

async function retryOriginalIntent() {
  const id = selectedActionId.value;
  if (!id || !principal.value || !canExecute.value) return;
  const intent = loadControlIntent<ActionIntentRequest>(
    principal.value,
    `action:${id}`,
  );
  if (intent) await sendIntent(id, intent);
}

const configurationActive = computed(() => {
  const configuration = channelOptions.value.find(
    (channel) => channel.id === selectedChannelId.value,
  )?.configuration;
  return (
    configuration?.state === 'active' &&
    configuration.desiredRevision === configuration.appliedRevision
  );
});

const isFormDisabled = computed(
  () =>
    !configurationActive.value ||
    !principal.value ||
    !canExecute.value ||
    !selectedActionId.value ||
    !actionInfo.value ||
    !channelOptions.value.find(
      (channel) => channel.id === selectedChannelId.value,
    )?.configuration?.appliedRevision,
);

const { handleRequest } = useRequestHandler();

const [Form, formApi] = useVbenForm({
  commonConfig: {
    labelClass: 'text-[14px] w-1/4',
  },
  handleSubmit: async (values: Record<string, any>) => {
    if (
      !selectedActionId.value ||
      isFormDisabled.value ||
      submitting.value ||
      selectedIntent.value
    )
      return;
    const { timeoutMs, ...params } = values;
    const selectedId = selectedActionId.value;
    const expectedConfigurationRevision = channelOptions.value.find(
      (channel) => channel.id === selectedChannelId.value,
    )?.configuration?.appliedRevision;
    if (!expectedConfigurationRevision) return;
    const request = {
      expectedChannelId: Number(selectedChannelId.value),
      expectedDeviceId: Number(selectedDeviceId.value),
      params,
      timeoutMs: timeoutMs ?? 5000,
      expectedConfigurationRevision,
    };
    const device = deviceOptions.value.find(
      (entry) => entry.id === selectedDeviceId.value,
    );
    if (
      String(actionInfo.value?.deviceId) !== String(selectedDeviceId.value) ||
      String(device?.channelId) !== String(selectedChannelId.value)
    )
      return;
    const intent = prepareControlIntent(
      principal.value,
      `action:${selectedId}`,
      request,
    );
    refreshStoredIntents();
    lookupKey.value = intent.idempotencyKey;
    await sendIntent(selectedId, intent);
  },
  schema: [],
  submitButtonOptions: {
    content: $t('page.control.execute'),
  },
  resetButtonOptions: {
    show: false,
  },
  showDefaultActions: true,
});

/** Disabled action selection must also disable the visible submit affordance. */
watch(
  [isFormDisabled, selectedIntent, submitting],
  () =>
    formApi.setState({
      submitButtonOptions: {
        content: $t('page.control.execute'),
        disabled:
          isFormDisabled.value || !!selectedIntent.value || submitting.value,
        loading: submitting.value,
      },
    }),
  { immediate: true },
);

function resetForm() {
  actionInfo.value = null;
  formApi.setState({ schema: [] });
  formApi.setValues({});
}

async function applyAction(info: ActionInfo | null) {
  if (!info) {
    resetForm();
    return;
  }

  // Selecting an action only initializes the editable form; retained requests stay immutable.
  actionInfo.value = info;
  const schema = buildActionDebugSchema(info);
  formApi.setState({ schema });
  const initValues = buildActionDebugInitialValues(info);
  formApi.setValues(initValues);
}

async function loadChannels() {
  const owner = principal.value;
  const resp = await handleRequest(() =>
    fetchChannelList({ sortBy: 'name', sortOrder: 'asc' }),
  );
  if (!resp || disposed || owner !== principal.value) {
    return;
  }
  channelOptions.value = resp ?? [];
}

let devicesGeneration = 0;
let actionsGeneration = 0;
async function loadDevices() {
  const generation = ++devicesGeneration;
  const parentId = selectedChannelId.value;
  if (!selectedChannelId.value) {
    deviceOptions.value = [];
    return;
  }
  const resp = await handleRequest(() =>
    getSubDevicesById(parentId!, {
      sortBy: 'deviceName',
      sortOrder: 'asc',
    }),
  );
  if (!resp) {
    return;
  }
  if (generation !== devicesGeneration || parentId !== selectedChannelId.value)
    return;
  deviceOptions.value = resp ?? [];
}

async function loadActions() {
  const generation = ++actionsGeneration;
  const parentId = selectedDeviceId.value;
  if (!selectedDeviceId.value) {
    actionOptions.value = [];
    resetForm();
    return;
  }
  const resp = await handleRequest(() =>
    fetchActionsByDevice(parentId!, {
      sortBy: 'name',
      sortOrder: 'asc',
    }),
  );
  if (!resp) {
    return;
  }
  if (generation !== actionsGeneration || parentId !== selectedDeviceId.value)
    return;
  actionOptions.value = resp ?? [];
  const matched = actionOptions.value.find(
    (item) => item.id === selectedActionId.value,
  );
  await applyAction(matched ?? null);
}

watch(selectedChannelId, async () => {
  actionsGeneration++;
  devicesGeneration++;
  selectedDeviceId.value = undefined;
  selectedActionId.value = undefined;
  deviceOptions.value = [];
  actionOptions.value = [];
  resetForm();
  await loadDevices();
});

watch(selectedDeviceId, async () => {
  actionsGeneration++;
  selectedActionId.value = undefined;
  actionOptions.value = [];
  resetForm();
  await loadActions();
});

watch(selectedActionId, async () => {
  const matched = actionOptions.value.find(
    (item) => item.id === selectedActionId.value,
  );
  await applyAction(matched ?? null);
});

async function refreshAccess() {
  const owner = principal.value;
  if (!owner) return;
  const capabilities = await handleRequest(getControlCapabilities);
  const service = await handleRequest(getControlServiceStatus);
  if (disposed || owner !== principal.value) return;
  canExecute.value =
    (capabilities?.canExecuteAction ?? false) && (service?.available ?? false);
  canEngineer.value = capabilities?.canEngineer ?? false;
  canReadAll.value = capabilities?.canReadAll ?? false;
  controlFault.value = service?.available
    ? ''
    : (service?.fault ?? $t('page.control.serviceUnavailable'));
  canReconcile.value = capabilities?.canReconcile ?? false;
  await loadChannels();
}

watch(
  principal,
  () => {
    devicesGeneration++;
    actionsGeneration++;
    canExecute.value = false;
    canEngineer.value = false;
    canReadAll.value = false;
    canReconcile.value = false;
    selectedChannelId.value = undefined;
    selectedDeviceId.value = undefined;
    selectedActionId.value = undefined;
    channelOptions.value = [];
    deviceOptions.value = [];
    actionOptions.value = [];
    submitting.value = false;
    lookupKey.value = '';
    lookupId.value = '';
    lookupMessage.value = '';
    controlFault.value = '';
    operationId.value = principal.value
      ? (sessionStorage.getItem(
          `ng-control-last-operation:${principal.value}`,
        ) ?? '')
      : '';
    refreshStoredIntents();
    resetForm();
    if (mounted) void refreshAccess();
  },
  { flush: 'sync' },
);

onMounted(async () => {
  mounted = true;
  await nextTick();
  refreshStoredIntents();
  operationId.value =
    sessionStorage.getItem(`ng-control-last-operation:${principal.value}`) ??
    '';
  await refreshAccess();
});
onBeforeUnmount(() => {
  disposed = true;
  devicesGeneration++;
  actionsGeneration++;
});
</script>

<template>
  <Page auto-content-height class="h-full">
    <div class="flex h-full flex-col gap-4">
      <Card :body-style="{ padding: '16px' }">
        <div class="flex w-full flex-wrap items-center gap-3">
          <Select
            v-model:value="selectedChannelId"
            :allow-clear="true"
            :options="
              channelOptions.map((c) => ({
                label: c.name,
                value: c.id,
              }))
            "
            class="w-full min-w-0 sm:w-52"
            :aria-label="$t('page.monitor.realtime.channel')"
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
            class="w-full min-w-0 sm:w-64"
            :aria-label="$t('page.monitor.realtime.device')"
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
            class="w-full min-w-0 sm:w-64"
            :aria-label="$t('page.southward.action.title')"
            :placeholder="$t('page.southward.action.title')"
            :disabled="!selectedDeviceId"
          />
          <Button @click="refreshAccess">
            {{ $t('page.control.refresh') }}
          </Button>
        </div>
      </Card>

      <Alert
        v-if="controlFault"
        type="error"
        show-icon
        :message="controlFault"
      />
      <ControlAuthorityView
        v-if="canEngineer && selectedChannelId && selectedDeviceId"
        :channel-id="selectedChannelId"
        :device-id="selectedDeviceId"
      />
      <div class="flex flex-1 flex-col">
        <div class="grid h-full grid-cols-1 gap-4 xl:grid-cols-2">
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
              <Alert
                class="mb-3"
                type="info"
                show-icon
                :message="$t('page.control.executionHint')"
              />
              <Form
                :disabled="isFormDisabled || !!selectedIntent || submitting"
              />
              <Alert
                v-if="selectedChannelId && !configurationActive"
                class="mt-3"
                type="warning"
                :message="$t('page.control.configurationNotActive')"
              />
              <div v-if="selectedIntent" class="mt-3 rounded border p-3">
                <h3>{{ $t('page.control.originalRequest') }}</h3>
                <code class="break-all text-xs">{{
                  selectedIntent.idempotencyKey
                }}</code>
                <JsonViewer
                  :value="selectedIntent.request"
                  :sort="false"
                  boxed
                />
                <Button
                  class="mt-2"
                  :disabled="!canExecute || submitting"
                  :loading="submitting"
                  @click="retryOriginalIntent"
                >
                  {{ $t('page.control.retryOriginalIntent') }}
                </Button>
              </div>
              <Button
                class="mt-4"
                :disabled="isFormDisabled || submitting || !selectedIntent"
                @click="replaceIntent"
              >
                {{ $t('page.control.newIntent') }}
              </Button>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ $t('page.control.retryHint') }}
              </p>
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
              <div class="mb-4 flex flex-col gap-2">
                <p class="text-sm">
                  {{ $t('page.control.recoverIntentHint') }}
                </p>
                <Select
                  v-model:value="lookupKey"
                  show-search
                  :options="
                    storedIntents.map((intent) => ({
                      label: `${intent.target} · ${intent.idempotencyKey}`,
                      value: intent.idempotencyKey,
                    }))
                  "
                  :placeholder="$t('page.control.savedIntents')"
                />
                <Input
                  v-model:value="lookupKey"
                  :placeholder="$t('page.control.idempotencyKey')"
                />
                <Button
                  :disabled="!lookupKey.trim() || !principal"
                  @click="recoverIntent"
                >
                  {{ $t('page.control.recoverIntent') }}
                </Button>
                <Alert
                  v-if="lookupMessage"
                  type="info"
                  :message="lookupMessage"
                />
              </div>
              <div class="mb-4 flex gap-2">
                <Input
                  v-model:value="lookupId"
                  :placeholder="$t('page.control.operationId')"
                />
                <Button
                  :disabled="!lookupId.trim()"
                  @click="operationId = lookupId.trim()"
                >
                  {{ $t('page.control.lookup') }}
                </Button>
              </div>
              <ControlOperationView
                v-if="operationId"
                :operation-id="operationId"
                :can-reconcile="canReconcile"
              />
              <p v-else class="text-muted-foreground">
                {{ $t('common.noData') }}
              </p>
            </div>
          </Card>
        </div>
      </div>
      <Card
        :title="$t('page.control.history.title')"
        :body-style="{ padding: '16px' }"
      >
        <ControlHistoryView
          :can-read-all="canReadAll"
          :principal="principal"
          :selected-channel-id="selectedChannelId"
          :selected-device-id="selectedDeviceId"
          @select="(id) => displayOperation(id, principal)"
        />
      </Card>
    </div>
  </Page>
</template>
