<script setup lang="ts">
import type {
  AssetInfo,
  AssetPreview,
  ComparisonEvidence,
  ComparisonPage,
  ComparisonReason,
  ComparisonStatus,
  EngineeringStatus,
} from '#/api/core/engineering';

import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
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
  compareEngineering,
  getEngineeringStatus,
  previewEngineeringAsset,
  uploadScl,
} from '#/api/core/engineering';

import { describeAccess, describeFailure } from './engineering-evidence';

defineOptions({ name: 'Iec61850ComparisonModal' });
type Role = 'declaration' | 'observation';
const roles = ['declaration', 'observation'] as const;
const outcomes: ComparisonStatus[] = [
  'agreement',
  'conflict',
  'declaredOnly',
  'observedOnly',
  'unknown',
];
const key = 'page.southward.channel.engineering.comparison';
const formId = useId();
const status = ref<EngineeringStatus | null>(null);
const digests = ref<Record<Role, string>>({ declaration: '', observation: '' });
const previews = ref<Record<Role, AssetPreview | null>>({
  declaration: null,
  observation: null,
});
const servers = ref<Record<Role, number | undefined>>({
  declaration: undefined,
  observation: undefined,
});
const domainChoices = ref<Record<Role, string[]>>({
  declaration: [],
  observation: [],
});
const sourceLoading = ref<Record<Role, boolean>>({
  declaration: false,
  observation: false,
});
const domains = ref<string[]>([]);
const statuses = ref<ComparisonStatus[]>([]);
const result = ref<ComparisonPage | null>(null);
const loading = ref(false);
const error = ref('');
const sourceRequests: Record<Role, AbortController | null> = {
  declaration: null,
  observation: null,
};
const domainRequests: Record<Role, AbortController | null> = {
  declaration: null,
  observation: null,
};
let comparisonRequest: AbortController | null = null;
let statusRequest: AbortController | null = null;
let generation = 0;
let openEpoch = 0;
const pageSize = computed(() => Math.min(status.value?.maxPageNodes ?? 1, 16));
const options = computed(() =>
  [
    ...new Set([
      ...domainChoices.value.declaration,
      ...domainChoices.value.observation,
    ]),
  ].map((value) => ({ label: value, value })),
);
const ready = computed(
  () =>
    roles.every(
      (role) =>
        previews.value[role]?.asset.digest === digests.value[role] &&
        previews.value[role]?.asset.source.kind ===
          (role === 'declaration' ? 'scl' : 'mms') &&
        servers.value[role] !== undefined &&
        !sourceLoading.value[role],
    ) &&
    domains.value.length > 0 &&
    domains.value.length <= 256 &&
    domains.value.every((name) => /^\w{1,255}$/.test(name)),
);
const rows = computed(
  () =>
    result.value?.findings.map((finding, index) => ({
      ...finding,
      rowKey: result.value!.offset + index,
    })) ?? [],
);
const columns = computed(() => [
  { key: 'location', title: $t(`${key}.location`), width: 220 },
  { key: 'reason', title: $t(`${key}.fact`), width: 150 },
  { key: 'declaration', title: $t(`${key}.declaration`), width: 280 },
  { key: 'observation', title: $t(`${key}.observation`), width: 280 },
  { key: 'status', title: $t(`${key}.outcome`), width: 130 },
]);

function clearComparison() {
  generation += 1;
  comparisonRequest?.abort();
  comparisonRequest = null;
  result.value = null;
  loading.value = false;
  error.value = '';
}
function resetSource(role: Role) {
  sourceRequests[role]?.abort();
  sourceRequests[role] = null;
  domainRequests[role]?.abort();
  domainRequests[role] = null;
  previews.value[role] = null;
  servers.value[role] = undefined;
  domainChoices.value[role] = [];
  sourceLoading.value[role] = false;
  clearComparison();
}
function reset() {
  status.value = null;
  for (const role of roles) resetSource(role);
  digests.value = { declaration: '', observation: '' };
  domains.value = [];
  statuses.value = [];
  statusRequest?.abort();
  statusRequest = null;
}
for (const role of roles) {
  watch(
    () => digests.value[role],
    () => resetSource(role),
    { flush: 'sync' },
  );
  watch(
    () => servers.value[role],
    () => {
      clearComparison();
      void loadDomains(role);
    },
    { flush: 'sync' },
  );
}
watch([domains, statuses], clearComparison, { deep: true, flush: 'sync' });

