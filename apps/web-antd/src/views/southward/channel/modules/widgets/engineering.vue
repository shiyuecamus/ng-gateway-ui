<script setup lang="ts">
import type {
  ArrayDimension,
  AssetPreview,
  BrowseDeclaration,
  BrowseLocation,
  BrowseNode,
  BrowsePage,
  EngineeringStatus,
  FieldTarget,
  ServerPreview,
} from '#/api/core/engineering';

import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { useVbenModal, VbenButton } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  Empty,
  Input,
  Select,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  browseEngineering,
  downloadEngineeringOriginal,
  getEngineeringStatus,
  previewEngineeringAsset,
  uploadScl,
} from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import EngineeringComparison from './engineering-comparison.vue';
import { describeAccess, describeFailure } from './engineering-evidence';
import EngineeringGoose from './engineering-goose.vue';
import EngineeringMapping from './engineering-mapping.vue';
import EngineeringNsd from './engineering-nsd.vue';

defineOptions({ name: 'Iec61850EngineeringModal' });
const emit = defineEmits<{ published: [] }>();
const mappingEditor = ref<InstanceType<typeof EngineeringMapping> | null>(null);
const comparisonEditor = ref<InstanceType<typeof EngineeringComparison> | null>(
  null,
);
const gooseEditor = ref<InstanceType<typeof EngineeringGoose> | null>(null);
const nsdEditor = ref<InstanceType<typeof EngineeringNsd> | null>(null);

interface Frame {
  label: string;
  location: BrowseLocation;
  offset: number;
}

const key = 'page.southward.channel.engineering';
const status = ref<EngineeringStatus | null>(null);
const preview = ref<AssetPreview | null>(null);
const server = ref<null | ServerPreview>(null);
const selectedAccessPoint = ref<null | string>(null);
const browse = ref<BrowsePage | null>(null);
const frames = ref<Frame[]>([]);
const digestInput = ref('');
const sourceLoading = ref(false);
const browseLoading = ref(false);
const downloadLoading = ref(false);
const sourcePanels = ref<string[]>(['source']);
const error = ref('');
const constraintChoices = ref<Record<string, string>>({});
const modelColumns = computed(() => [
  { key: 'name', title: $t(`${key}.name`), width: 116 },
  { key: 'declaration', title: $t(`${key}.declaration`) },
  { key: 'children', title: $t(`${key}.children`), width: 60 },
  { key: 'actions', title: $t(`${key}.select`), width: 176 },
]);
const modelRows = computed(
  () =>
    browse.value?.nodes.map((node, index) => ({ ...node, rowKey: index })) ??
    [],
);
const pageSize = computed(() => Math.min(status.value?.maxPageNodes ?? 1, 16));
const sourceReady = computed(
  () => status.value?.storeAvailable && !sourceLoading.value,
);
const canImport = computed(
  () => status.value?.sclImportAvailable && !sourceLoading.value,
);
const canOpen = computed(
  () => sourceReady.value && /^[a-f\d]{64}$/.test(digestInput.value),
);
const mappingReady = computed(
  () =>
    !!server.value &&
    (!!selectedAccessPoint.value || preview.value?.asset.source.kind === 'mms'),
);
let generation = 0;
let openEpoch = 0;
let sourceRequest: AbortController | null = null;
let navigationRequest: AbortController | null = null;
let downloadRequest: AbortController | null = null;
let statusRequest: AbortController | null = null;
let downloadUrl: null | string = null;

function releaseDownload() {
  downloadRequest?.abort();
  downloadRequest = null;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  downloadLoading.value = false;
}

/** A new source or close fences every asynchronous callback, including finally. */
function clearSource() {
  generation += 1;
  sourceRequest?.abort();
  navigationRequest?.abort();
  sourceRequest = null;
  navigationRequest = null;
  releaseDownload();
  preview.value = null;
  sourcePanels.value = ['source'];
  server.value = null;
  selectedAccessPoint.value = null;
  browse.value = null;
  frames.value = [];
  constraintChoices.value = {};
  sourceLoading.value = false;
  browseLoading.value = false;
  error.value = '';
}

