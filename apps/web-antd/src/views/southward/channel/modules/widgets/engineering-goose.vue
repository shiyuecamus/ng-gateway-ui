<script setup lang="ts">
import type {
  AssetInfo,
  AssetPreview,
  EngineeringStatus,
  GooseMemberType,
  GooseSourcePlan,
  GooseSourceRequest,
  NamespaceScope,
} from '#/api/core/engineering';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  useId,
  watch,
} from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  Empty,
  Input,
  List,
  ListItem,
  Select,
  Table,
  Tag,
  TypographyTitle,
} from 'ant-design-vue';

import {
  getEngineeringStatus,
  planGooseSource,
  previewEngineeringAsset,
} from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import {
  describeAccess,
  describeFailure,
  validNamespaceBasis,
} from './engineering-evidence';
import GoosePublication from './engineering-goose-publication.vue';
import NamespaceEvidence from './engineering-namespace.vue';
import ScopeEvidence from './engineering-scope.vue';
import IedContractEvidence from './ied-contract-evidence.vue';

defineOptions({ name: 'Iec61850GooseSourceModal' });
const key = 'page.southward.channel.engineering.goose';
const formId = useId();
const status = ref<EngineeringStatus | null>(null);
const declaration = ref<null | { asset: AssetInfo; server: number }>(null);
const observationDigest = ref('');
const observation = ref<AssetPreview | null>(null);
const observationServer = ref<number>();
const fields = reactive({
  domain: '',
  control: '',
  accessPoint: '',
  subnetwork: '',
});
const namespaceData = ref<string[]>([]);
const namespaceServices = ref<GooseSourceRequest['namespaces']['services']>([]);
const presenceRules =
  ref<GooseSourceRequest['namespaces']['presenceRules']>('tr9010Edition1');
const presenceRuleOptions = computed(() => [
  { value: 'tr9010Edition1', label: $t(`${key}.presenceRules.tr9010Edition1`) },
  {
    value: 'iec71Amendment2020',
    label: $t(`${key}.presenceRules.iec71Amendment2020`),
  },
]);
const namespaceBasisValid = computed(() =>
  validNamespaceBasis(
    { data: namespaceData.value, services: namespaceServices.value },
    [declaration.value?.asset.digest, observationDigest.value],
  ),
);
const primitiveOptions = computed(() => [
  { value: 'octet6', label: 'Octet6' },
  { value: 'octet16', label: 'Octet16' },
]);
function scopePath(scope: NamespaceScope): string {
  return scope.path
    .map((part, index) => {
      const indices =
        scope.position.kind === 'instance'
          ? scope.position.indices[index]
          : undefined;
      const axes = indices
        ? indices.map((value) => `(${value})`).join('')
        : part.dimensions
            .map(
              (axis) =>
                `[${axis.countReference ? `${axis.countReference.name}=` : ''}${axis.count ?? $t(`${key}.namespaceUnknownCount`)}]`,
            )
            .join('');
      return `${part.name}${axes}`;
    })
    .join('.');
}
function scopeIdentity(scope: NamespaceScope): string {
  return `${scope.position.kind}:${scopePath(scope)}`;
}
function addNamespaceData() {
  if (namespaceData.value.length + namespaceServices.value.length * 2 < 64)
    namespaceData.value.push('');
}
function addNamespaceService() {
  if (namespaceData.value.length + namespaceServices.value.length * 2 <= 62)
    namespaceServices.value.push({
      service: '',
      applicability: '',
      data: '',
      primitives: [],
    });
}
const result = ref<GooseSourcePlan | null>(null);
const publicationPlan = ref<GooseSourcePlan | null>(null);
const loading = ref(false);
const sourceLoading = ref(false);
const error = ref('');
let statusRequest: AbortController | null = null;
let sourceRequest: AbortController | null = null;
let planRequest: AbortController | null = null;
let generation = 0;
let openEpoch = 0;
const ready = computed(
  () =>
    status.value?.gooseSourcePlanAvailable &&
    declaration.value !== null &&
    observation.value?.asset.digest === observationDigest.value &&
    observationServer.value !== undefined &&
    Object.values(fields).every((text) =>
      /^[\u0020-\u007E]{1,255}$/.test(text),
    ) &&
    namespaceBasisValid.value &&
    !sourceLoading.value,
);
const columns = computed(() => [
  { key: 'slot', title: $t(`${key}.slot`), width: 90 },
  { key: 'variable', title: $t(`${key}.variable`) },
  { key: 'type', title: $t(`${key}.type`), width: 260 },
  { key: 'relationship', title: $t(`${key}.relationship`), width: 230 },
]);
const serverOptions = computed(
  () =>
    observation.value?.servers.map((server) => ({
      label: $t(`${key}.serverOption`, {
        index: server.index,
        name: server.iedName ?? $t(`${key}.unknown`),
      }),
      value: server.index,
    })) ?? [],
);