const [Modal, modalApi] = useVbenModal({
  class: 'w-[1280px] max-w-[96vw]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  async onOpenChange(open: boolean) {
    const epoch = ++openEpoch;
    reset();
    if (!open) return;
    await nextTick();
    if (epoch !== openEpoch) return;
    const controller = new AbortController();
    statusRequest = controller;
    try {
      const actual = await getEngineeringStatus(controller.signal);
      if (epoch !== openEpoch || controller.signal.aborted) return;
      status.value = actual;
      const selected = modalApi.getData<{ asset: AssetInfo; server: number }>();
      if (!selected || !actual.storeAvailable) return;
      const role =
        selected.asset.source.kind === 'scl' ? 'declaration' : 'observation';
      digests.value[role] = selected.asset.digest;
      await loadSource(
        role,
        Math.floor(selected.server / pageSize.value) * pageSize.value,
        selected.server,
      );
    } catch (error_) {
      if (epoch === openEpoch && !controller.signal.aborted)
        error.value = describeFailure(error_, $t(`${key}.failed`));
    }
  },
});
onBeforeUnmount(() => {
  openEpoch += 1;
  reset();
});
function open(asset: AssetInfo, server: number) {
  modalApi.setData({ asset, server }).open();
}
defineExpose({ open });

async function loadSource(role: Role, offset = 0, preferred?: number) {
  const digest = digests.value[role];
  if (!/^[a-f\d]{64}$/.test(digest)) return;
  sourceRequests[role]?.abort();
  const controller = new AbortController();
  sourceRequests[role] = controller;
  sourceLoading.value[role] = true;
  clearComparison();
  try {
    const preview = await previewEngineeringAsset(
      digest,
      offset,
      pageSize.value,
      controller.signal,
    );
    if (
      sourceRequests[role] !== controller ||
      controller.signal.aborted ||
      digest !== digests.value[role]
    )
      return;
    if (
      preview.asset.source.kind !== (role === 'declaration' ? 'scl' : 'mms')
    ) {
      error.value = $t(`${key}.wrongRole`);
      previews.value[role] = null;
      return;
    }
    previews.value[role] = preview;
    servers.value[role] = preview.servers.some(
      (server) => server.index === preferred,
    )
      ? preferred
      : preview.servers[0]?.index;
  } catch (error_) {
    if (sourceRequests[role] === controller && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (sourceRequests[role] === controller) sourceLoading.value[role] = false;
  }
}
async function loadDomains(role: Role) {
  domainRequests[role]?.abort();
  domainChoices.value[role] = [];
  const server = servers.value[role];
  const digest = previews.value[role]?.asset.digest;
  if (server === undefined || !digest) return;
  const controller = new AbortController();
  domainRequests[role] = controller;
  try {
    const page = await browseEngineering(
      digest,
      {
        location: { kind: 'logicalDevices', server },
        offset: 0,
        limit: pageSize.value,
      },
      controller.signal,
    );
    if (domainRequests[role] === controller && !controller.signal.aborted)
      domainChoices.value[role] = page.nodes.flatMap((node) =>
        node.declaration.kind === 'logicalDevice'
          ? [node.declaration.domain]
          : [],
      );
  } catch (error_) {
    if (domainRequests[role] === controller && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  }
}
async function importDeclaration(file: File) {
  if (
    !status.value?.sclImportAvailable ||
    file.size === 0 ||
    file.size > status.value.maxInputBytes
  ) {
    error.value = $t(`${key}.sizeRejected`, {
      bytes: status.value?.maxInputBytes ?? 0,
    });
    return false;
  }
  resetSource('declaration');
  const controller = new AbortController();
  sourceRequests.declaration = controller;
  sourceLoading.value.declaration = true;
  try {
    const asset = await uploadScl(file, controller.signal);
    if (sourceRequests.declaration !== controller || controller.signal.aborted)
      return false;
    digests.value.declaration = asset.digest;
    await loadSource('declaration');
  } catch (error_) {
    if (sourceRequests.declaration === controller && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (sourceRequests.declaration === controller)
      sourceLoading.value.declaration = false;
  }
  return false;
}
async function compare(offset = 0) {
  if (
    !ready.value ||
    servers.value.declaration === undefined ||
    servers.value.observation === undefined
  )
    return;
  const controller = new AbortController();
  comparisonRequest?.abort();
  comparisonRequest = controller;
  const current = generation;
  loading.value = true;
  error.value = '';
  try {
    const page = await compareEngineering(
      {
        declaration: {
          digest: digests.value.declaration,
          server: servers.value.declaration,
        },
        observation: {
          digest: digests.value.observation,
          server: servers.value.observation,
        },
        domains: [...domains.value],
        statuses: [...statuses.value],
        offset,
        limit: pageSize.value,
      },
      controller.signal,
    );
    if (
      current === generation &&
      comparisonRequest === controller &&
      !controller.signal.aborted
    )
      result.value = page;
  } catch (error_) {
    if (current === generation && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (current === generation && comparisonRequest === controller)
      loading.value = false;
  }
}
function evidenceText(
  evidence: ComparisonEvidence | null,
  reason: ComparisonReason,
): string {
  const unknown = $t(`${key}.unknown`);
  if (evidence === null) return $t(`${key}.absent`);
  switch (evidence.kind) {
    case 'boolean': {
      return evidence.value === null ? unknown : String(evidence.value);
    }
    case 'changeTriggers': {
      return `dchg=${evidence.dataChange}, qchg=${evidence.qualityChange}, dupd=${evidence.dataUpdate}`;
    }
    case 'dataSet': {
      return $t(`${key}.membersCount`, { count: evidence.memberCount });
    }
    case 'declarationValues': {
      return evidence.count === null
        ? unknown
        : $t(`${key}.valuesCount`, { count: evidence.count });
    }
    case 'dimensions': {
      return evidence.axes.length === 0
        ? $t(`${key}.scalar`)
        : evidence.axes
            .map((axis) => {
              const shape = `${axis.count ?? unknown} (packed=${axis.packed ?? unknown})`;
              const reference = axis.countReference;
              return reference === null
                ? shape
                : `${shape} / ${$t(
                    'page.southward.channel.engineering.countReference',
                    {
                      name: reference.name,
                      resolution: $t(
                        `page.southward.channel.engineering.countResolution.${reference.resolution}`,
                      ),
                    },
                  )}`;
            })
            .join(' × ');
    }
    case 'enumeration': {
      return `${evidence.typeId} / ${$t(`${key}.labelsCount`, { count: evidence.labelCount })}`;
    }
    case 'member': {
      const name = evidence.variable.name;
      return `${name.kind === 'domain' ? `${name.domain}/${name.item}` : `${name.kind}:${name.item}`}${describeAccess(evidence.variable.alternate_access)}`;
    }
    case 'representation': {
      const definition = evidence.definition;
      if (definition.kind === 'dataObject') return $t(`${key}.structure`);
      if (definition.kind === 'structure') return $t(`${key}.structure`);
      if (definition.kind === 'enumeration')
        return `Enum (${definition.typeId})`;
      const data = definition.dataType;
      return [
        data.name,
        data.widthBits === null ? '' : `${data.widthBits} bit`,
        data.wireLength === null
          ? ''
          : $t(
              `${key}.${data.wireLength < 0 ? 'maximumLength' : 'fixedLength'}`,
              { count: Math.abs(data.wireLength) },
            ),
        data.maxLength === null
          ? ''
          : $t(`${key}.maximumLength`, { count: data.maxLength }),
        data.exponentWidthBits === null
          ? ''
          : `exponent=${data.exponentWidthBits}`,
        data.binaryTimeDate === null ? '' : `date=${data.binaryTimeDate}`,
      ]
        .filter(Boolean)
        .join(' / ');
    }
    case 'text': {
      if (evidence.value === null) return unknown;
      if (evidence.value === '') return $t(`${key}.emptyText`);
      return evidence.value;
    }
    case 'report': {
      switch (reason) {
        case 'bufferTime': {
          return `${evidence.bufferTimeMs} ms`;
        }
        case 'configurationRevision': {
          return String(evidence.confRev);
        }
        case 'integrityPeriod': {
          return `${evidence.integrityPeriodMs} ms`;
        }
        case 'reportDataSet': {
          return evidence.dataSet
            ? `${evidence.dataSet.domain}/${evidence.dataSet.logicalNode}$${evidence.dataSet.name}`
            : $t(`${key}.unconfigured`);
        }
        case 'reportId': {
          if (evidence.reportId === null) return unknown;
          if (evidence.reportId === '') return $t(`${key}.emptyText`);
          return evidence.reportId;
        }
        case 'reportKind': {
          return evidence.reportKind;
        }
        case 'reportOptions': {
          return Object.entries(evidence.options)
            .map(([name, value]) => `${name}=${value ?? unknown}`)
            .join(', ');
        }
        case 'reportTriggers': {
          return Object.entries(evidence.triggers)
            .map(([name, value]) => `${name}=${value ?? unknown}`)
            .join(', ');
        }
        default: {
          return evidence.evidence.kind === 'declared'
            ? evidence.evidence.templateName
            : $t(`${key}.liveAllocationUnknown`);
        }
      }
    }
  }
}
function outcomeColor(value: ComparisonStatus) {
  return {
    agreement: 'green',
    conflict: 'red',
    declaredOnly: 'blue',
    observedOnly: 'purple',
    unknown: 'gold',
  }[value];
}
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <div class="space-y-4">
      <Alert type="info" show-icon :message="$t(`${key}.scopeNotice`)" />
      <Alert v-if="error" type="error" show-icon :message="error" />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          v-for="role in roles"
          :key="role"
          :title="$t(`${key}.${role}`)"
          role="region"
          :aria-label="$t(`${key}.${role}`)"
        >
          <div class="space-y-3">
            <Input
              v-model:value="digests[role]"
              :aria-label="$t(`${key}.${role}Digest`)"
              :placeholder="$t(`${key}.digestPlaceholder`)"
              :maxlength="64"
            />
            <div class="flex flex-wrap gap-2">
              <Button
                :disabled="
                  !/^[a-f\d]{64}$/.test(digests[role]) || sourceLoading[role]
                "
                :loading="sourceLoading[role]"
                @click="loadSource(role)"
              >
                {{ $t(`${key}.load`) }}
              </Button>
              <Upload
                v-if="role === 'declaration'"
                :show-upload-list="false"
                :before-upload="importDeclaration"
                :disabled="
                  !status?.sclImportAvailable || sourceLoading.declaration
                "
              >
                <Button
                  :disabled="
                    !status?.sclImportAvailable || sourceLoading.declaration
                  "
                >
                  {{ $t(`${key}.import`) }}
                </Button>
              </Upload>
            </div>
            <template v-if="previews[role]?.asset.digest === digests[role]">
              <label :for="`${formId}-${role}-server`">{{
                $t(`${key}.${role}Server`)
              }}</label>
              <Select
                :id="`${formId}-${role}-server`"
                v-model:value="servers[role]"
                class="w-full"
                :options="
                  previews[role]?.servers.map((server) => ({
                    value: server.index,
                    label:
                      server.iedName ??
                      $t(`${key}.unnamed`, { index: server.index }),
                  }))
                "
              />
              <div
                v-if="(previews[role]?.totalServers ?? 0) > pageSize"
                class="flex gap-2"
              >
                <Button
                  :disabled="!previews[role]?.offset || sourceLoading[role]"
                  @click="
                    loadSource(role, (previews[role]?.offset ?? 0) - pageSize)
                  "
                >
                  {{ $t(`${key}.previous`) }}
                </Button>
                <Button
                  :disabled="
                    (previews[role]?.offset ?? 0) + pageSize >=
                      (previews[role]?.totalServers ?? 0) || sourceLoading[role]
                  "
                  @click="
                    loadSource(role, (previews[role]?.offset ?? 0) + pageSize)
                  "
                >
                  {{ $t(`${key}.next`) }}
                </Button>
              </div>
              <Descriptions :column="1" size="small">
                <DescriptionsItem :label="$t(`${key}.digest`)">
                  <span class="break-all font-mono text-xs">{{
                    previews[role]?.asset.digest
                  }}</span>
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="previews[role]?.asset.source.kind === 'mms'"
                  :label="$t(`${key}.captureTime`)"
                >
                  {{ previews[role]?.asset.source.completedAt }}
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="previews[role]?.asset.source.kind === 'mms'"
                  :label="$t(`${key}.captureRevision`)"
                >
                  {{ previews[role]?.asset.source.configurationRevision }}
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="previews[role]?.asset.source.kind === 'mms'"
                  :label="
                    $t('page.southward.channel.engineering.captureDeclarations')
                  "
                >
                  <span
                    v-if="
                      previews[role].asset.source.declarations.kind ===
                      'unrecorded'
                    "
                  >
                    {{
                      $t(
                        'page.southward.channel.engineering.captureDeclarationsUnrecorded',
                      )
                    }}
                  </span>
                  <span v-else class="break-all text-xs">
                    {{
                      $t(
                        'page.southward.channel.engineering.captureDeclarationsRecorded',
                      )
                    }}
                    /
                    {{
                      previews[role].asset.source.declarations.snapshotDigest
                    }}
                  </span>
                </DescriptionsItem>
              </Descriptions>
            </template>
          </div>
        </Card>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <label :for="`${formId}-domains`">{{ $t(`${key}.domains`) }}</label>
          <Select
            :id="`${formId}-domains`"
            class="w-full"
            v-model:value="domains"
            mode="tags"
            :placeholder="$t(`${key}.domains`)"
            :options="options"
            :max-tag-count="8"
          />
        </div>
        <div class="space-y-2">
          <label :for="`${formId}-statuses`">{{ $t(`${key}.filter`) }}</label>
          <Select
            :id="`${formId}-statuses`"
            class="w-full"
            v-model:value="statuses"
            mode="multiple"
            :placeholder="$t(`${key}.allOutcomes`)"
            :options="
              outcomes.map((value) => ({
                value,
                label: $t(`${key}.statuses.${value}`),
              }))
            "
          />
        </div>
      </div>
      <Button
        type="primary"
        :disabled="!ready || loading"
        :loading="loading"
        @click="compare(0)"
      >
        {{ $t(`${key}.run`) }}
      </Button>
      <Card
        :title="$t(`${key}.results`)"
        role="region"
        :aria-label="$t(`${key}.results`)"
        :aria-busy="loading"
      >
        <template v-if="result">
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <Tag
              v-for="outcome in outcomes"
              :key="outcome"
              :color="outcomeColor(outcome)"
            >
              {{ $t(`${key}.statuses.${outcome}`) }}:
              {{ result.summary[outcome] }}
            </Tag>
            <span>{{
              $t(`${key}.totalFacts`, { count: result.totalFacts })
            }}</span>
          </div>
          <Table
            :columns="columns"
            :data-source="rows"
            row-key="rowKey"
            size="small"
            :pagination="false"
            :scroll="{ x: 1060 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'location'">
                <div class="break-all font-mono text-xs">
                  {{
                    [
                      record.location.domain,
                      record.location.logicalNode,
                      record.location.functionalConstraint,
                      record.location.path.join('.'),
                    ]
                      .filter(Boolean)
                      .join(' / ')
                  }}
                </div>
                <div v-if="record.location.memberIndex !== null">
                  {{
                    $t(`${key}.slot`, { index: record.location.memberIndex })
                  }}
                </div>
              </template>
              <template v-else-if="column.key === 'reason'">
                {{ $t(`${key}.reasons.${record.reason}`) }}
              </template>
              <template v-else-if="column.key === 'status'">
                <Tag :color="outcomeColor(record.status)">
                  {{ $t(`${key}.statuses.${record.status}`) }}
                </Tag>
              </template>
              <div v-else class="whitespace-pre-wrap break-all text-xs">
                {{
                  evidenceText(
                    column.key === 'declaration'
                      ? record.declaration
                      : record.observation,
                    record.reason,
                  )
                }}
              </div>
            </template>
          </Table>
          <div class="mt-4 flex items-center justify-end gap-3">
            <span>{{
              $t(`${key}.page`, {
                start: result.findings.length > 0 ? result.offset + 1 : 0,
                end: result.offset + result.findings.length,
                total: result.total,
              })
            }}</span>
            <Button
              :disabled="result.offset === 0 || loading"
              @click="compare(Math.max(0, result.offset - pageSize))"
            >
              {{ $t(`${key}.previous`) }}
            </Button>
            <Button
              :disabled="
                result.offset + result.findings.length >= result.total ||
                loading
              "
              @click="compare(result.offset + pageSize)"
            >
              {{ $t(`${key}.next`) }}
            </Button>
          </div>
        </template>
        <Empty v-else :description="$t(`${key}.pending`)" />
      </Card>
    </div>
  </Modal>
</template>