const [Modal, modalApi] = useVbenModal({
  class: 'w-[1280px] max-w-[96vw]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  async onOpenChange(open: boolean) {
    const epoch = ++openEpoch;
    if (!open) {
      nsdEditor.value?.reset();
      clearSource();
      statusRequest?.abort();
      statusRequest = null;
      return;
    }
    await nextTick();
    if (epoch !== openEpoch) return;
    clearSource();
    status.value = null;
    const controller = new AbortController();
    statusRequest?.abort();
    statusRequest = controller;
    try {
      const result = await getEngineeringStatus(controller.signal);
      if (statusRequest === controller && !controller.signal.aborted)
        status.value = result;
      const data = modalApi.getData<{ digest?: string }>();
      if (epoch === openEpoch && data?.digest && result.storeAvailable) {
        digestInput.value = data.digest;
        await loadSource(async () => data.digest!);
      }
    } catch (error_) {
      if (!controller.signal.aborted && statusRequest === controller)
        error.value = describeFailure(error_, $t(`${key}.loadFailed`));
    }
  },
});

onBeforeUnmount(() => {
  nsdEditor.value?.reset();
  openEpoch += 1;
  clearSource();
  statusRequest?.abort();
});

/** Import preserves the actual File bytes; suffix and filename do not select a profile. */
async function selectFile(file: File) {
  if (!canImport.value || !status.value) return false;
  if (file.size === 0 || file.size > status.value.maxInputBytes) {
    error.value = $t(`${key}.sizeRejected`, {
      bytes: status.value.maxInputBytes,
    });
    return false;
  }
  await loadSource(async (signal) => {
    const asset = await uploadScl(file, signal);
    return asset.digest;
  });
  return false;
}

async function openSource() {
  if (!canOpen.value) return;
  const digest = digestInput.value;
  await loadSource(async () => digest);
}

