<script setup lang="ts">
import type { ChannelInfo, DriverInfo } from '@vben/types';

import type {
  BrowseDeclaration,
  FieldTarget,
  IedContract,
  MappingPurpose,
  PointMapping,
  PublicationPreview,
  PublicationReceipt,
  PublicationRequest,
  ReportMapping,
} from '#/api/core/engineering';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
  watch,
} from 'vue';

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
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  List,
  ListItem,
  Select,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  activateChannel,
  fetchChannelList,
  getChannelById,
} from '#/api/core/channel';
import { fetchAllDrivers } from '#/api/core/driver';
import {
  getIedContract,
  previewPublication,
  publishEngineering,
} from '#/api/core/engineering';

import { resolveDataTypeLabel } from '../schemas/options';
import { describeFailure } from './engineering-evidence';
import IedContractEvidence from './ied-contract-evidence.vue';
import IedContractEditor from './ied-contract.vue';

const props = defineProps<{
  accessPoint: null | string;
  digest: string;
  maximumPoints: number;
  server: number;
  sourceChannel: null | number;
}>();
const emit = defineEmits<{ published: [] }>();
const key = 'page.southward.channel.engineering.mapping';
const points = ref<PointMapping[]>([]);
type DraftReport = {
  bindings: {
    pointIndex: number;
    qualityMember: null | number;
    timeMember: null | number;
    valueMember: null | number;
  }[];
  dataSet: { domain: string; logicalNode: string; name: string };
  kind: 'buffered' | 'unbuffered';
  name: string;
  owner: { domain: string; logicalNode: string };
  reportId: string;
  reservation: '' | 'brImplicitNoReservationField' | 'brTimed' | 'urUnreserved';
  seconds: number;
  sourceEvidence: Extract<
    BrowseDeclaration,
    { kind: 'reportControl' }
  >['evidence'];
  sourceId: null | string;
};
const reports = ref<DraftReport[]>([]);
const activePoint = ref(0);
const activeReport = ref(0);
const stage = ref('channel');
const selectedPoint = computed(() => points.value[activePoint.value]);
const selectedReport = computed(() => reports.value[activeReport.value]);
const drivers = ref<DriverInfo[]>([]);
const channels = ref<ChannelInfo[]>([]);
const current = ref<ChannelInfo | null>(null);
const target = ref('create');
const contractEditor = ref<InstanceType<typeof IedContractEditor> | null>(null);
const initialContract = ref<IedContract>({
  manufacturer: null,
  model: null,
  firmware: null,
  domains: [],
  documents: [],
  parts: [],
  substitution: [],
});
const contractDomains = computed(() =>
  [
    ...new Set([
      ...points.value.map((point) =>
        point.purpose.kind === 'read'
          ? point.purpose.value.domain
          : point.purpose.target.domain,
      ),
      ...reports.value.map((report) => report.owner.domain),
    ]),
  ].toSorted(),
);
const channel = reactive({
  name: '',
  driverId: 0,
  enabled: false,
  host: '',
  transport: '' as '' | 'tcp' | 'tls',
  tlsSecurity: '',
  port: 102,
  period: 1000,
  reportType: 0 as 0 | 1,
  association: '{}',
  limits: '',
  connectionPolicy: JSON.stringify({
    connectTimeoutMs: 10_000,
    readTimeoutMs: 10_000,
    writeTimeoutMs: 10_000,
    backoff: {
      initialIntervalMs: 250,
      maxIntervalMs: 10_000,
      randomizationFactor: 0.2,
      multiplier: 2,
    },
  }),
});
const compiled = ref<null | PublicationPreview>(null);
const receipt = ref<null | PublicationReceipt>(null);
const error = ref('');
const previewing = ref(false);
const publishing = ref(false);
const refreshing = ref(false);
const snapshot = ref<null | PublicationRequest>(null);
let alive = true;
let version = 0;
let nextPoint = 0;
let previewController: AbortController | null = null;
let publishController: AbortController | null = null;
let targetsController: AbortController | null = null;
let currentController: AbortController | null = null;
const readPoint = computed(
  () => points.value[activePoint.value]?.purpose.kind === 'read',
);

function invalidate() {
  version += 1;
  previewController?.abort();
  previewController = null;
  compiled.value = null;
  snapshot.value = null;
  previewing.value = false;
}
watch([points, reports, channel, target, current], invalidate, { deep: true });
onBeforeUnmount(() => {
  alive = false;
  invalidate();
  publishController?.abort();
  targetsController?.abort();
  currentController?.abort();
});