/** Every changed source/selection invalidates both the request and its previous result. */
function clearResult() {
  generation += 1;
  planRequest?.abort();
  planRequest = null;
  result.value = null;
  loading.value = false;
  error.value = '';
}
function clearObservation() {
  sourceRequest?.abort();
  sourceRequest = null;
  observation.value = null;
  observationServer.value = undefined;
  sourceLoading.value = false;
  clearResult();
}
watch(observationDigest, clearObservation, { flush: 'sync' });
watch(
  [
    () => fields.domain,
    () => fields.control,
    () => fields.accessPoint,
    () => fields.subnetwork,
    observationServer,
  ],
  clearResult,
  { flush: 'sync' },
);
watch([namespaceData, namespaceServices], clearResult, {
  deep: true,
  flush: 'sync',
});
watch(presenceRules, clearResult, { flush: 'sync' });
function reset() {
  publicationPlan.value = null;
  statusRequest?.abort();
  statusRequest = null;
  clearObservation();
  status.value = null;
  declaration.value = null;
  observationDigest.value = '';
  namespaceData.value = [];
  namespaceServices.value = [];
  presenceRules.value = 'tr9010Edition1';
  Object.assign(fields, {
    domain: '',
    control: '',
    accessPoint: '',
    subnetwork: '',
  });
}
const [Modal, modalApi] = useVbenModal({
  class: 'w-[1120px] max-w-[96vw]',
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
    const selected = modalApi.getData<{ asset: AssetInfo; server: number }>();
    if (!selected || selected.asset.source.kind !== 'scl') return;
    declaration.value = selected;
    const controller = new AbortController();
    statusRequest = controller;
    try {
      const actual = await getEngineeringStatus(controller.signal);
      if (
        epoch !== openEpoch ||
        statusRequest !== controller ||
        controller.signal.aborted
      )
        return;
      status.value = actual;
      if (!actual.gooseSourcePlanAvailable)
        error.value = $t(`${key}.unavailable`);
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

async function loadObservation() {
  const digest = observationDigest.value;
  if (!/^[a-f\d]{64}$/.test(digest)) return;
  clearObservation();
  const controller = new AbortController();
  sourceRequest = controller;
  sourceLoading.value = true;
  try {
    const preview = await previewEngineeringAsset(
      digest,
      0,
      Math.min(status.value?.maxPageNodes ?? 1, 64),
      controller.signal,
    );
    if (
      sourceRequest !== controller ||
      controller.signal.aborted ||
      observationDigest.value !== digest
    )
      return;
    if (
      preview.asset.digest !== digest ||
      preview.asset.source.kind !== 'mms'
    ) {
      error.value = $t(`${key}.wrongRole`);
      return;
    }
    observation.value = preview;
  } catch (error_) {
    if (sourceRequest === controller && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (sourceRequest === controller) {
      sourceRequest = null;
      sourceLoading.value = false;
    }
  }
}
async function compile() {
  const selected = declaration.value;
  const server = observationServer.value;
  if (!ready.value || !selected || server === undefined) return;
  clearResult();
  const current = generation;
  const controller = new AbortController();
  planRequest = controller;
  loading.value = true;
  try {
    const plan = await planGooseSource(
      {
        namespaces: {
          rules: 'iec71Edition2',
          presenceRules: presenceRules.value,
          data: [...namespaceData.value],
          services: namespaceServices.value.map((binding) => ({
            ...binding,
            primitives: [...binding.primitives],
          })),
        },
        declaration: { digest: selected.asset.digest, server: selected.server },
        observation: { digest: observationDigest.value, server },
        ...fields,
      },
      controller.signal,
    );
    if (
      current === generation &&
      planRequest === controller &&
      !controller.signal.aborted
    ) {
      result.value = plan;
      publicationPlan.value = plan;
    }
  } catch (error_) {
    if (
      current === generation &&
      planRequest === controller &&
      !controller.signal.aborted
    )
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (current === generation && planRequest === controller) {
      planRequest = null;
      loading.value = false;
    }
  }
}
function typeText(value: GooseMemberType): string {
  if (value.kind === 'array') return $t(`${key}.array`, { count: value.count });
  if (value.kind === 'structure')
    return $t(`${key}.structure`, { count: value.components.length });
  const specification = value.specification;
  return [
    specification.name,
    specification.widthBits === null ? '' : `${specification.widthBits} bit`,
    specification.wireLength === null
      ? ''
      : $t(
          `${key}.${specification.wireLength < 0 ? 'maximumLength' : 'fixedLength'}`,
          { count: Math.abs(specification.wireLength) },
        ),
  ]
    .filter(Boolean)
    .join(' / ');
}
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <div class="space-y-5">
      <Alert type="info" :message="$t(`${key}.scope`)" show-icon />
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Card :title="$t(`${key}.selection`)">
        <Descriptions v-if="declaration" :column="1" size="small" class="mb-4">
          <DescriptionsItem :label="$t(`${key}.declaration`)">
            <EvidenceDigest :value="declaration.asset.digest" />
            <Tag class="ml-2">{{ declaration.server }}</Tag>
          </DescriptionsItem>
        </Descriptions>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
            <label :for="`${formId}-observation`" class="mb-1 block">{{
              $t(`${key}.observation`)
            }}</label>
            <div class="flex gap-2">
              <Input
                :id="`${formId}-observation`"
                v-model:value="observationDigest"
                :maxlength="64"
              />
              <Button
                :loading="sourceLoading"
                :disabled="
                  !status?.gooseSourcePlanAvailable ||
                  !/^[a-f\d]{64}$/.test(observationDigest)
                "
                @click="loadObservation"
              >
                {{ $t(`${key}.load`) }}
              </Button>
            </div>
          </div>
          <div>
            <label :for="`${formId}-server`" class="mb-1 block">{{
              $t(`${key}.server`)
            }}</label>
            <Select
              :id="`${formId}-server`"
              v-model:value="observationServer"
              class="w-full"
              :options="serverOptions"
              :disabled="!observation"
            />
          </div>
          <div
            v-for="field in [
              'domain',
              'control',
              'accessPoint',
              'subnetwork',
            ] as const"
            :key="field"
          >
            <label :for="`${formId}-${field}`" class="mb-1 block">{{
              $t(`${key}.${field}`)
            }}</label>
            <Input
              :id="`${formId}-${field}`"
              v-model:value="fields[field]"
              :maxlength="255"
            />
          </div>
        </div>
        <Descriptions
          v-if="observation?.asset.source.kind === 'mms'"
          :column="{ xs: 1, md: 2 }"
          class="mt-4"
          size="small"
        >
          <DescriptionsItem :label="$t(`${key}.channel`)">
            {{ observation.asset.source.channelId }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.revision`)">
            {{ observation.asset.source.configurationRevision }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.association`)">
            {{ observation.asset.source.associationEpoch }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.capturedAt`)">
            {{ observation.asset.source.completedAt }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="
              $t('page.southward.channel.engineering.captureDeclarations')
            "
          >
            <span
              v-if="observation.asset.source.declarations.kind === 'unrecorded'"
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
              / {{ observation.asset.source.declarations.snapshotDigest }}
            </span>
          </DescriptionsItem>
        </Descriptions>
        <fieldset class="mt-5 space-y-3">
          <legend class="text-base font-medium">
            {{ $t(`${key}.namespaceBasis`) }}
          </legend>
          <p class="text-sm">{{ $t(`${key}.namespaceBasisHint`) }}</p>
          <p class="text-sm">{{ $t(`${key}.namespaceRulesBasis`) }}</p>
          <div class="space-y-2">
            <label :for="`${formId}-presence-rules`" class="block font-medium">
              {{ $t(`${key}.presenceRuleLabel`) }}
            </label>
            <Select
              :id="`${formId}-presence-rules`"
              v-model:value="presenceRules"
              :options="presenceRuleOptions"
              class="w-full"
            />
            <p class="text-sm leading-6 text-muted-foreground">
              {{ $t(`${key}.presenceRuleHint`) }}
            </p>
          </div>
          <div
            v-for="(_digest, index) in namespaceData"
            :key="index"
            class="flex items-end gap-2"
          >
            <div class="flex-1">
              <label :for="`${formId}-ns-data-${index}`" class="mb-1 block">{{
                $t(`${key}.namespaceData`, { index: index + 1 })
              }}</label>
              <Input
                :id="`${formId}-ns-data-${index}`"
                v-model:value="namespaceData[index]"
                :maxlength="64"
              />
            </div>
            <Button
              :aria-label="
                $t(`${key}.removeNamespaceData`, { index: index + 1 })
              "
              @click="namespaceData.splice(index, 1)"
            >
              {{ $t(`${key}.remove`) }}
            </Button>
          </div>
          <div
            v-for="(binding, index) in namespaceServices"
            :key="index"
            class="rounded border p-3"
          >
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div
                v-for="field in ['service', 'applicability'] as const"
                :key="field"
              >
                <label
                  :for="`${formId}-ns-${field}-${index}`"
                  class="mb-1 block"
                >
                  {{
                    $t(
                      `${key}.namespace${field === 'service' ? 'Service' : 'Applicability'}`,
                      { index: index + 1 },
                    )
                  }}
                </label>
                <Input
                  :id="`${formId}-ns-${field}-${index}`"
                  v-model:value="binding[field]"
                  :maxlength="64"
                />
              </div>
              <div>
                <label :for="`${formId}-ns-target-${index}`" class="mb-1 block">
                  {{ $t(`${key}.namespaceTarget`) }}
                </label>
                <Select
                  :id="`${formId}-ns-target-${index}`"
                  v-model:value="binding.data"
                  class="w-full"
                  :options="
                    namespaceData
                      .filter((digest) => /^[a-f\d]{64}$/.test(digest))
                      .map((digest) => ({ label: digest, value: digest }))
                  "
                />
              </div>
              <div>
                <label
                  :for="`${formId}-ns-primitives-${index}`"
                  class="mb-1 block"
                >
                  {{ $t(`${key}.namespacePrimitives`) }}
                </label>
                <Select
                  :id="`${formId}-ns-primitives-${index}`"
                  v-model:value="binding.primitives"
                  mode="multiple"
                  class="w-full"
                  :options="primitiveOptions"
                />
              </div>
            </div>
            <Button
              class="mt-3"
              :aria-label="
                $t(`${key}.removeNamespaceService`, { index: index + 1 })
              "
              @click="namespaceServices.splice(index, 1)"
            >
              {{ $t(`${key}.remove`) }}
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              :disabled="
                namespaceData.length + namespaceServices.length * 2 >= 64
              "
              @click="addNamespaceData"
            >
              {{ $t(`${key}.addNamespaceData`) }}
            </Button>
            <Button
              :disabled="
                namespaceData.length === 0 ||
                namespaceData.length + namespaceServices.length * 2 > 62
              "
              @click="addNamespaceService"
            >
              {{ $t(`${key}.addNamespaceService`) }}
            </Button>
          </div>
          <Alert
            v-if="!namespaceBasisValid"
            type="warning"
            :message="$t(`${key}.invalidNamespaceBasis`)"
            show-icon
          />
        </fieldset>
        <Button
          type="primary"
          class="mt-4"
          :loading="loading"
          :disabled="!ready"
          @click="compile"
        >
          {{ $t(`${key}.compile`) }}
        </Button>
      </Card>
      <Card
        :title="$t(`${key}.result`)"
        role="region"
        :aria-label="$t(`${key}.result`)"
        :aria-busy="loading"
      >
        <template v-if="result">
          <Descriptions :column="{ xs: 1, md: 2 }" size="small">
            <DescriptionsItem :label="$t(`${key}.dataSet`)">
              {{ result.dataSet }}
            </DescriptionsItem>
            <DescriptionsItem label="GoID">
              {{ result.gooseId }}
            </DescriptionsItem>
            <DescriptionsItem label="ConfRev">
              {{ result.configurationRevision }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t(`${key}.destinationMac`)">
              <span data-testid="goose-network-destination">
                {{
                  result.network.destination
                    ?.map((octet) =>
                      octet.toString(16).padStart(2, '0').toUpperCase(),
                    )
                    .join('-') ?? $t(`${key}.unknown`)
                }}
              </span>
            </DescriptionsItem>
            <DescriptionsItem label="Ethernet APPID">
              <span data-testid="goose-network-appid">
                {{
                  result.network.appId === null
                    ? $t(`${key}.unknown`)
                    : `0x${result.network.appId.toString(16).padStart(4, '0').toUpperCase()}`
                }}
              </span>
            </DescriptionsItem>
            <DescriptionsItem label="VLAN VID / PCP">
              <span data-testid="goose-network-vlan">
                {{ result.network.vlanId ?? $t(`${key}.unknown`) }} /
                {{ result.network.vlanPriority ?? $t(`${key}.unknown`) }}
              </span>
            </DescriptionsItem>
            <DescriptionsItem :label="$t(`${key}.security`)">
              {{ result.security ?? $t(`${key}.unknown`) }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t(`${key}.minimumTime`)">
              {{ result.minimumTimeMs ?? $t(`${key}.unknown`) }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t(`${key}.maximumTime`)">
              {{ result.maximumTimeMs ?? $t(`${key}.unknown`) }}
            </DescriptionsItem>
          </Descriptions>
          <div
            class="my-4 space-y-3"
            role="region"
            :aria-label="$t(`${key}.capturedContract`)"
          >
            <TypographyTitle :level="5" class="!mb-3">
              {{ $t(`${key}.capturedContract`) }}
            </TypographyTitle>
            <Alert
              :type="
                result.capturedDomainApplicability === 'notDeclared'
                  ? 'error'
                  : 'info'
              "
              :message="
                $t(
                  `${key}.capturedDomain.${result.capturedDomainApplicability}`,
                )
              "
              show-icon
            />
            <template v-if="result.capturedDeclarations.kind === 'published'">
              <p class="text-sm">
                {{
                  $t(`${key}.capturedRevision`, {
                    revision:
                      result.capturedDeclarations.snapshot.publication
                        .desiredRevision,
                  })
                }}
              </p>
              <IedContractEvidence
                :contract="result.capturedDeclarations.snapshot.contract"
              />
            </template>
          </div>
          <div class="engineering-namespace-results my-4 space-y-3">
            <TypographyTitle :level="5" class="!mb-3">
              {{ $t(`${key}.namespaceResult`) }}
            </TypographyTitle>
            <Alert
              type="info"
              :message="$t(`${key}.namespaceRuntimePending`)"
              show-icon
            />
            <Alert
              type="info"
              show-icon
              :message="
                $t(
                  `${key}.namespaceProfileStates.${result.namespaces.profileApplicability.status}`,
                )
              "
            />
            <p
              v-if="'edition' in result.namespaces.profileApplicability"
              class="text-sm"
            >
              {{
                `IEC 61850-7-1 Ed${result.namespaces.profileApplicability.edition.major}.${result.namespaces.profileApplicability.edition.amendment}`
              }}
            </p>
            <Alert
              type="info"
              show-icon
              :message="$t(`${key}.presenceApplicability`)"
              :description="
                $t(
                  `${key}.presenceProfileStates.${result.namespaces.presenceApplicability.status}`,
                )
              "
            />
            <p
              v-if="'edition' in result.namespaces.presenceApplicability"
              class="text-sm"
            >
              {{
                `IEC 61850-7-2 Ed${result.namespaces.presenceApplicability.edition.major}.${result.namespaces.presenceApplicability.edition.amendment}`
              }}
            </p>
            <Collapse :bordered="false">
              <CollapsePanel
                key="originals"
                :header="$t(`${key}.namespaceOriginals`)"
              >
                <List :data-source="result.namespaces.originals" size="small">
                  <template #renderItem="{ item: original }">
                    <ListItem>
                      <Descriptions :column="1" size="small">
                        <DescriptionsItem
                          :label="
                            original.source.kind === 'nsd'
                              ? $t(
                                  `page.southward.channel.engineering.nsd.${original.source.identity.role}Role`,
                                )
                              : original.source.kind
                          "
                        >
                          <EvidenceDigest :value="original.digest" />
                        </DescriptionsItem>
                      </Descriptions>
                    </ListItem>
                  </template>
                </List>
              </CollapsePanel>
            </Collapse>
            <TypographyTitle :level="5" class="!mb-3">
              {{ $t(`${key}.completeSourceTypes`) }}
            </TypographyTitle>
            <Table
              data-testid="goose-complete-source-types"
              :data-source="result.namespaces.actualTypes"
              :columns="[
                { key: 'owner', title: $t(`${key}.variable`) },
                { key: 'relationship', title: $t(`${key}.relationship`) },
              ]"
              :row-key="
                (
                  record: GooseSourcePlan['namespaces']['actualTypes'][number],
                ) =>
                  `${record.logicalNode}$${record.functionalConstraint}$${record.object}`
              "
              size="small"
              :pagination="{ pageSize: 16, showSizeChanger: false }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'owner'">
                  {{ record.logicalNode }}${{ record.functionalConstraint }}${{
                    record.object
                  }}
                </template>
                <template v-else>
                  <Tag
                    :color="
                      record.relationship.status === 'conflict'
                        ? 'red'
                        : record.relationship.status === 'agreement'
                          ? 'blue'
                          : 'orange'
                    "
                  >
                    {{
                      $t(
                        `page.southward.channel.engineering.comparison.statuses.${record.relationship.status}`,
                      )
                    }}
                  </Tag>
                  {{
                    $t(`${key}.relationshipCounts`, {
                      checked: record.relationship.checked,
                      unknown: record.relationship.unknown,
                    })
                  }}
                </template>
              </template>
            </Table>
            <List
              v-if="result.namespaces.logicalNodes.length > 0"
              data-testid="goose-namespace-logical-nodes"
              :data-source="result.namespaces.logicalNodes"
              :pagination="{ pageSize: 16, showSizeChanger: false }"
            >
              <template #renderItem="{ item: record }">
                <ListItem class="min-w-0 !border-0 !p-0 !pb-4">
                  <Collapse class="w-full min-w-0" :bordered="false">
                    <CollapsePanel
                      :key="record.logicalNode"
                      :header="`${record.domain}/${record.logicalNode}`"
                    >
                      <template #extra>
                        <Tag
                          :color="
                            record.conflict
                              ? 'red'
                              : record.unresolved
                                ? 'orange'
                                : 'blue'
                          "
                        >
                          {{
                            $t(
                              `${key}.${record.conflict ? 'namespaceConflict' : record.unresolved ? 'namespaceUnresolved' : 'namespaceAgreement'}`,
                            )
                          }}
                        </Tag>
                      </template>
                      <Descriptions :column="1" size="small" class="mb-4">
                        <DescriptionsItem :label="$t(`${key}.objects`)">
                          {{ record.objectCount }}
                        </DescriptionsItem>
                      </Descriptions>
                      <Card
                        v-for="object in record.objects"
                        :key="object.name"
                        class="mb-5 min-w-0"
                        size="small"
                        :title="`${record.domain}/${record.logicalNode}/${object.name}`"
                        data-testid="namespace-object-evidence"
                      >
                        <NamespaceEvidence :evidence="object" />
                        <Collapse
                          :key="generation"
                          class="mt-4"
                          :bordered="false"
                        >
                          <CollapsePanel
                            key="scopes"
                            :header="`${$t(`${key}.namespaceScopes`)} (${object.scopes.length})`"
                          >
                            <List
                              :data-source="object.scopes"
                              :pagination="{
                                pageSize: 10,
                                showSizeChanger: false,
                              }"
                              data-testid="namespace-scope-cards"
                            >
                              <template #renderItem="{ item: scope }">
                                <ListItem class="min-w-0 !border-0 !p-0 !pb-3">
                                  <Collapse
                                    class="w-full min-w-0"
                                    :bordered="false"
                                  >
                                    <CollapsePanel
                                      :key="scopeIdentity(scope)"
                                      :header="scopePath(scope)"
                                    >
                                      <template #extra>
                                        <Tag
                                          :color="
                                            scope.conflict
                                              ? 'red'
                                              : scope.unresolved
                                                ? 'orange'
                                                : 'blue'
                                          "
                                        >
                                          {{
                                            $t(
                                              `${key}.${scope.conflict ? 'namespaceConflict' : scope.unresolved ? 'namespaceUnresolved' : 'namespaceAgreement'}`,
                                            )
                                          }}
                                        </Tag>
                                      </template>
                                      <Descriptions
                                        :column="1"
                                        size="small"
                                        class="mb-4"
                                      >
                                        <DescriptionsItem
                                          :label="
                                            $t(`${key}.namespaceScopePosition`)
                                          "
                                        >
                                          {{
                                            scope.position.kind === 'template'
                                              ? $t(`${key}.namespaceTemplate`, {
                                                  count:
                                                    scope.position
                                                      .remainingInstances ??
                                                    $t(
                                                      `${key}.namespaceUnknownCount`,
                                                    ),
                                                })
                                              : $t(
                                                  `${key}.${scope.position.boundsKnown ? 'namespaceInstance' : 'namespaceInstanceBoundsUnknown'}`,
                                                )
                                          }}
                                        </DescriptionsItem>
                                      </Descriptions>
                                      <ScopeEvidence :scope="scope" />
                                    </CollapsePanel>
                                  </Collapse>
                                </ListItem>
                              </template>
                            </List>
                          </CollapsePanel>
                        </Collapse>
                      </Card>
                    </CollapsePanel>
                  </Collapse>
                </ListItem>
              </template>
            </List>
            <Empty v-else :description="$t(`${key}.namespaceNotSelected`)" />
          </div>
          <div class="my-4 flex flex-wrap gap-2">
            <Tag
              v-for="requirement in result.unresolvedRequirements"
              :key="requirement"
              color="orange"
            >
              {{ $t(`${key}.requirements.${requirement}`) }}
            </Tag>
          </div>
          <div class="mb-4 space-y-1 text-xs">
            <p>{{ $t(`${key}.networkScope`) }}</p>
            <div
              v-for="(parameter, index) in result.addressParameters"
              :key="index"
            >
              {{ parameter.kind }}: {{ parameter.value }}
            </div>
          </div>
          <Table
            :columns="columns"
            :data-source="result.members"
            data-testid="goose-source-members"
            row-key="memberIndex"
            size="small"
            :pagination="{ pageSize: 16, showSizeChanger: false }"
            :scroll="{ x: 700 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'slot'">
                {{ record.memberIndex }}
              </template>
              <template v-else-if="column.key === 'variable'">
                <div class="break-all">
                  {{
                    record.variable.name.kind === 'domain'
                      ? `${record.variable.name.domain}/${record.variable.name.item}`
                      : record.variable.name.item
                  }}
                </div>
                <div
                  v-if="record.variable.alternate_access"
                  class="break-all text-xs"
                >
                  {{ describeAccess(record.variable.alternate_access) }}
                </div>
              </template>
              <template v-else-if="column.key === 'relationship'">
                <Tag
                  :color="
                    record.typeRelationship.status === 'agreement'
                      ? 'blue'
                      : 'orange'
                  "
                >
                  {{ $t(`${key}.${record.typeRelationship.status}`) }}
                </Tag>
                <div class="text-xs">
                  {{
                    $t(`${key}.relationshipCounts`, {
                      checked: record.typeRelationship.checked,
                      unknown: record.typeRelationship.unknown,
                    })
                  }}
                </div>
              </template>
              <template v-else>{{ typeText(record.valueType) }}</template>
            </template>
            <template #expandedRowRender="{ record }">
              <div
                data-testid="goose-member-type"
                class="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs"
                v-text="JSON.stringify(record.valueType, null, 2)"
              ></div>
            </template>
          </Table>
        </template>
        <Empty v-else :description="$t(`${key}.pending`)" />
      </Card>
      <GoosePublication
        v-if="publicationPlan"
        :key="declaration?.asset.digest"
        :plan="publicationPlan"
        :selection-current="result !== null"
      />
    </div>
  </Modal>
</template>

<style scoped>
@media (max-width: 767px) {
  .engineering-namespace-results :deep(.ant-collapse-content-box) {
    padding: 8px 0;
  }

  .engineering-namespace-results :deep(.ant-card-body) {
    padding: 12px 8px;
  }

  .engineering-namespace-results :deep(.ant-collapse-header) {
    padding: 12px 8px;
  }
}
</style>