async function loadSource(
  resolveDigest: (signal: AbortSignal) => Promise<string>,
) {
  clearSource();
  const current = generation;
  const controller = new AbortController();
  sourceRequest = controller;
  sourceLoading.value = true;
  try {
    const digest = await resolveDigest(controller.signal);
    if (current !== generation || controller.signal.aborted) return;
    const result = await previewEngineeringAsset(
      digest,
      0,
      pageSize.value,
      controller.signal,
    );
    if (current !== generation || controller.signal.aborted) return;
    if (result.asset.digest !== digest)
      throw new Error('Engineering source identity mismatch');
    preview.value = result;
    digestInput.value = digest;
  } catch (error_) {
    if (current === generation && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.loadFailed`));
  } finally {
    if (current === generation && sourceRequest === controller)
      sourceLoading.value = false;
  }
}

async function serverPage(offset: number) {
  if (!preview.value || sourceLoading.value) return;
  const digest = preview.value.asset.digest;
  const current = generation;
  const controller = new AbortController();
  sourceRequest?.abort();
  sourceRequest = controller;
  sourceLoading.value = true;
  try {
    const result = await previewEngineeringAsset(
      digest,
      offset,
      pageSize.value,
      controller.signal,
    );
    if (
      current === generation &&
      sourceRequest === controller &&
      !controller.signal.aborted
    ) {
      if (result.asset.digest !== digest)
        throw new Error('Engineering source identity mismatch');
      preview.value = result;
    }
  } catch (error_) {
    if (
      current === generation &&
      sourceRequest === controller &&
      !controller.signal.aborted
    )
      error.value = describeFailure(error_, $t(`${key}.loadFailed`));
  } finally {
    if (current === generation && sourceRequest === controller)
      sourceLoading.value = false;
  }
}

async function selectServer(selected: ServerPreview) {
  server.value = selected;
  sourcePanels.value = [];
  selectedAccessPoint.value = null;
  await root('logicalDevices');
}

async function root(kind: 'accessPoints' | 'logicalDevices') {
  if (!server.value) return;
  await navigate([
    {
      label: $t(`${key}.${kind}`),
      location: { kind, server: server.value.index },
      offset: 0,
    },
  ]);
}

async function descend(node: BrowseNode) {
  if (!node.target) return;
  if (node.declaration.kind === 'accessPoint')
    selectedAccessPoint.value = node.name;
  await navigate([
    ...frames.value,
    { label: node.name, location: node.target, offset: 0 },
  ]);
}

async function navigate(nextFrames: Frame[]) {
  if (!preview.value || nextFrames.length === 0) return;
  const frame = nextFrames.at(-1);
  if (!frame) return;
  const digest = preview.value.asset.digest;
  const current = generation;
  const controller = new AbortController();
  navigationRequest?.abort();
  navigationRequest = controller;
  frames.value = nextFrames;
  browse.value = null;
  browseLoading.value = true;
  error.value = '';
  try {
    const result = await browseEngineering(
      digest,
      { location: frame.location, offset: frame.offset, limit: pageSize.value },
      controller.signal,
    );
    if (
      current === generation &&
      navigationRequest === controller &&
      !controller.signal.aborted
    ) {
      if (result.digest !== digest)
        throw new Error('Engineering browse identity mismatch');
      browse.value = result;
    }
  } catch (error_) {
    if (
      current === generation &&
      navigationRequest === controller &&
      !controller.signal.aborted
    )
      error.value = describeFailure(error_, $t(`${key}.loadFailed`));
  } finally {
    if (current === generation && navigationRequest === controller)
      browseLoading.value = false;
  }
}

function field(node: BrowseNode): FieldTarget | null {
  const location = browse.value?.location;
  if (node.declaration.kind !== 'data' || !location || location.kind !== 'data')
    return null;
  return {
    domain: location.domain,
    logicalNode: location.logicalNode,
    functionalConstraint: selectedConstraint(node),
    path: node.declaration.path,
  };
}
function constraintKey(node: BrowseNode): string {
  const location = browse.value?.location;
  return JSON.stringify([
    generation,
    location && 'logicalNode' in location ? location.logicalNode : '',
    node.declaration.kind === 'data' ? node.declaration.domain : '',
    node.declaration.kind === 'data' ? node.declaration.path : [],
  ]);
}
function selectedConstraint(node: BrowseNode): null | string {
  if (node.declaration.kind !== 'data') return null;
  const choices = node.declaration.functionalConstraints;
  const chosen = constraintChoices.value[constraintKey(node)];
  if (choices.length === 1) return choices[0] ?? null;
  return chosen && choices.includes(chosen) ? chosen : null;
}
function chooseConstraint(node: BrowseNode, value: unknown) {
  if (
    node.declaration.kind === 'data' &&
    typeof value === 'string' &&
    node.declaration.functionalConstraints.includes(value)
  )
    constraintChoices.value[constraintKey(node)] = value;
}
function scalar(node: BrowseNode): boolean {
  return (
    node.declaration.kind === 'data' &&
    (node.declaration.definition.kind === 'value' ||
      node.declaration.definition.kind === 'enumeration') &&
    node.declaration.indices.length ===
      node.declaration.arrayDimensions.length &&
    ['BL', 'CF', 'DC', 'EX', 'MX', 'OR', 'SP', 'SR', 'ST', 'SV'].includes(
      selectedConstraint(node) ?? '',
    )
  );
}
function addPoint(
  node: BrowseNode,
  purpose: 'control' | 'parameterWrite' | 'read',
) {
  const target = field(node);
  if (target) mappingEditor.value?.addField(target, purpose);
}
function setCompanion(node: BrowseNode, role: 'quality' | 'sourceTime') {
  const target = field(node);
  if (target) mappingEditor.value?.companion(target, role);
}
async function catalogue(kind: 'dataSets' | 'reportControls') {
  const location = browse.value?.location;
  if (!location || !('logicalNode' in location)) return;
  await navigate([
    ...frames.value,
    {
      label: $t(`${key}.${kind === 'dataSets' ? 'dataSets' : 'reports'}`),
      offset: 0,
      location: {
        kind,
        server: location.server,
        domain: location.domain,
        logicalNode: location.logicalNode,
      },
    },
  ]);
}
function selectReport(node: BrowseNode) {
  const location = browse.value?.location;
  if (
    location?.kind === 'reportControls' &&
    node.declaration.kind === 'reportControl'
  )
    mappingEditor.value?.addReport(
      {
        domain: location.domain,
        logicalNode: location.logicalNode,
      },
      node.name,
      node.declaration,
    );
}
function bindMember(
  node: BrowseNode,
  role: 'qualityMember' | 'timeMember' | 'valueMember',
) {
  const location = browse.value?.location;
  if (
    location?.kind === 'dataSetMembers' &&
    node.declaration.kind === 'dataSetMember'
  )
    mappingEditor.value?.bindMember(
      {
        domain: location.domain,
        logicalNode: location.logicalNode,
        dataSet: location.dataSet,
      },
      node.declaration.memberIndex,
      role,
    );
}

async function browsePage(offset: number) {
  const frame = frames.value.at(-1);
  if (!frame) return;
  await navigate([...frames.value.slice(0, -1), { ...frame, offset }]);
}

async function download() {
  if (!preview.value || downloadLoading.value) return;
  releaseDownload();
  const digest = preview.value.asset.digest;
  const current = generation;
  const controller = new AbortController();
  downloadRequest = controller;
  downloadLoading.value = true;
  try {
    const blob = await downloadEngineeringOriginal(digest, controller.signal);
    if (
      current !== generation ||
      downloadRequest !== controller ||
      controller.signal.aborted
    )
      return;
    downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${digest}.${preview.value?.asset.source.kind === 'mms' ? 'json' : 'xml'}`;
    document.body.append(link);
    link.click();
    link.remove();
    // Keep this one URL alive until replacement/close, without a guessed download timer.
  } catch (error_) {
    if (current === generation && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.downloadFailed`));
  } finally {
    if (current === generation && downloadRequest === controller)
      downloadLoading.value = false;
  }
}

function arrayLabel(axes: readonly ArrayDimension[]): string {
  return axes
    .map((axis) => {
      const count =
        axis.count === null
          ? $t(`${key}.unknownArrayCount`)
          : String(axis.count);
      const reference = axis.countReference;
      return reference === null
        ? count
        : `${count} / ${$t(`${key}.countReference`, {
            name: reference.name,
            resolution: $t(`${key}.countResolution.${reference.resolution}`),
          })}`;
    })
    .join(' × ');
}

function describe(declaration: BrowseDeclaration): string {
  switch (declaration.kind) {
    case 'accessPoint': {
      return 'AccessPoint';
    }
    case 'addressParameter': {
      return declaration.value;
    }
    case 'data': {
      const definition = declaration.definition;
      let type = $t(`${key}.kinds.${definition.kind}`);
      if (definition.kind === 'dataObject')
        type += ` (${definition.cdc ?? $t(`${key}.unknownDeclaration`)})`;
      if (definition.kind === 'enumeration') type += ` (${definition.typeId})`;
      if (definition.kind === 'value') {
        type = `${$t(`${key}.${definition.dataType.origin}Type`)}: ${definition.dataType.name}`;
        if (definition.dataType.widthBits !== null)
          type += ` ${definition.dataType.widthBits}`;
        if (definition.dataType.maxLength !== null)
          type += ` (${definition.dataType.maxLength})`;
        if (definition.dataType.wireLength !== null)
          type += ` / ${$t(`${key}.wireLength`, { length: definition.dataType.wireLength })}`;
        if (definition.dataType.exponentWidthBits !== null)
          type += ` / ${$t(`${key}.exponentWidth`, { bits: definition.dataType.exponentWidthBits })}`;
        if (definition.dataType.binaryTimeDate !== null)
          type += ` / ${$t(`${key}.binaryTimeDate`, { date: definition.dataType.binaryTimeDate })}`;
      }
      const path = declaration.path
        .map(
          (component) =>
            `${component.name}${component.indices.map((index) => `[${index}]`).join('')}`,
        )
        .join('.');
      const array =
        declaration.arrayDimensions.length === 0
          ? ''
          : ` / ${$t(`${key}.arrayCount`, { count: arrayLabel(declaration.arrayDimensions) })}`;
      return `${declaration.domain} / ${path} / ${declaration.functionalConstraints.join(', ') || '—'} / ${type}${array}`;
    }
    case 'dataSet': {
      return $t(`${key}.dataSetDescription`, {
        deletable:
          declaration.observedDeletable === null
            ? $t(`${key}.unknownDeclaration`)
            : String(declaration.observedDeletable),
      });
    }
    case 'dataSetMember': {
      const name = declaration.variable.name;
      const base =
        name.kind === 'domain'
          ? `${name.domain}/${name.item}`
          : `${name.kind}:${name.item}`;
      return `${base}${describeAccess(declaration.variable.alternate_access)}`;
    }
    case 'enumerationValue': {
      return `ord: ${declaration.ordinal}`;
    }
    case 'logicalDevice': {
      return `${$t(`${key}.domain`)}: ${declaration.domain}`;
    }
    case 'logicalNode': {
      return `lnClass: ${declaration.declaredClass ?? $t(`${key}.unknownDeclaration`)}`;
    }
    case 'networkAddress': {
      return $t(`${key}.networkIndex`, { index: declaration.index });
    }
    case 'reportControl': {
      return `${declaration.reportKind} / ConfRev=${declaration.confRev} / ${declaration.dataSet ? `${declaration.dataSet.domain}/${declaration.dataSet.logicalNode}$${declaration.dataSet.name}` : '—'} / RptID=${declaration.reportId ?? '—'}`;
    }
  }
}
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <div class="space-y-5">
      <Alert
        v-if="status && !status.storeAvailable"
        type="error"
        show-icon
        :message="status.unavailableReason ?? $t(`${key}.unavailable`)"
      />
      <Alert v-if="error" type="error" show-icon :message="error" />
      <EngineeringNsd ref="nsdEditor" :status="status" />
      <div class="flex flex-col items-start gap-3 sm:flex-row">
        <Collapse
          v-model:active-key="sourcePanels"
          class="w-full min-w-0 flex-1 rounded-lg"
        >
          <CollapsePanel key="source" :header="$t(`${key}.sourceTitle`)">
            <template #extra>
              <div class="flex flex-wrap items-center gap-2">
                <Tag
                  v-if="preview"
                  :color="
                    preview.asset.source.kind === 'scl' ? 'blue' : 'purple'
                  "
                >
                  {{ preview.asset.source.kind === 'scl' ? 'SCL' : 'MMS' }}
                </Tag>
                <Tag v-if="server" color="cyan">
                  {{
                    server.iedName ??
                    $t(`${key}.unnamed`, { index: server.index })
                  }}
                </Tag>
              </div>
            </template>
            <div class="space-y-4">
              <div
                class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[auto_minmax(0,1fr)]"
              >
                <div class="space-y-2">
                  <Upload
                    :disabled="!canImport"
                    :file-list="[]"
                    :max-count="1"
                    :show-upload-list="false"
                    :before-upload="selectFile"
                    accept=".scl,.scd,.icd,.cid,.iid,.ssd,.sed,.xml"
                  >
                    <VbenButton
                      as="span"
                      variant="outline"
                      size="sm"
                      :disabled="!canImport"
                      :loading="sourceLoading"
                    >
                      {{ $t(`${key}.upload`) }}
                    </VbenButton>
                  </Upload>
                  <div v-if="status" class="text-xs text-muted-foreground">
                    {{
                      $t(`${key}.limit`, {
                        bytes: status.maxInputBytes.toLocaleString(),
                      })
                    }}
                  </div>
                </div>
                <div class="flex min-w-0 items-center gap-2">
                  <Input
                    v-model:value="digestInput"
                    :aria-label="$t(`${key}.digestInput`)"
                    :placeholder="$t(`${key}.digestInput`)"
                    :maxlength="64"
                    :disabled="sourceLoading"
                    class="font-mono"
                  />
                  <Button
                    :disabled="!canOpen"
                    :loading="sourceLoading"
                    @click="openSource"
                  >
                    {{ $t(`${key}.open`) }}
                  </Button>
                </div>
              </div>
              <Descriptions
                v-if="preview"
                :column="{ xs: 1, sm: 1, md: 2 }"
                size="small"
              >
                <DescriptionsItem label="SHA-256">
                  <EvidenceDigest :value="preview.asset.digest" />
                </DescriptionsItem>
                <DescriptionsItem :label="$t(`${key}.sourceKind`)">
                  <Tag v-if="preview.asset.source.kind === 'scl'" color="blue">
                    {{ preview.asset.source.profile }}
                  </Tag>
                  <Tag v-else color="purple">
                    {{ $t(`${key}.observedSource`) }}
                  </Tag>
                  <Tag v-if="preview.asset.source.kind === 'scl'">
                    {{ preview.asset.source.encoding }}
                  </Tag>
                  <span class="text-xs text-muted-foreground">{{
                    $t(`${key}.bytes`, {
                      bytes: preview.asset.sizeBytes.toLocaleString(),
                    })
                  }}</span>
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="preview.asset.source.kind === 'mms'"
                  :label="$t(`${key}.captureDeclarations`)"
                >
                  <span
                    v-if="
                      preview.asset.source.declarations.kind === 'unrecorded'
                    "
                  >
                    {{ $t(`${key}.captureDeclarationsUnrecorded`) }}
                  </span>
                  <span v-else class="break-all text-xs">
                    {{ $t(`${key}.captureDeclarationsRecorded`) }} /
                    {{ preview.asset.source.declarations.snapshotDigest }}
                  </span>
                </DescriptionsItem>
              </Descriptions>
              <div
                v-if="preview"
                role="region"
                :aria-label="$t(`${key}.servers`)"
                class="flex flex-wrap items-center gap-2"
              >
                <span class="mr-2 text-sm text-muted-foreground">{{
                  $t(`${key}.servers`)
                }}</span>
                <Button
                  v-for="item in preview.servers"
                  :key="item.index"
                  :type="server?.index === item.index ? 'primary' : 'default'"
                  :disabled="sourceLoading"
                  @click="selectServer(item)"
                >
                  {{
                    item.iedName ?? $t(`${key}.unnamed`, { index: item.index })
                  }}
                </Button>
                <Empty
                  v-if="preview.totalServers === 0"
                  :description="$t(`${key}.empty`)"
                />
                <template v-if="preview.totalServers > pageSize">
                  <Button
                    size="small"
                    :disabled="preview.offset === 0 || sourceLoading"
                    @click="serverPage(Math.max(0, preview.offset - pageSize))"
                  >
                    {{ $t(`${key}.previous`) }}
                  </Button>
                  <span class="text-xs text-muted-foreground">{{
                    $t(`${key}.page`, {
                      from: preview.totalServers === 0 ? 0 : preview.offset + 1,
                      to: preview.offset + preview.servers.length,
                      total: preview.totalServers,
                    })
                  }}</span>
                  <Button
                    size="small"
                    :disabled="
                      preview.offset + preview.servers.length >=
                        preview.totalServers || sourceLoading
                    "
                    @click="serverPage(preview.offset + pageSize)"
                  >
                    {{ $t(`${key}.next`) }}
                  </Button>
                </template>
              </div>
              <Alert
                v-else
                type="info"
                show-icon
                :message="$t(`${key}.instructions`)"
              />
            </div>
          </CollapsePanel>
        </Collapse>
        <Button v-if="preview" :loading="downloadLoading" @click="download">
          {{ $t(`${key}.download`) }}
        </Button>
      </div>
      <Button
        v-if="preview && server"
        @click="comparisonEditor?.open(preview.asset, server.index)"
      >
        {{ $t(`${key}.comparison.title`) }}
      </Button>
      <EngineeringComparison ref="comparisonEditor" />
      <Button
        v-if="preview?.asset.source.kind === 'scl' && server"
        @click="gooseEditor?.open(preview.asset, server.index)"
      >
        {{ $t(`${key}.goose.title`) }}
      </Button>
      <EngineeringGoose ref="gooseEditor" />
      <div
        v-if="preview && server"
        class="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        <Card
          :title="$t(`${key}.model`)"
          role="region"
          :aria-label="$t(`${key}.model`)"
          :aria-busy="browseLoading"
          class="min-w-0 xl:sticky xl:top-0"
          :body-style="{ padding: '16px' }"
        >
          <template #extra>
            <Tag
              :color="preview.asset.source.kind === 'scl' ? 'blue' : 'purple'"
            >
              {{
                $t(
                  `${key}.${preview.asset.source.kind === 'scl' ? 'declaredType' : 'observedType'}`,
                )
              }}
            </Tag>
          </template>
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <Button size="small" @click="root('accessPoints')">
                {{ $t(`${key}.accessPoints`) }}
              </Button>
              <Button size="small" @click="root('logicalDevices')">
                {{ $t(`${key}.logicalDevices`) }}
              </Button>
              <Button
                v-if="browse && 'logicalNode' in browse.location"
                size="small"
                @click="catalogue('reportControls')"
              >
                {{ $t(`${key}.reports`) }}
              </Button>
              <Button
                v-if="browse && 'logicalNode' in browse.location"
                size="small"
                @click="catalogue('dataSets')"
              >
                {{ $t(`${key}.dataSets`) }}
              </Button>
              <Tag v-if="selectedAccessPoint" color="cyan">
                {{ $t(`${key}.selectedAp`, { name: selectedAccessPoint }) }}
              </Tag>
            </div>
            <Breadcrumb role="navigation" :aria-label="$t(`${key}.breadcrumb`)">
              <BreadcrumbItem v-for="(frame, index) in frames" :key="index">
                <Button
                  type="link"
                  size="small"
                  class="h-auto whitespace-normal p-0 text-left"
                  @click="navigate(frames.slice(0, index + 1))"
                >
                  {{ frame.label }}
                </Button>
              </BreadcrumbItem>
            </Breadcrumb>
            <Table
              :columns="modelColumns"
              :data-source="modelRows"
              :pagination="false"
              :loading="browseLoading"
              size="small"
              row-key="rowKey"
              :locale="{ emptyText: $t(`${key}.empty`) }"
              :scroll="{ x: 510 }"
            >
              <template #bodyCell="{ column, index }">
                <template
                  v-for="node in modelRows.slice(index, index + 1)"
                  :key="node.rowKey"
                >
                  <template v-if="column.key === 'name'">
                    <Button
                      v-if="node.target"
                      type="link"
                      class="h-auto max-w-full whitespace-normal break-all p-0 text-left"
                      @click="descend(node)"
                    >
                      {{ node.name }}
                    </Button>
                    <span v-else class="break-all font-medium">{{
                      node.name
                    }}</span>
                  </template>
                  <template v-else-if="column.key === 'declaration'">
                    <div class="space-y-2 py-1">
                      <div
                        class="break-words text-xs leading-5 text-muted-foreground"
                      >
                        {{ describe(node.declaration) }}
                      </div>
                      <div
                        v-if="node.declaration.kind === 'data'"
                        class="flex flex-wrap gap-1"
                      >
                        <Tag
                          v-for="fc in node.declaration.functionalConstraints"
                          :key="fc"
                          color="cyan"
                          class="mr-0"
                        >
                          {{ fc }}
                        </Tag>
                        <Tag
                          v-if="node.declaration.arrayDimensions.length > 0"
                          :color="
                            node.declaration.arrayDimensions.some(
                              (axis) => axis.count === null,
                            )
                              ? 'warning'
                              : 'geekblue'
                          "
                          class="mr-0"
                        >
                          {{
                            $t(`${key}.arrayCount`, {
                              count: arrayLabel(
                                node.declaration.arrayDimensions,
                              ),
                            })
                          }}
                        </Tag>
                      </div>
                      <Tag
                        v-if="node.declaration.kind === 'reportControl'"
                        color="purple"
                      >
                        {{
                          node.declaration.reportKind === 'buffered'
                            ? 'BRCB'
                            : 'URCB'
                        }}
                      </Tag>
                      <Tag
                        v-if="node.declaration.kind === 'reportControl'"
                        :color="
                          node.declaration.evidence.kind === 'observed'
                            ? 'cyan'
                            : 'blue'
                        "
                      >
                        {{
                          $t(
                            `${key}.mapping.${node.declaration.evidence.kind === 'observed' ? 'sourceObserved' : 'sourceDeclared'}`,
                          )
                        }}
                      </Tag>
                      <Select
                        v-if="
                          node.declaration.kind === 'data' &&
                          (node.declaration.definition.kind === 'value' ||
                            node.declaration.definition.kind ===
                              'enumeration') &&
                          node.declaration.functionalConstraints.length > 1
                        "
                        :aria-label="$t(`${key}.chooseFc`, { name: node.name })"
                        :value="selectedConstraint(node) ?? undefined"
                        :options="
                          node.declaration.functionalConstraints.map(
                            (fc: string) => ({ label: fc, value: fc }),
                          )
                        "
                        class="w-full"
                        @change="(value) => chooseConstraint(node, value)"
                      />
                    </div>
                  </template>
                  <template v-else-if="column.key === 'children'">
                    <Tag>{{ node.childCount ?? '—' }}</Tag>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <div class="flex flex-wrap gap-2 py-1">
                      <template v-if="mappingReady">
                        <Button
                          v-if="scalar(node)"
                          size="small"
                          @click="addPoint(node, 'read')"
                        >
                          <template #default>
                            <span>{{ $t(`${key}.addRead`) }}</span>
                          </template>
                        </Button>
                        <Button
                          v-if="
                            scalar(node) &&
                            node.declaration.kind === 'data' &&
                            ['SP', 'SV', 'CF'].includes(
                              selectedConstraint(node) ?? '',
                            )
                          "
                          size="small"
                          @click="addPoint(node, 'parameterWrite')"
                        >
                          <template #default>
                            <span>{{ $t(`${key}.addParameter`) }}</span>
                          </template>
                        </Button>
                        <Button
                          v-if="
                            node.declaration.kind === 'data' &&
                            node.declaration.definition.kind === 'dataObject'
                          "
                          size="small"
                          @click="addPoint(node, 'control')"
                        >
                          <template #default>
                            <span>{{ $t(`${key}.addControl`) }}</span>
                          </template>
                        </Button>
                        <template v-if="scalar(node)">
                          <Button
                            size="small"
                            v-if="
                              node.declaration.kind === 'data' &&
                              node.declaration.definition.kind === 'value' &&
                              (node.declaration.definition.dataType.name ===
                                'quality' ||
                                (node.declaration.definition.dataType.name ===
                                  'bitString' &&
                                  [13, -13].includes(
                                    node.declaration.definition.dataType
                                      .wireLength ?? 0,
                                  )))
                            "
                            @click="setCompanion(node, 'quality')"
                          >
                            <template #default>
                              <span>{{ $t(`${key}.setQuality`) }}</span>
                            </template>
                          </Button>
                          <Button
                            size="small"
                            v-if="
                              node.declaration.kind === 'data' &&
                              node.declaration.definition.kind === 'value' &&
                              ['timestamp', 'utcTime'].includes(
                                node.declaration.definition.dataType.name,
                              )
                            "
                            @click="setCompanion(node, 'sourceTime')"
                          >
                            <template #default>
                              <span>{{ $t(`${key}.setTime`) }}</span>
                            </template>
                          </Button>
                        </template>
                        <Button
                          v-if="
                            node.declaration.kind === 'reportControl' &&
                            node.declaration.dataSet
                          "
                          size="small"
                          @click="selectReport(node)"
                        >
                          <template #default>
                            <span>{{ $t(`${key}.addReport`) }}</span>
                          </template>
                        </Button>
                        <template
                          v-if="node.declaration.kind === 'dataSetMember'"
                        >
                          <Button
                            size="small"
                            @click="bindMember(node, 'valueMember')"
                          >
                            <template #default>
                              <span>{{ $t(`${key}.bindValue`) }}</span>
                            </template>
                          </Button>
                          <Button
                            size="small"
                            @click="bindMember(node, 'qualityMember')"
                          >
                            <template #default>
                              <span>{{ $t(`${key}.bindQuality`) }}</span>
                            </template>
                          </Button>
                          <Button
                            size="small"
                            @click="bindMember(node, 'timeMember')"
                          >
                            {{ $t(`${key}.bindTime`) }}
                          </Button>
                        </template>
                      </template>
                    </div>
                  </template>
                </template>
              </template>
            </Table>
            <div
              v-if="browse"
              class="flex flex-wrap items-center justify-between gap-2"
            >
              <Button
                size="small"
                :disabled="browse.offset === 0 || browseLoading"
                @click="browsePage(Math.max(0, browse.offset - pageSize))"
              >
                {{ $t(`${key}.previous`) }}
              </Button>
              <span class="text-xs text-muted-foreground">{{
                $t(`${key}.page`, {
                  from: browse.total === 0 ? 0 : browse.offset + 1,
                  to: browse.offset + browse.nodes.length,
                  total: browse.total,
                })
              }}</span>
              <Button
                size="small"
                :disabled="
                  browse.offset + browse.nodes.length >= browse.total ||
                  browseLoading
                "
                @click="browsePage(browse.offset + pageSize)"
              >
                {{ $t(`${key}.next`) }}
              </Button>
            </div>
          </div>
        </Card>
        <EngineeringMapping
          v-if="mappingReady && status"
          :key="`${preview.asset.digest}:${server.index}:${selectedAccessPoint}`"
          ref="mappingEditor"
          :digest="preview.asset.digest"
          :server="server.index"
          :access-point="selectedAccessPoint"
          :source-channel="
            preview.asset.source.kind === 'mms'
              ? preview.asset.source.channelId
              : null
          "
          :maximum-points="status.maxMappingPoints"
          @published="emit('published')"
        />
        <Card v-else :title="$t(`${key}.mapping.title`)">
          <Empty :description="$t(`${key}.chooseApHint`)" />
        </Card>
      </div>
    </div>
  </Modal>
</template>