async function loadTargets() {
  const controller = new AbortController();
  targetsController?.abort();
  targetsController = controller;
  try {
    const [available, existing] = await Promise.all([
      fetchAllDrivers(controller.signal),
      fetchChannelList(undefined, controller.signal),
    ]);
    if (!alive || controller.signal.aborted || targetsController !== controller)
      return;
    drivers.value = available.filter(
      (driver) => driver.driverType === 'iec61850',
    );
    channels.value = existing.filter((item) =>
      item.driverType.startsWith('iec61850:'),
    );
  } catch (error_) {
    if (alive && !controller.signal.aborted && targetsController === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  }
}
onMounted(async () => {
  await loadTargets();
  if (alive && props.sourceChannel !== null) {
    target.value = String(props.sourceChannel);
    await refreshTarget();
  }
});

async function refreshTarget() {
  invalidate();
  current.value = null;
  initialContract.value = {
    manufacturer: null,
    model: null,
    firmware: null,
    domains: [],
    documents: [],
    parts: [],
    substitution: [],
  };
  currentController?.abort();
  if (target.value === 'create') return;
  const controller = new AbortController();
  currentController = controller;
  refreshing.value = true;
  try {
    const [selected, record] = await Promise.all([
      getChannelById(Number(target.value), controller.signal),
      getIedContract(Number(target.value), controller.signal),
    ]);
    if (!alive || controller.signal.aborted || currentController !== controller)
      return;
    if (
      (record?.publication.desiredRevision ?? null) !==
      (selected.engineeringPublication?.desiredRevision ?? null)
    )
      throw new Error($t(`${key}.refreshRequired`));
    if (record) initialContract.value = record.contract;
    current.value = selected;
    channel.name = selected.name;
    channel.driverId = Number(selected.driverId);
    channel.enabled = selected.status === 0;
    channel.period = selected.period ?? 1000;
    channel.reportType = selected.reportType;
    channel.connectionPolicy = JSON.stringify(
      selected.connectionPolicy,
      null,
      2,
    );
    const config = selected.driverConfig;
    channel.transport =
      config.transport?.kind === 'tcp' || config.transport?.kind === 'tls'
        ? config.transport.kind
        : '';
    channel.tlsSecurity =
      config.transport?.kind === 'tls'
        ? JSON.stringify(config.transport.security, null, 2)
        : '';
    channel.host =
      typeof config.transport?.host === 'string' ? config.transport.host : '';
    channel.port =
      typeof config.transport?.port === 'number' ? config.transport.port : 102;
    channel.association = JSON.stringify(config.association ?? {}, null, 2);
    channel.limits = config.limits
      ? JSON.stringify(config.limits, null, 2)
      : '';
  } catch (error_) {
    if (alive && !controller.signal.aborted && currentController === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && currentController === controller) refreshing.value = false;
  }
}

function addField(
  field: FieldTarget,
  purpose: 'control' | 'parameterWrite' | 'read',
) {
  if (publishing.value || points.value.length >= props.maximumPoints) return;
  const target = cloneField(field);
  nextPoint += 1;
  let intent: MappingPurpose;
  switch (purpose) {
    case 'control': {
      intent = {
        kind: 'control',
        target,
        policy: {
          expectedControlModel: 0,
          originCategory: 0,
          originIdentifierHex: '',
          synchronismCheck: false,
          interlockingCheck: false,
          test: false,
          sboClass: null,
          selectionTimeoutMs: null,
          terminationTimeoutMs: null,
        },
      };
      break;
    }
    case 'parameterWrite': {
      intent = { kind: 'parameterWrite', target };
      break;
    }
    case 'read': {
      intent = { kind: 'read', value: target, quality: null, sourceTime: null };
      break;
    }
  }
  points.value.push({
    name: target.path.at(-1)?.name ?? '',
    key: `point-${nextPoint}`,
    type: 1,
    unit: null,
    purpose: intent,
  });
  activePoint.value = points.value.length - 1;
  stage.value = 'points';
}
function companion(field: FieldTarget, role: 'quality' | 'sourceTime') {
  if (publishing.value) return;
  const point = points.value[activePoint.value];
  if (point?.purpose.kind === 'read') point.purpose[role] = cloneField(field);
}
function removePoint(index: number) {
  if (publishing.value) return;
  points.value.splice(index, 1);
  for (const report of reports.value) {
    report.bindings = report.bindings
      .filter((binding) => binding.pointIndex !== index)
      .map((binding) => ({
        ...binding,
        pointIndex:
          binding.pointIndex > index
            ? binding.pointIndex - 1
            : binding.pointIndex,
      }));
  }
  activePoint.value = Math.max(
    0,
    Math.min(activePoint.value, points.value.length - 1),
  );
}
function addReport(
  owner: { domain: string; logicalNode: string },
  name: string,
  declaration: Extract<BrowseDeclaration, { kind: 'reportControl' }>,
) {
  if (publishing.value || !declaration.dataSet) return;
  reports.value.push({
    owner: { ...owner },
    dataSet: declaration.dataSet,
    name,
    kind: declaration.reportKind,
    sourceId: declaration.reportId,
    sourceEvidence: declaration.evidence,
    reportId: '',
    reservation: '',
    seconds: 60,
    bindings: [],
  });
  activeReport.value = reports.value.length - 1;
  stage.value = 'reports';
}
function bindMember(
  owner: { dataSet: string; domain: string; logicalNode: string },
  member: number,
  role: 'qualityMember' | 'timeMember' | 'valueMember',
) {
  if (publishing.value || !readPoint.value) return;
  const report = reports.value[activeReport.value];
  if (
    !report ||
    report.dataSet.domain !== owner.domain ||
    report.dataSet.logicalNode !== owner.logicalNode ||
    report.dataSet.name !== owner.dataSet
  ) {
    error.value = $t(`${key}.wrongSet`);
    return;
  }
  let binding = report.bindings.find(
    (item) => item.pointIndex === activePoint.value,
  );
  if (!binding) {
    binding = {
      pointIndex: activePoint.value,
      valueMember: null,
      qualityMember: null,
      timeMember: null,
    };
    report.bindings.push(binding);
  }
  binding[role] = member;
  stage.value = 'reports';
}
defineExpose({ addField, companion, addReport, bindMember });

function native(field: FieldTarget | null): string {
  return field
    ? `${field.domain}/${field.logicalNode}.${field.path.map((part) => `${part.name}${part.indices.map((index) => `[${index}]`).join('')}`).join('.')}`
    : '—';
}
function cloneField(field: FieldTarget): FieldTarget {
  return {
    functionalConstraint: field.functionalConstraint,
    domain: field.domain,
    logicalNode: field.logicalNode,
    path: field.path.map((part) => ({
      name: part.name,
      indices: [...part.indices],
    })),
  };
}
function setDeadline(
  point: PointMapping,
  field: 'selectionTimeoutMs' | 'terminationTimeoutMs',
  value: unknown,
) {
  if (point.purpose.kind === 'control')
    point.purpose.policy[field] = typeof value === 'number' ? value : null;
}
function proposal(): PublicationRequest {
  if (target.value !== 'create' && !current.value?.configuration)
    throw new Error($t(`${key}.refreshRequired`));
  const mappedReports: ReportMapping[] = reports.value.map((report) => {
    if (!report.reservation) throw new Error($t(`${key}.reservationRequired`));
    return {
      domain: report.owner.domain,
      logicalNode: report.owner.logicalNode,
      reportName: report.name,
      reportId: report.reportId,
      reservation:
        report.reservation === 'brTimed'
          ? { kind: 'brTimed', seconds: report.seconds }
          : { kind: report.reservation },
      points: report.bindings.map((binding) => {
        if (binding.valueMember === null)
          throw new Error($t(`${key}.memberRequired`));
        return { ...binding, valueMember: binding.valueMember };
      }),
    };
  });
  if (!channel.transport) throw new Error($t(`${key}.transportRequired`));
  const transport: Record<string, unknown> = {
    kind: channel.transport,
    host: channel.host,
    port: channel.port,
  };
  if (channel.transport === 'tls')
    transport.security = JSON.parse(channel.tlsSecurity);
  const connectionConfig: Record<string, unknown> = {
    protocol: 'mms',
    transport,
    association: JSON.parse(channel.association),
  };
  if (channel.limits.trim())
    connectionConfig.limits = JSON.parse(channel.limits);
  const publicationTarget: PublicationRequest['target'] =
    target.value === 'create'
      ? { kind: 'create' }
      : {
          kind: 'replace',
          channelId: Number(target.value),
          baseRevision: current.value?.configuration?.desiredRevision ?? '',
        };
  if (!contractEditor.value) throw new Error($t(`${key}.refreshRequired`));
  return {
    target: publicationTarget,
    channel: {
      name: channel.name,
      driverId: channel.driverId,
      status: channel.enabled ? 0 : 1,
      period: reports.value.length > 0 ? null : channel.period,
      reportType: channel.reportType,
      connectionPolicy: JSON.parse(channel.connectionPolicy),
      connectionConfig,
    },
    acquisition: {
      protocol: 'mms',
      contract: contractEditor.value.proposal(contractDomains.value),
      mapping: {
        server: props.server,
        accessPoint: props.accessPoint,
        points: structuredClone(toRaw(points.value)),
        reports: mappedReports,
      },
    },
  };
}
async function preview() {
  invalidate();
  error.value = '';
  const controller = new AbortController();
  previewController = controller;
  previewing.value = true;
  const requestVersion = version;
  try {
    const request = proposal();
    const result = await previewPublication(
      props.digest,
      request,
      controller.signal,
    );
    if (
      !alive ||
      controller.signal.aborted ||
      previewController !== controller ||
      requestVersion !== version
    )
      return;
    compiled.value = result;
    snapshot.value = request;
  } catch (error_) {
    if (alive && !controller.signal.aborted && previewController === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && previewController === controller) previewing.value = false;
  }
}
async function publish() {
  if (!compiled.value || !snapshot.value || publishing.value) return;
  const controller = new AbortController();
  publishController = controller;
  publishing.value = true;
  error.value = '';
  try {
    const result = await publishEngineering(
      props.digest,
      snapshot.value,
      compiled.value.previewDigest,
      controller.signal,
    );
    if (!alive || controller.signal.aborted || publishController !== controller)
      return;
    receipt.value = result;
    target.value = String(result.publication.channelId);
    emit('published');
    await loadTargets();
    await refreshTarget();
  } catch (error_) {
    if (
      alive &&
      !controller.signal.aborted &&
      publishController === controller
    ) {
      error.value = describeFailure(error_, $t(`${key}.failed`));
      invalidate();
    }
  } finally {
    if (alive && publishController === controller) publishing.value = false;
  }
}
async function retry() {
  if (!receipt.value || publishing.value) return;
  publishing.value = true;
  const controller = new AbortController();
  publishController = controller;
  try {
    const configuration = await activateChannel(
      receipt.value.publication.channelId,
      receipt.value.configuration.desiredRevision,
      controller.signal,
    );
    if (!alive || controller.signal.aborted || publishController !== controller)
      return;
    receipt.value = { ...receipt.value, configuration };
    emit('published');
    await refreshTarget();
  } catch (error_) {
    if (alive && !controller.signal.aborted && publishController === controller)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && publishController === controller) publishing.value = false;
  }
}
</script>

