<script setup lang="ts">
import type { ChannelInfo, ConnectionPolicy, DriverInfo } from '@vben/types';

import type {
  GooseMemberType,
  GoosePublicationField,
  GoosePublicationPoint,
  GoosePublicationSource,
  GooseSourcePlan,
  PublicationPreview,
  PublicationReceipt,
  PublicationRequest,
} from '#/api/core/engineering';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
  useId,
  watch,
} from 'vue';

import { JsonViewer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  FormItem,
  Input,
  InputNumber,
  List,
  ListItem,
  Select,
  Space,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { fetchChannelList, getChannelById } from '#/api/core/channel';
import { fetchAllDrivers } from '#/api/core/driver';
import { previewPublication, publishEngineering } from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import { describeFailure } from './engineering-evidence';
import IedContractEvidence from './ied-contract-evidence.vue';

const props = defineProps<{
  plan: GooseSourcePlan;
  selectionCurrent: boolean;
}>();
const key = 'page.southward.channel.engineering.goosePublication';
const formId = useId();
const sources = ref<GoosePublicationSource[]>([]);
const sourcePlans = ref<GooseSourcePlan[]>([]);
const points = ref<GoosePublicationPoint[]>([]);
const deviceBindings = ref<{ domain: string; name: string }[]>([]);
const drivers = ref<DriverInfo[]>([]);
const channels = ref<ChannelInfo[]>([]);
const current = ref<ChannelInfo | null>(null);
const target = ref('create');
const compiled = ref<null | PublicationPreview>(null);
const snapshot = ref<null | PublicationRequest>(null);
const receipt = ref<null | PublicationReceipt>(null);
const busy = ref(false);
const error = ref('');
let alive = true;
let revision = 0;
let observer: AbortController | null = null;
let applyingTarget = false;
const channel = reactive({
  name: '',
  driverId: undefined as number | undefined,
  enabled: false,
  reportType: 0 as 0 | 1,
  interface: '',
  initializationTimeoutMs: 2000,
  shutdownTimeoutMs: 2000,
  healthIntervalMs: 5,
});
const capturePolicy = reactive({
  maxFrameBytes: 9216,
  kernelBufferBytes: 65_536,
  maxBatchFrames: 64,
  maxBatchBytes: 65_536,
  maxTimestampErrorUs: 2000,
});
const limitsPolicy = reactive({
  compilation: {
    maxOriginalBytes: 16_777_216,
    maxGraphBytes: 67_108_864,
    maxTypeBytes: 16_777_216,
    maxCatalogBytes: 16_777_216,
    maxWork: 1_048_576,
    maxDepth: 64,
  },
  maxSources: 16,
  maxPoints: 1024,
  maxDevices: 16,
  maxSourceModelBytes: 262_144,
  maxGroupModelBytes: 8_388_608,
  maxSourceOutputBytes: 65_536,
  maxRetainedSampleBytes: 2_097_152,
  maxSourceFrameBytes: 65_536,
  maxRetainedFrameBytes: 2_097_152,
  maxTypeNodes: 65_536,
  maxDatasetMembers: 4096,
  maxDecodeBytes: 1_048_576,
  maxDecodeWork: 2_097_152,
  freshnessRetryMs: 5,
});
const connectionPolicy = reactive<ConnectionPolicy>({
  connectTimeoutMs: 2000,
  readTimeoutMs: 2000,
  writeTimeoutMs: 2000,
  backoff: {
    initialIntervalMs: 100,
    maxIntervalMs: 1000,
    randomizationFactor: 0,
    multiplier: 2,
    maxAttempts: 1,
  },
});
const captureFields = computed(
  () => Object.keys(capturePolicy) as (keyof typeof capturePolicy)[],
);
const compilationFields = computed(
  () =>
    Object.keys(
      limitsPolicy.compilation,
    ) as (keyof typeof limitsPolicy.compilation)[],
);
const limitFields = computed(
  () =>
    Object.keys(limitsPolicy).filter(
      (field) => field !== 'compilation',
    ) as Exclude<keyof typeof limitsPolicy, 'compilation'>[],
);
const deadlineFields = computed(
  () => ['connectTimeoutMs', 'readTimeoutMs', 'writeTimeoutMs'] as const,
);
const retryFields = computed(
  () =>
    [
      'initialIntervalMs',
      'maxIntervalMs',
      'randomizationFactor',
      'multiplier',
      'maxAttempts',
    ] as const,
);
const source = reactive({
  id: '',
  publisher: '',
  tag: 'tagged' as 'tagged' | 'untagged',
  identifier: 0,
  priority: 4,
  domain: 'normal' as 'normal' | 'simulated',
  talMultiplier: 1,
  expiryOffsetMs: 0,
  maxTalMs: 5000,
  recoveryConfirmations: 2,
});
const point = reactive({
  sourceIndex: undefined as number | undefined,
  value: undefined as string | undefined,
  quality: undefined as string | undefined,
  time: undefined as string | undefined,
  name: '',
  key: '',
  type: 1 as 0 | 1,
  unit: '',
});
function invalidate() {
  if (applyingTarget) return;
  revision++;
  observer?.abort();
  observer = null;
  busy.value = false;
  compiled.value = null;
  snapshot.value = null;
  receipt.value = null;
  error.value = '';
}
watch(
  [
    sources,
    points,
    deviceBindings,
    channel,
    capturePolicy,
    limitsPolicy,
    connectionPolicy,
  ],
  invalidate,
  { deep: true, flush: 'sync' },
);
watch(
  target,
  () => {
    invalidate();
    current.value = null;
  },
  { flush: 'sync' },
);
const driverOptions = computed(() =>
  drivers.value.map((driver) => ({
    value: Number(driver.id),
    label: driver.name,
  })),
);
const targetOptions = computed(() => [
  { value: 'create', label: $t(`${key}.create`) },
  ...channels.value.map((item) => ({
    value: String(item.id),
    label: item.name,
  })),
]);
const sourceOptions = computed(() =>
  sources.value.map((source, index) => ({ value: index, label: source.id })),
);
const tagOptions = computed(() => [
  { value: 'tagged', label: $t(`${key}.tagged`) },
  { value: 'untagged', label: $t(`${key}.untagged`) },
]);
const domainOptions = computed(() => [
  { value: 'normal', label: $t(`${key}.normal`) },
  { value: 'simulated', label: $t(`${key}.simulated`) },
]);
const typeOptions = computed(() => [
  { value: 1, label: $t(`${key}.telemetry`) },
  { value: 0, label: $t(`${key}.attribute`) },
]);
const reportOptions = computed(() => [
  { value: 0, label: $t(`${key}.reportChange`) },
  { value: 1, label: $t(`${key}.reportAlways`) },
]);
type Choice = {
  field: GoosePublicationField;
  kind: string;
  label: string;
  quality: boolean;
  time: boolean;
  value: string;
};
function scalarChoices(plan: GooseSourcePlan): Choice[] {
  const result: Choice[] = [];
  function visit(
    type: GooseMemberType,
    memberIndex: number,
    path: (number | string)[],
    label: string,
    depth: number,
  ) {
    if (depth > 64 || result.length >= 8192)
      throw new Error($t(`${key}.selectionLimit`));
    if (type.kind === 'primitive') {
      const specification = type.specification;
      result.push({
        label,
        value: JSON.stringify({ memberIndex, path }),
        field: { memberIndex, path: [...path] },
        kind: specification.name,
        quality:
          specification.name === 'bitString' &&
          [13, 14].includes(
            Math.abs(
              'wireLength' in specification
                ? (specification.wireLength ?? 0)
                : 0,
            ),
          ),
        time: specification.name === 'utcTime',
      });
    } else if (type.kind === 'structure') {
      for (const component of type.components) {
        if (component.name !== null)
          visit(
            component.valueType,
            memberIndex,
            [...path, component.name],
            `${label}.${component.name}`,
            depth + 1,
          );
      }
    }
    // Arrays stay compact. Explicit indices are entered through the selector field below.
  }
  for (const member of plan.members)
    visit(member.valueType, member.memberIndex, [], `${member.memberIndex}`, 0);
  return result;
}
const choiceState = computed(() => {
  if (point.sourceIndex === undefined || !sourcePlans.value[point.sourceIndex])
    return { choices: [] as Choice[], error: '' };
  try {
    return {
      choices: scalarChoices(sourcePlans.value[point.sourceIndex]!),
      error: '',
    };
  } catch (error_) {
    return {
      choices: [] as Choice[],
      error:
        error_ instanceof Error ? error_.message : $t(`${key}.selectionLimit`),
    };
  }
});
const choices = computed(() => choiceState.value.choices);
const qualityChoices = computed(() =>
  choices.value.filter((choice) => choice.quality),
);
const timeChoices = computed(() =>
  choices.value.filter((choice) => choice.time),
);
function publisher(): GoosePublicationSource['publisher'] {
  if (!/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(source.publisher))
    throw new Error($t(`${key}.publisherRequired`));
  return source.publisher
    .split(':')
    .map((byte) =>
      Number.parseInt(byte, 16),
    ) as GoosePublicationSource['publisher'];
}
function addSource() {
  if (!props.selectionCurrent) return;
  error.value = '';
  try {
    if (
      !source.id.trim() ||
      sources.value.some((value) => value.id === source.id) ||
      sources.value.some(
        (value) =>
          value.selection.declaration.digest !== props.plan.declaration.digest,
      )
    )
      throw new Error($t(`${key}.sourceRequired`));
    sources.value.push({
      id: source.id,
      selection: structuredClone(toRaw(props.plan.selection)),
      publisher: publisher(),
      tag:
        source.tag === 'tagged'
          ? {
              kind: 'tagged',
              identifier: source.identifier,
              priority: source.priority,
            }
          : { kind: 'untagged' },
      trafficDomain: source.domain,
      talMultiplier: source.talMultiplier,
      expiryOffsetMs: source.expiryOffsetMs,
      maxTalMs: source.maxTalMs,
      recoveryConfirmations: source.recoveryConfirmations,
    });
    sourcePlans.value.push(structuredClone(toRaw(props.plan)));
    if (
      !deviceBindings.value.some(
        (device) => device.domain === props.plan.selection.domain,
      )
    )
      deviceBindings.value.push({
        domain: props.plan.selection.domain,
        name: '',
      });
    point.sourceIndex = sources.value.length - 1;
  } catch (error_) {
    error.value = describeFailure(error_, $t(`${key}.failed`));
  }
}
const explicitSelector = ref('');
const explicitQuality = ref('');
const explicitTime = ref('');
function selected(value: string | undefined): GoosePublicationField | null {
  if (!value) return null;
  const candidate = JSON.parse(value) as GoosePublicationField;
  if (
    !Number.isInteger(candidate.memberIndex) ||
    candidate.memberIndex < 0 ||
    !Array.isArray(candidate.path) ||
    candidate.path.some(
      (step) =>
        typeof step !== 'string' && (!Number.isInteger(step) || step < 0),
    )
  )
    throw new Error($t(`${key}.selectorRequired`));
  return candidate;
}
function addPoint() {
  error.value = '';
  try {
    const value = selected(explicitSelector.value.trim() || point.value);
    if (
      point.sourceIndex === undefined ||
      !sources.value[point.sourceIndex] ||
      !value ||
      !point.name.trim() ||
      !point.key.trim()
    )
      throw new Error($t(`${key}.pointRequired`));
    points.value.push({
      sourceIndex: point.sourceIndex,
      name: point.name,
      key: point.key,
      type: point.type,
      unit: point.unit || null,
      value,
      quality: selected(explicitQuality.value.trim() || point.quality),
      sourceTime: selected(explicitTime.value.trim() || point.time),
    });
    point.name = '';
    point.key = '';
  } catch (error_) {
    error.value = describeFailure(error_, $t(`${key}.failed`));
  }
}
function removeSource(index: number) {
  sources.value.splice(index, 1);
  sourcePlans.value.splice(index, 1);
  deviceBindings.value = deviceBindings.value.filter((device) =>
    sources.value.some((source) => source.selection.domain === device.domain),
  );
  points.value = points.value
    .filter((point) => point.sourceIndex !== index)
    .map((point) => ({
      ...point,
      sourceIndex:
        point.sourceIndex > index ? point.sourceIndex - 1 : point.sourceIndex,
    }));
  point.sourceIndex = undefined;
  point.value = undefined;
  point.quality = undefined;
  point.time = undefined;
}
watch(
  () => point.sourceIndex,
  () => {
    point.value = undefined;
    point.quality = undefined;
    point.time = undefined;
    explicitSelector.value = '';
    explicitQuality.value = '';
    explicitTime.value = '';
  },
);
async function loadTargets() {
  const controller = new AbortController();
  observer?.abort();
  observer = controller;
  try {
    const [available, existing] = await Promise.all([
      fetchAllDrivers(controller.signal),
      fetchChannelList(undefined, controller.signal),
    ]);
    if (!alive || controller.signal.aborted || observer !== controller) return;
    drivers.value = available.filter(
      (driver) => driver.driverType === 'iec61850',
    );
    channels.value = existing.filter((item) =>
      item.driverType.startsWith('iec61850:'),
    );
  } catch (error_) {
    if (alive && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  }
}
async function refreshTarget() {
  invalidate();
  if (target.value === 'create') return;
  const controller = new AbortController();
  observer = controller;
  busy.value = true;
  try {
    const loaded = await getChannelById(
      Number(target.value),
      controller.signal,
    );
    if (!alive || controller.signal.aborted || observer !== controller) return;
    current.value = loaded;
    applyingTarget = true;
    try {
      channel.name = loaded.name;
      channel.driverId = Number(loaded.driverId);
      channel.enabled = loaded.status === 0;
      channel.reportType = loaded.reportType;
      Object.assign(connectionPolicy, loaded.connectionPolicy);
      if (loaded.driverConfig.protocol === 'goose') {
        const config = loaded.driverConfig as Record<string, unknown>;
        const capture = config.capture as Record<string, unknown>;
        channel.interface =
          typeof capture.interface === 'string' ? capture.interface : '';
        Object.assign(capturePolicy, capture);
        const limits = config.limits as typeof limitsPolicy;
        Object.assign(limitsPolicy, limits);
        channel.initializationTimeoutMs = Number(
          config.initializationTimeoutMs,
        );
        channel.shutdownTimeoutMs = Number(config.shutdownTimeoutMs);
        channel.healthIntervalMs = Number(config.healthIntervalMs);
      }
    } finally {
      applyingTarget = false;
    }
  } catch (error_) {
    if (alive && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && observer === controller) busy.value = false;
  }
}
function proposal(): PublicationRequest {
  if (
    !channel.driverId ||
    !channel.name.trim() ||
    !channel.interface.trim() ||
    sources.value.length === 0 ||
    points.value.length === 0
  )
    throw new Error($t(`${key}.completeRequired`));
  if (target.value !== 'create' && !current.value?.configuration)
    throw new Error($t(`${key}.refreshRequired`));
  const capture = structuredClone(toRaw(capturePolicy));
  const limits = structuredClone(toRaw(limitsPolicy));
  return {
    target:
      target.value === 'create'
        ? { kind: 'create' }
        : {
            kind: 'replace',
            channelId: Number(target.value),
            baseRevision: current.value!.configuration!.desiredRevision,
          },
    channel: {
      name: channel.name,
      driverId: channel.driverId,
      status: channel.enabled ? 0 : 1,
      period: null,
      reportType: channel.reportType,
      connectionPolicy: structuredClone(toRaw(connectionPolicy)),
      connectionConfig: {
        protocol: 'goose',
        capture: { ...capture, interface: channel.interface },
        limits,
        initializationTimeoutMs: channel.initializationTimeoutMs,
        shutdownTimeoutMs: channel.shutdownTimeoutMs,
        healthIntervalMs: channel.healthIntervalMs,
      },
    },
    acquisition: {
      protocol: 'goose',
      mapping: {
        sources: structuredClone(toRaw(sources.value)),
        devices: structuredClone(toRaw(deviceBindings.value)),
        points: structuredClone(toRaw(points.value)),
      },
    },
  };
}
async function preview() {
  invalidate();
  const version = revision;
  const controller = new AbortController();
  observer = controller;
  busy.value = true;
  try {
    const request = proposal();
    const result = await previewPublication(
      props.plan.declaration.digest,
      request,
      controller.signal,
    );
    if (
      !alive ||
      controller.signal.aborted ||
      observer !== controller ||
      revision !== version
    )
      return;
    compiled.value = result;
    snapshot.value = request;
  } catch (error_) {
    if (alive && !controller.signal.aborted && observer === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && observer === controller) busy.value = false;
  }
}
async function publish() {
  if (!compiled.value || !snapshot.value || busy.value) return;
  const controller = new AbortController();
  observer = controller;
  busy.value = true;
  try {
    const result = await publishEngineering(
      props.plan.declaration.digest,
      snapshot.value,
      compiled.value.previewDigest,
      controller.signal,
    );
    if (!alive || controller.signal.aborted || observer !== controller) return;
    receipt.value = result;
    compiled.value = null;
    snapshot.value = null;
  } catch (error_) {
    if (alive && !controller.signal.aborted && observer === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && observer === controller) busy.value = false;
  }
}
onMounted(loadTargets);
onBeforeUnmount(() => {
  alive = false;
  observer?.abort();
});
</script>

<template>
  <Card data-testid="goose-publication" :title="$t(`${key}.title`)">
    <Alert
      :message="$t(`${key}.instructions`)"
      type="info"
      show-icon
      class="mb-4"
    />
    <Alert
      v-if="!selectionCurrent"
      type="warning"
      show-icon
      class="mb-4"
      :message="$t(`${key}.selectionChanged`)"
    />
    <Descriptions bordered size="small" :column="{ xs: 1, md: 2 }" class="mb-4">
      <DescriptionsItem :label="$t(`${key}.selectedSource`)">
        <div>{{ plan.selection.domain }}/{{ plan.selection.control }}</div>
      </DescriptionsItem>
      <DescriptionsItem :label="$t(`${key}.capturedOriginal`)">
        <EvidenceDigest :value="plan.observation.digest" />
      </DescriptionsItem>
    </Descriptions>
    <Alert v-if="error" :message="error" type="error" show-icon class="mb-4" />
    <Card size="small" :title="$t(`${key}.sourceStep`)" class="mb-5">
      <div class="grid gap-4 md:grid-cols-2">
        <FormItem
          :colon="false"
          :label="$t(`${key}.sourceId`)"
          :html-for="`${formId}-sourceId`"
        >
          <Input :id="`${formId}-sourceId`" v-model:value="source.id" />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.publisher`)"
          :html-for="`${formId}-publisher`"
        >
          <Input
            :id="`${formId}-publisher`"
            v-model:value="source.publisher"
            placeholder="02:11:22:33:44:55"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.tag`)"
          :html-for="`${formId}-tag`"
        >
          <Select
            :id="`${formId}-tag`"
            v-model:value="source.tag"
            :options="tagOptions"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.trafficDomain`)"
          :html-for="`${formId}-trafficDomain`"
        >
          <Select
            :id="`${formId}-trafficDomain`"
            v-model:value="source.domain"
            :options="domainOptions"
          />
        </FormItem>
        <FormItem
          :colon="false"
          v-if="source.tag === 'tagged'"
          :label="$t(`${key}.vlan`)"
          :html-for="`${formId}-vlan`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-vlan`"
            v-model:value="source.identifier"
            :min="0"
            :max="4094"
          />
        </FormItem>
        <FormItem
          :colon="false"
          v-if="source.tag === 'tagged'"
          :label="$t(`${key}.priority`)"
          :html-for="`${formId}-priority`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-priority`"
            v-model:value="source.priority"
            :min="0"
            :max="7"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.talMultiplier`)"
          :html-for="`${formId}-talMultiplier`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-talMultiplier`"
            v-model:value="source.talMultiplier"
            :min="1"
            :max="16"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.expiryOffset`)"
          :html-for="`${formId}-expiryOffset`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-expiryOffset`"
            v-model:value="source.expiryOffsetMs"
            :min="0"
            :max="60000"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.maxTal`)"
          :html-for="`${formId}-maxTal`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-maxTal`"
            v-model:value="source.maxTalMs"
            :min="1"
            :max="3600000"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.recovery`)"
          :html-for="`${formId}-recovery`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-recovery`"
            v-model:value="source.recoveryConfirmations"
            :min="2"
            :max="16"
          />
        </FormItem>
      </div>
      <Button :disabled="!selectionCurrent" @click="addSource">
        {{ $t(`${key}.addSource`) }}
      </Button>
      <List :data-source="sources" size="small">
        <template #renderItem="{ item, index }">
          <ListItem>
            {{ item.id }} · {{ item.selection.domain }}/{{
              item.selection.control
            }}<Button danger @click="removeSource(index)">
              {{ $t(`${key}.remove`) }}
            </Button>
          </ListItem>
        </template>
      </List>
    </Card>
    <Card size="small" :title="$t(`${key}.pointStep`)" class="mb-5">
      <FormItem
        v-for="(device, index) in deviceBindings"
        :key="device.domain"
        :colon="false"
        :label="$t(`${key}.deviceName`, { domain: device.domain })"
        :html-for="`${formId}-device-${index}`"
      >
        <Input :id="`${formId}-device-${index}`" v-model:value="device.name" />
      </FormItem>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <Alert
          v-if="choiceState.error"
          :message="choiceState.error"
          type="warning"
          class="md:col-span-2"
        />
        <FormItem
          :colon="false"
          :label="$t(`${key}.pointSource`)"
          :html-for="`${formId}-pointSource`"
        >
          <Select
            :id="`${formId}-pointSource`"
            v-model:value="point.sourceIndex"
            :options="sourceOptions"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.name`)"
          :html-for="`${formId}-name`"
        >
          <Input :id="`${formId}-name`" v-model:value="point.name" />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.pointKey`)"
          :html-for="`${formId}-pointKey`"
        >
          <Input :id="`${formId}-pointKey`" v-model:value="point.key" />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.value`)"
          :html-for="`${formId}-value`"
        >
          <Select
            :id="`${formId}-value`"
            v-model:value="point.value"
            :options="choices"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.quality`)"
          :html-for="`${formId}-quality`"
        >
          <Select
            :id="`${formId}-quality`"
            v-model:value="point.quality"
            :options="qualityChoices"
            allow-clear
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.time`)"
          :html-for="`${formId}-time`"
        >
          <Select
            :id="`${formId}-time`"
            v-model:value="point.time"
            :options="timeChoices"
            allow-clear
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.explicitSelector`)"
          :html-for="`${formId}-explicitSelector`"
        >
          <Input
            :id="`${formId}-explicitSelector`"
            v-model:value="explicitSelector"
            :placeholder="$t(`${key}.selectorExample`)"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.category`)"
          :html-for="`${formId}-category`"
        >
          <Select
            :id="`${formId}-category`"
            v-model:value="point.type"
            :options="typeOptions"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.explicitQuality`)"
          :html-for="`${formId}-explicitQuality`"
        >
          <Input
            :id="`${formId}-explicitQuality`"
            v-model:value="explicitQuality"
            :placeholder="$t(`${key}.selectorExample`)"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.explicitTime`)"
          :html-for="`${formId}-explicitTime`"
        >
          <Input
            :id="`${formId}-explicitTime`"
            v-model:value="explicitTime"
            :placeholder="$t(`${key}.selectorExample`)"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.unit`)"
          :html-for="`${formId}-unit`"
        >
          <Input :id="`${formId}-unit`" v-model:value="point.unit" />
        </FormItem>
      </div>
      <Button @click="addPoint">{{ $t(`${key}.addPoint`) }}</Button>
      <List :data-source="points" size="small">
        <template #renderItem="{ item, index }">
          <ListItem>
            {{ item.key }} · {{ item.value.memberIndex
            }}<Button danger @click="points.splice(index, 1)">
              {{ $t(`${key}.remove`) }}
            </Button>
          </ListItem>
        </template>
      </List>
    </Card>
    <Card size="small" :title="$t(`${key}.channelStep`)" class="mb-5">
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <FormItem
          :colon="false"
          :label="$t(`${key}.target`)"
          :html-for="`${formId}-target`"
        >
          <Select
            :id="`${formId}-target`"
            v-model:value="target"
            :options="targetOptions"
          /><Button @click="refreshTarget">
            {{ $t(`${key}.refresh`) }}
          </Button>
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.driver`)"
          :html-for="`${formId}-driver`"
        >
          <Select
            :id="`${formId}-driver`"
            v-model:value="channel.driverId"
            :options="driverOptions"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.channelName`)"
          :html-for="`${formId}-channelName`"
        >
          <Input :id="`${formId}-channelName`" v-model:value="channel.name" />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.interface`)"
          :html-for="`${formId}-interface`"
        >
          <Input
            :id="`${formId}-interface`"
            v-model:value="channel.interface"
          />
        </FormItem>
        <Collapse class="md:col-span-2" :bordered="false">
          <CollapsePanel key="capture" :header="$t(`${key}.capturePolicy`)">
            <div class="grid gap-3 md:grid-cols-2">
              <FormItem
                v-for="field in captureFields"
                :key="field"
                :colon="false"
                :label="$t(`${key}.policyFields.${field}`)"
                :html-for="`${formId}-${field}`"
              >
                <InputNumber
                  class="!w-full"
                  :id="`${formId}-${field}`"
                  v-model:value="capturePolicy[field]"
                  :min="1"
                  :precision="0"
                />
              </FormItem>
            </div>
          </CollapsePanel>
          <CollapsePanel key="limits" :header="$t(`${key}.limits`)">
            <div class="grid gap-3 md:grid-cols-2">
              <FormItem
                v-for="field in compilationFields"
                :key="field"
                :colon="false"
                :label="$t(`${key}.policyFields.${field}`)"
                :html-for="`${formId}-${field}`"
              >
                <InputNumber
                  class="!w-full"
                  :id="`${formId}-${field}`"
                  v-model:value="limitsPolicy.compilation[field]"
                  :min="1"
                  :precision="0"
                />
              </FormItem>
              <FormItem
                v-for="field in limitFields"
                :key="field"
                :colon="false"
                :label="$t(`${key}.policyFields.${field}`)"
                :html-for="`${formId}-${field}`"
              >
                <InputNumber
                  class="!w-full"
                  :id="`${formId}-${field}`"
                  v-model:value="limitsPolicy[field]"
                  :min="1"
                  :precision="0"
                />
              </FormItem>
            </div>
          </CollapsePanel>
          <CollapsePanel
            key="connection"
            :header="$t(`${key}.connectionPolicy`)"
          >
            <div class="grid gap-3 md:grid-cols-2">
              <FormItem
                v-for="field in deadlineFields"
                :key="field"
                :colon="false"
                :label="$t(`${key}.policyFields.${field}`)"
                :html-for="`${formId}-${field}`"
              >
                <InputNumber
                  class="!w-full"
                  :id="`${formId}-${field}`"
                  v-model:value="connectionPolicy[field]"
                  :min="1"
                  :precision="0"
                />
              </FormItem>
              <FormItem
                v-for="field in retryFields"
                :key="field"
                :colon="false"
                :label="$t(`${key}.policyFields.${field}`)"
                :html-for="`${formId}-${field}`"
              >
                <InputNumber
                  class="!w-full"
                  :id="`${formId}-${field}`"
                  v-model:value="connectionPolicy.backoff[field]"
                  :min="0"
                />
              </FormItem>
            </div>
          </CollapsePanel>
        </Collapse>
        <FormItem
          :colon="false"
          :label="$t(`${key}.initialization`)"
          :html-for="`${formId}-initialization`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-initialization`"
            v-model:value="channel.initializationTimeoutMs"
            :min="1"
            :max="3600000"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.shutdown`)"
          :html-for="`${formId}-shutdown`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-shutdown`"
            v-model:value="channel.shutdownTimeoutMs"
            :min="1"
            :max="300000"
          />
        </FormItem>
        <FormItem
          :colon="false"
          :label="$t(`${key}.health`)"
          :html-for="`${formId}-health`"
        >
          <InputNumber
            class="!w-full"
            :id="`${formId}-health`"
            v-model:value="channel.healthIntervalMs"
            :min="1"
            :max="30000"
          />
        </FormItem>
        <Checkbox v-model:checked="channel.enabled">
          {{ $t(`${key}.enable`) }}
        </Checkbox>
        <FormItem
          :colon="false"
          :label="$t(`${key}.reportPolicy`)"
          :html-for="`${formId}-reportPolicy`"
        >
          <Select
            :id="`${formId}-reportPolicy`"
            v-model:value="channel.reportType"
            :options="reportOptions"
          />
        </FormItem>
      </div>
    </Card>
    <div class="flex gap-2">
      <Button
        :type="compiled ? 'default' : 'primary'"
        :loading="busy"
        @click="preview"
      >
        <span>{{ $t(`${key}.preview`) }}</span>
      </Button>
      <Button type="primary" :disabled="!compiled || busy" @click="publish">
        {{ $t(`${key}.publish`) }}
      </Button>
    </div>
    <template v-if="compiled">
      <List :data-source="compiled.mapping.points" size="small">
        <template #renderItem="{ item }">
          <ListItem>
            <Space direction="vertical" :size="12" class="w-full min-w-0">
              <TypographyText class="font-medium">
                {{ item.name }} · {{ item.key }} ·
                {{ item.dataType }}
              </TypographyText>
              <Collapse :bordered="false" class="w-full">
                <CollapsePanel
                  key="config"
                  :header="$t(`${key}.compiledPointDetails`)"
                >
                  <JsonViewer
                    :value="item.driverConfig"
                    copyable
                    boxed
                    :sort="false"
                  />
                </CollapsePanel>
              </Collapse>
            </Space>
          </ListItem>
        </template>
      </List>
      <Descriptions class="mt-4" bordered :column="{ xs: 1, md: 2 }">
        <DescriptionsItem :label="$t(`${key}.digest`)">
          <EvidenceDigest :value="compiled.previewDigest" />
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.points`)">
          {{ compiled.mapping.points.length }}
        </DescriptionsItem>
      </Descriptions>
      <template v-if="compiled.mapping.acquisition.protocol === 'goose'">
        <Card
          v-for="mapped in compiled.mapping.acquisition.sources"
          :key="mapped.source.id"
          :title="mapped.source.id"
          class="mt-4"
        >
          <IedContractEvidence :contract="mapped.declarations.contract" />
          <Collapse :bordered="false" class="mt-4">
            <CollapsePanel
              key="originals"
              :header="$t(`${key}.capturedDependencies`)"
            >
              <Descriptions :column="1" size="small">
                <DescriptionsItem :label="$t(`${key}.capturedOriginal`)">
                  <EvidenceDigest :value="mapped.declarations.snapshotDigest" />
                </DescriptionsItem>
              </Descriptions>
              <List :data-source="mapped.dependencies" size="small">
                <template #renderItem="{ item: digest }">
                  <ListItem><EvidenceDigest :value="digest" /></ListItem>
                </template>
              </List>
            </CollapsePanel>
          </Collapse>
        </Card>
      </template>
      <Alert
        v-if="compiled.removed.length > 0"
        :message="$t(`${key}.removals`, { count: compiled.removed.length })"
        type="warning"
      />
      <List :data-source="compiled.removed" size="small">
        <template #renderItem="{ item }">
          <ListItem>
            {{ item.kind }} · {{ item.id }} · {{ item.name }}
          </ListItem>
        </template>
      </List>
    </template>
    <Descriptions
      v-if="receipt"
      class="mt-4"
      bordered
      :column="{ xs: 1, md: 3 }"
    >
      <DescriptionsItem :label="$t(`${key}.desired`)">
        <span>{{ receipt.configuration.desiredRevision }}</span>
      </DescriptionsItem>
      <DescriptionsItem :label="$t(`${key}.applied`)">
        <span>{{ receipt.configuration.appliedRevision }}</span>
      </DescriptionsItem>
      <DescriptionsItem :label="$t(`${key}.state`)">
        <Tag
          :color="
            receipt.configuration.state === 'failed'
              ? 'error'
              : receipt.configuration.state === 'active'
                ? 'success'
                : undefined
          "
          class="!m-0"
        >
          {{
            $t(
              `page.southward.channel.activation.${receipt.configuration.state}`,
            )
          }}
        </Tag>
      </DescriptionsItem>
    </Descriptions>
  </Card>
</template>