<template>
  <Card
    :title="$t(`${key}.title`)"
    role="region"
    :aria-label="$t(`${key}.title`)"
    class="min-w-0"
    :body-style="{ padding: '16px' }"
  >
    <div class="space-y-4">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Alert
        v-if="drivers.length === 0"
        type="info"
        :message="$t(`${key}.noDriver`)"
        show-icon
      />
      <div class="flex flex-wrap gap-2">
        <Tag color="blue">
          {{ $t(`${key}.pointCount`, { count: points.length }) }}
        </Tag>
        <Tag :color="reports.length > 0 ? 'purple' : 'cyan'">
          {{ $t(`${key}.${reports.length > 0 ? 'reportMode' : 'pollMode'}`) }}
        </Tag>
        <Tag v-if="current?.configuration" color="geekblue">
          {{
            $t(`${key}.baseRevision`, {
              revision: current.configuration.desiredRevision,
            })
          }}
        </Tag>
      </div>
      <Form layout="vertical" :disabled="publishing">
        <div
          v-if="points.length > 0 || reports.length > 0"
          class="grid grid-cols-1 gap-x-4 sm:grid-cols-2"
        >
          <FormItem
            v-if="points.length > 0"
            :label="$t(`${key}.activePoint`)"
            html-for="iec-mapping-point"
            class="mb-2"
          >
            <Select
              v-model:value="activePoint"
              id="iec-mapping-point"
              :aria-label="$t(`${key}.activePoint`)"
              show-search
              option-filter-prop="label"
              :options="
                points.map((point, index) => ({
                  value: index,
                  label: `${point.key} · ${point.name}`,
                }))
              "
            />
          </FormItem>
          <FormItem
            v-if="reports.length > 0"
            :label="$t(`${key}.activeReport`)"
            html-for="iec-mapping-report"
            class="mb-2"
          >
            <Select
              v-model:value="activeReport"
              id="iec-mapping-report"
              :aria-label="$t(`${key}.activeReport`)"
              show-search
              option-filter-prop="label"
              :options="
                reports.map((report, index) => ({
                  value: index,
                  label: `${report.owner.logicalNode}.${report.name}`,
                }))
              "
            />
          </FormItem>
        </div>
        <Tabs v-model:active-key="stage" size="small">
          <TabPane
            key="contract"
            :tab="$t('page.southward.channel.engineering.contract.tab')"
            :force-render="true"
          >
            <IedContractEditor
              ref="contractEditor"
              :initial="initialContract"
              :domains="contractDomains"
              :disabled="publishing || refreshing"
              @changed="invalidate"
            />
          </TabPane>
          <TabPane key="channel" :tab="$t(`${key}.channelTab`)">
            <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormItem
                :label="$t(`${key}.target`)"
                html-for="iec-mapping-target"
              >
                <Select
                  v-model:value="target"
                  id="iec-mapping-target"
                  :aria-label="$t(`${key}.target`)"
                  show-search
                  option-filter-prop="label"
                  :options="[
                    { value: 'create', label: $t(`${key}.create`) },
                    ...channels.map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    })),
                  ]"
                  @change="refreshTarget"
                />
              </FormItem>
              <FormItem
                :label="$t(`${key}.driver`)"
                html-for="iec-mapping-driver"
              >
                <Select
                  :value="channel.driverId || undefined"
                  @update:value="
                    (value) =>
                      (channel.driverId = typeof value === 'number' ? value : 0)
                  "
                  id="iec-mapping-driver"
                  :aria-label="$t(`${key}.driver`)"
                  :placeholder="$t(`${key}.choose`)"
                  show-search
                  option-filter-prop="label"
                  :options="
                    drivers.map((driver) => ({
                      value: Number(driver.id),
                      label: `${driver.name} · ${driver.version}`,
                    }))
                  "
                />
              </FormItem>
              <FormItem :label="$t(`${key}.channelName`)">
                <Input
                  v-model:value="channel.name"
                  :aria-label="$t(`${key}.channelName`)"
                  :maxlength="256"
                />
              </FormItem>
              <FormItem :label="$t(`${key}.host`)">
                <Input
                  v-model:value="channel.host"
                  :aria-label="$t(`${key}.host`)"
                />
              </FormItem>
              <FormItem
                :label="$t(`${key}.transport`)"
                html-for="iec-mapping-transport"
              >
                <Select
                  v-model:value="channel.transport"
                  id="iec-mapping-transport"
                  :aria-label="$t(`${key}.transport`)"
                  :options="[
                    { value: 'tcp', label: $t(`${key}.plainTcp`) },
                    { value: 'tls', label: $t(`${key}.mutualTls`) },
                  ]"
                />
              </FormItem>
              <FormItem
                v-if="channel.transport === 'tls'"
                :label="$t(`${key}.tlsSecurity`)"
              >
                <Textarea
                  v-model:value="channel.tlsSecurity"
                  :aria-label="$t(`${key}.tlsSecurity`)"
                  :rows="8"
                />
              </FormItem>
              <FormItem :label="$t(`${key}.port`)">
                <InputNumber
                  v-model:value="channel.port"
                  :aria-label="$t(`${key}.port`)"
                  :min="1"
                  :max="65535"
                  class="w-full"
                />
              </FormItem>
              <FormItem
                v-if="reports.length === 0"
                :label="$t(`${key}.period`)"
              >
                <InputNumber
                  v-model:value="channel.period"
                  :aria-label="$t(`${key}.period`)"
                  :min="1"
                  class="w-full"
                />
              </FormItem>
            </div>
            <FormItem>
              <Checkbox v-model:checked="channel.enabled">
                {{ $t(`${key}.enabled`) }}
              </Checkbox>
            </FormItem>
            <div
              v-if="current?.configuration"
              class="mb-4 flex flex-wrap items-center gap-2"
            >
              <Tag color="blue">
                {{
                  $t(`${key}.revision`, {
                    desired: current.configuration.desiredRevision,
                    applied: current.configuration.appliedRevision ?? '—',
                  })
                }}
              </Tag>
              <Button
                size="small"
                :disabled="publishing"
                :loading="refreshing"
                @click="refreshTarget"
              >
                {{ $t(`${key}.refresh`) }}
              </Button>
            </div>
            <Collapse :bordered="false" class="rounded-lg">
              <CollapsePanel key="connection" :header="$t(`${key}.connection`)">
                <FormItem :label="$t(`${key}.association`)">
                  <Input.TextArea
                    v-model:value="channel.association"
                    :aria-label="$t(`${key}.association`)"
                    :auto-size="{ minRows: 3, maxRows: 8 }"
                    class="font-mono text-xs"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.policy`)">
                  <Input.TextArea
                    v-model:value="channel.connectionPolicy"
                    :aria-label="$t(`${key}.policy`)"
                    :auto-size="{ minRows: 4, maxRows: 10 }"
                    class="font-mono text-xs"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.limits`)" class="mb-0">
                  <Input.TextArea
                    v-model:value="channel.limits"
                    :aria-label="$t(`${key}.limits`)"
                    :auto-size="{ minRows: 3, maxRows: 10 }"
                    class="font-mono text-xs"
                  />
                </FormItem>
              </CollapsePanel>
            </Collapse>
          </TabPane>
          <TabPane
            key="points"
            :tab="$t(`${key}.pointsTab`, { count: points.length })"
          >
            <Alert
              class="mb-4"
              type="info"
              show-icon
              :message="$t(`${key}.pointHint`)"
            />
            <Empty v-if="!selectedPoint" :description="$t(`${key}.noPoints`)" />
            <template v-else>
              <div
                class="mb-4 flex flex-wrap items-center justify-between gap-2"
              >
                <div class="flex flex-wrap gap-2">
                  <Tag
                    :color="
                      selectedPoint.purpose.kind === 'read'
                        ? 'blue'
                        : selectedPoint.purpose.kind === 'control'
                          ? 'orange'
                          : 'purple'
                    "
                  >
                    {{ $t(`${key}.purposes.${selectedPoint.purpose.kind}`) }}
                  </Tag>
                  <Tag
                    v-if="
                      (selectedPoint.purpose.kind === 'read'
                        ? selectedPoint.purpose.value
                        : selectedPoint.purpose.target
                      ).functionalConstraint
                    "
                    color="cyan"
                  >
                    {{
                      (selectedPoint.purpose.kind === 'read'
                        ? selectedPoint.purpose.value
                        : selectedPoint.purpose.target
                      ).functionalConstraint
                    }}
                  </Tag>
                </div>
                <Button
                  danger
                  size="small"
                  :disabled="publishing"
                  @click="removePoint(activePoint)"
                >
                  {{ $t(`${key}.remove`) }}
                </Button>
              </div>
              <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <FormItem :label="$t(`${key}.pointName`)">
                  <Input
                    v-model:value="selectedPoint.name"
                    :aria-label="$t(`${key}.pointName`)"
                    :maxlength="256"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.pointKey`)">
                  <Input
                    v-model:value="selectedPoint.key"
                    :aria-label="$t(`${key}.pointKey`)"
                    :maxlength="128"
                  />
                </FormItem>
                <FormItem
                  :label="$t(`${key}.category`)"
                  html-for="iec-mapping-category"
                >
                  <Select
                    v-model:value="selectedPoint.type"
                    id="iec-mapping-category"
                    :aria-label="$t(`${key}.category`)"
                    :options="[
                      { value: 1, label: $t(`${key}.telemetry`) },
                      { value: 0, label: $t(`${key}.attribute`) },
                    ]"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.unit`)">
                  <Input
                    :value="selectedPoint.unit ?? ''"
                    :aria-label="$t(`${key}.unit`)"
                    :maxlength="128"
                    @update:value="
                      (value) =>
                        selectedPoint &&
                        (selectedPoint.unit =
                          value === undefined || value === ''
                            ? null
                            : String(value))
                    "
                  />
                </FormItem>
              </div>
              <Descriptions :column="1" size="small" bordered>
                <DescriptionsItem :label="$t(`${key}.value`)">
                  <code class="break-all text-xs">{{
                    native(
                      selectedPoint.purpose.kind === 'read'
                        ? selectedPoint.purpose.value
                        : selectedPoint.purpose.target,
                    )
                  }}</code>
                </DescriptionsItem>
                <template v-if="selectedPoint.purpose.kind === 'read'">
                  <DescriptionsItem :label="$t(`${key}.quality`)">
                    <Tag
                      :color="
                        selectedPoint.purpose.quality ? 'green' : 'default'
                      "
                    >
                      {{
                        $t(
                          `${key}.${selectedPoint.purpose.quality ? 'bound' : 'unbound'}`,
                        )
                      }}
                    </Tag>
                    <code
                      v-if="selectedPoint.purpose.quality"
                      class="break-all text-xs"
                    >
                      <span>{{ native(selectedPoint.purpose.quality) }}</span>
                    </code>
                    <Button
                      v-if="selectedPoint.purpose.quality"
                      type="link"
                      size="small"
                      :disabled="publishing"
                      @click="selectedPoint.purpose.quality = null"
                    >
                      {{ $t(`${key}.clear`) }}
                    </Button>
                  </DescriptionsItem>
                  <DescriptionsItem :label="$t(`${key}.sourceTime`)">
                    <Tag
                      :color="
                        selectedPoint.purpose.sourceTime ? 'green' : 'default'
                      "
                    >
                      {{
                        $t(
                          `${key}.${selectedPoint.purpose.sourceTime ? 'bound' : 'unbound'}`,
                        )
                      }}
                    </Tag>
                    <code
                      v-if="selectedPoint.purpose.sourceTime"
                      class="break-all text-xs"
                    >
                      <span>{{
                        native(selectedPoint.purpose.sourceTime)
                      }}</span>
                    </code>
                    <Button
                      v-if="selectedPoint.purpose.sourceTime"
                      type="link"
                      size="small"
                      :disabled="publishing"
                      @click="selectedPoint.purpose.sourceTime = null"
                    >
                      {{ $t(`${key}.clear`) }}
                    </Button>
                  </DescriptionsItem>
                </template>
              </Descriptions>
              <div
                v-if="selectedPoint.purpose.kind === 'control'"
                class="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2"
              >
                <FormItem label="ctlModel" html-for="iec-mapping-control-model">
                  <Select
                    v-model:value="
                      selectedPoint.purpose.policy.expectedControlModel
                    "
                    id="iec-mapping-control-model"
                    aria-label="ctlModel"
                    html-for="iec-mapping-control-model"
                    :options="[
                      { value: 0, label: $t(`${key}.choose`) },
                      ...[1, 2, 3, 4].map((value) => ({
                        value,
                        label: String(value),
                      })),
                    ]"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.originCategory`)">
                  <InputNumber
                    v-model:value="selectedPoint.purpose.policy.originCategory"
                    :aria-label="$t(`${key}.originCategory`)"
                    :min="0"
                    :max="8"
                    class="w-full"
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.originId`)">
                  <Input
                    v-model:value="
                      selectedPoint.purpose.policy.originIdentifierHex
                    "
                    :aria-label="$t(`${key}.originId`)"
                  />
                </FormItem>
                <FormItem label="sboClass" html-for="iec-mapping-sbo-class">
                  <Select
                    :value="selectedPoint.purpose.policy.sboClass ?? undefined"
                    id="iec-mapping-sbo-class"
                    aria-label="sboClass"
                    html-for="iec-mapping-sbo-class"
                    allow-clear
                    :placeholder="$t(`${key}.choose`)"
                    :options="[
                      { value: 'operateOnce', label: 'operateOnce' },
                      { value: 'operateMany', label: 'operateMany' },
                    ]"
                    @change="
                      (value) =>
                        selectedPoint?.purpose.kind === 'control' &&
                        (selectedPoint.purpose.policy.sboClass =
                          value === 'operateOnce' || value === 'operateMany'
                            ? value
                            : null)
                    "
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.selectionTimeout`)">
                  <InputNumber
                    :value="
                      selectedPoint.purpose.policy.selectionTimeoutMs ??
                      undefined
                    "
                    :aria-label="$t(`${key}.selectionTimeout`)"
                    :min="1"
                    :max="300000"
                    class="w-full"
                    @update:value="
                      (value) =>
                        selectedPoint &&
                        setDeadline(selectedPoint, 'selectionTimeoutMs', value)
                    "
                  />
                </FormItem>
                <FormItem :label="$t(`${key}.terminationTimeout`)">
                  <InputNumber
                    :value="
                      selectedPoint.purpose.policy.terminationTimeoutMs ??
                      undefined
                    "
                    :aria-label="$t(`${key}.terminationTimeout`)"
                    :min="1"
                    :max="300000"
                    class="w-full"
                    @update:value="
                      (value) =>
                        selectedPoint &&
                        setDeadline(
                          selectedPoint,
                          'terminationTimeoutMs',
                          value,
                        )
                    "
                  />
                </FormItem>
                <Checkbox
                  v-model:checked="
                    selectedPoint.purpose.policy.synchronismCheck
                  "
                >
                  {{ $t(`${key}.synchrocheck`) }}
                </Checkbox>
                <Checkbox
                  v-model:checked="
                    selectedPoint.purpose.policy.interlockingCheck
                  "
                >
                  {{ $t(`${key}.interlock`) }}
                </Checkbox>
                <Checkbox
                  v-model:checked="selectedPoint.purpose.policy.test"
                  class="mt-3"
                >
                  {{ $t(`${key}.testMode`) }}
                </Checkbox>
              </div>
            </template>
          </TabPane>
          <TabPane
            key="reports"
            :tab="$t(`${key}.reportsTab`, { count: reports.length })"
          >
            <Alert
              class="mb-4"
              type="info"
              show-icon
              :message="$t(`${key}.reportHint`)"
            />
            <Empty
              v-if="!selectedReport"
              :description="$t(`${key}.noReports`)"
            />
            <template v-else>
              <div
                class="mb-4 flex flex-wrap items-center justify-between gap-2"
              >
                <div class="min-w-0 space-y-2">
                  <div class="break-all font-medium">
                    {{ selectedReport.owner.domain }}/{{
                      selectedReport.owner.logicalNode
                    }}.{{ selectedReport.name }}
                  </div>
                  <Tag color="purple">
                    {{ selectedReport.kind === 'buffered' ? 'BRCB' : 'URCB' }}
                  </Tag>
                  <Tag
                    :color="
                      selectedReport.sourceEvidence.kind === 'observed'
                        ? 'cyan'
                        : 'blue'
                    "
                  >
                    {{
                      $t(
                        `${key}.${selectedReport.sourceEvidence.kind === 'observed' ? 'sourceObserved' : 'sourceDeclared'}`,
                      )
                    }}
                  </Tag>
                </div>
                <Button
                  danger
                  size="small"
                  :disabled="publishing"
                  @click="
                    reports.splice(activeReport, 1);
                    activeReport = Math.max(0, reports.length - 1);
                  "
                >
                  {{ $t(`${key}.remove`) }}
                </Button>
              </div>
              <Alert
                class="mb-4"
                type="info"
                show-icon
                :message="
                  $t(
                    `${key}.${selectedReport.sourceEvidence.kind === 'observed' ? 'observedReportHint' : 'declaredReportHint'}`,
                  )
                "
              />
              <Descriptions :column="1" size="small" bordered class="mb-4">
                <DescriptionsItem :label="$t(`${key}.dataSet`)">
                  <code class="break-all text-xs">{{
                    `${selectedReport.dataSet.domain}/${selectedReport.dataSet.logicalNode}$${selectedReport.dataSet.name}`
                  }}</code>
                </DescriptionsItem>
                <DescriptionsItem :label="$t(`${key}.sourceReportId`)">
                  <Tag color="geekblue">
                    {{ selectedReport.sourceId ?? '—' }}
                  </Tag>
                </DescriptionsItem>
                <template
                  v-if="selectedReport.sourceEvidence.kind === 'observed'"
                >
                  <DescriptionsItem :label="$t(`${key}.observedEnabled`)">
                    <Tag
                      :color="
                        selectedReport.sourceEvidence.enabled
                          ? 'orange'
                          : 'default'
                      "
                    >
                      {{
                        $t(
                          `${key}.${selectedReport.sourceEvidence.enabled ? 'stateEnabled' : 'stateDisabled'}`,
                        )
                      }}
                    </Tag>
                  </DescriptionsItem>
                  <DescriptionsItem :label="$t(`${key}.observedOwner`)">
                    <span class="break-all font-mono text-xs">{{
                      selectedReport.sourceEvidence.ownerHex ?? '—'
                    }}</span>
                  </DescriptionsItem>
                </template>
              </Descriptions>
              <FormItem :label="$t(`${key}.reportId`)">
                <Input
                  v-model:value="selectedReport.reportId"
                  :aria-label="$t(`${key}.reportId`)"
                  :placeholder="selectedReport.sourceId ?? ''"
                />
              </FormItem>
              <FormItem
                :label="$t(`${key}.reservation`)"
                html-for="iec-mapping-reservation"
              >
                <Select
                  v-model:value="selectedReport.reservation"
                  id="iec-mapping-reservation"
                  :aria-label="$t(`${key}.reservation`)"
                  :options="[
                    { value: '', label: $t(`${key}.choose`) },
                    ...(selectedReport.kind === 'unbuffered'
                      ? [
                          {
                            value: 'urUnreserved',
                            label: `URCB: ${$t(`${key}.unreserved`)}`,
                          },
                        ]
                      : [
                          {
                            value: 'brTimed',
                            label: `BRCB: ${$t(`${key}.timed`)}`,
                          },
                          {
                            value: 'brImplicitNoReservationField',
                            label: `BRCB: ${$t(`${key}.implicit`)}`,
                          },
                        ]),
                  ]"
                />
              </FormItem>
              <FormItem
                v-if="selectedReport.reservation === 'brTimed'"
                :label="$t(`${key}.seconds`)"
              >
                <InputNumber
                  v-model:value="selectedReport.seconds"
                  :aria-label="$t(`${key}.seconds`)"
                  :min="1"
                  :max="32767"
                  class="w-full"
                />
              </FormItem>
              <List
                :data-source="selectedReport.bindings"
                size="small"
                :locale="{ emptyText: $t(`${key}.noBindings`) }"
              >
                <template #renderItem="{ item: binding }">
                  <ListItem>
                    <div class="min-w-0 flex-1 space-y-2 py-1">
                      <span class="break-all font-medium">{{
                        points[binding.pointIndex]?.key
                      }}</span>
                      <div class="flex flex-wrap gap-2">
                        <Tag color="blue">
                          {{ $t(`${key}.value`) }}:
                          {{ binding.valueMember ?? '—' }}
                        </Tag>
                        <Tag
                          :color="
                            binding.qualityMember === null ? 'default' : 'green'
                          "
                        >
                          {{ $t(`${key}.quality`) }}:
                          {{ binding.qualityMember ?? '—' }}
                        </Tag>
                        <Tag
                          :color="
                            binding.timeMember === null ? 'default' : 'cyan'
                          "
                        >
                          {{ $t(`${key}.sourceTime`) }}:
                          {{ binding.timeMember ?? '—' }}
                        </Tag>
                      </div>
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      :disabled="publishing"
                      @click="
                        selectedReport &&
                        (selectedReport.bindings =
                          selectedReport.bindings.filter(
                            (item) => item !== binding,
                          ))
                      "
                    >
                      {{ $t(`${key}.remove`) }}
                    </Button>
                  </ListItem>
                </template>
              </List>
            </template>
          </TabPane>
        </Tabs>
      </Form>
      <div class="border-t pt-4">
        <Button
          block
          type="primary"
          :loading="previewing"
          :disabled="
            publishing || points.length === 0 || !channel.driverId || refreshing
          "
          @click="preview"
        >
          {{ $t(`${key}.preview`) }}
        </Button>
      </div>
      <Card
        v-if="compiled"
        size="small"
        :title="$t(`${key}.previewResult`)"
        role="region"
        :aria-label="$t(`${key}.previewResult`)"
      >
        <div class="space-y-3">
          <Alert type="warning" show-icon :message="$t(`${key}.replaceHint`)" />
          <IedContractEvidence
            v-if="compiled.contract"
            :contract="compiled.contract"
          />
          <code class="block break-all text-xs text-muted-foreground">{{
            compiled.previewDigest
          }}</code>
          <List :data-source="compiled.mapping.points" size="small">
            <template #renderItem="{ item: point, index }">
              <ListItem>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="break-all font-medium">{{ point.key }}</span>
                  <Tag color="blue">
                    {{ resolveDataTypeLabel(point.dataType) }}
                  </Tag>
                  <Tag color="geekblue">
                    {{
                      $t(`${key}.identity`, {
                        id:
                          compiled.pointIds[index] ?? $t(`${key}.newIdentity`),
                      })
                    }}
                  </Tag>
                </div>
              </ListItem>
            </template>
          </List>
          <div
            v-for="removed in compiled.removed"
            :key="`${removed.kind}:${removed.id}`"
            class="flex flex-wrap gap-2"
          >
            <Tag color="red">{{ $t(`${key}.remove`) }}</Tag>
            <span
              class="break-all text-sm"
              v-text="`${removed.kind} #${removed.id} ${removed.name}`"
            ></span>
          </div>
          <Button block type="primary" :loading="publishing" @click="publish">
            {{ $t(`${key}.publish`) }}
          </Button>
        </div>
      </Card>
      <Alert
        v-if="publishing"
        type="info"
        :message="$t(`${key}.waiting`)"
        show-icon
      />
      <Card
        v-if="receipt"
        size="small"
        :title="$t(`${key}.result`)"
        role="region"
        :aria-label="$t(`${key}.result`)"
      >
        <div class="space-y-3">
          <IedContractEvidence
            v-if="receipt.contract"
            :contract="receipt.contract"
          />
          <div class="flex flex-wrap gap-2">
            <Tag
              :color="
                receipt.configuration.state === 'active'
                  ? 'green'
                  : receipt.configuration.state === 'failed'
                    ? 'red'
                    : 'orange'
              "
            >
              {{
                $t(
                  `page.southward.channel.activation.${receipt.configuration.state}`,
                )
              }}
            </Tag>
            <Tag color="blue">
              {{
                $t(`${key}.revision`, {
                  desired: receipt.configuration.desiredRevision,
                  applied: receipt.configuration.appliedRevision ?? '—',
                })
              }}
            </Tag>
          </div>
          <Alert
            v-if="receipt.configuration.lastError"
            type="error"
            :message="receipt.configuration.lastError"
            show-icon
          />
          <Button
            v-if="receipt.configuration.state === 'failed'"
            :loading="publishing"
            @click="retry"
          >
            {{ $t(`${key}.retry`) }}
          </Button>
        </div>
      </Card>
    </div>
  </Card>
</template>
