<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type {
  QuotaRefusal,
  QuotaResource,
  QuotaUsage,
} from '#/api/core/resource-quota';

import { computed, ref, useId, watch } from 'vue';

import {
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Select,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  amount,
  authorizationPolicyRefusals,
  capabilityRefusals,
  engineeringAssetRefusals,
  engineeringComparisonRefusals,
  engineeringMappingRefusals,
  engineeringPageRefusals,
  engineeringPublicationRefusals,
  engineeringValidatorRefusals,
  httpIngressRefusals,
  loginAdmissionRefusals,
  quotaText,
  sessionAdmissionRefusals,
  websocketAdmissionRefusals,
  websocketTrafficRefusals,
  webTemplateRefusals,
  webTlsRefusals,
  webUiResponseRefusals,
  webWorkbookRefusals,
} from './presentation';

const props = defineProps<{
  compact: boolean;
  resource: QuotaResource;
  running?: QuotaUsage;
}>();

type RefusalRow = QuotaRefusal & { rowKey: number };
const selectedReason = ref<string>();
const reasonPickerId = useId();
const extension = computed(() => {
  const sample = props.running;
  return sample && 'recentRefusals' in sample ? sample : undefined;
});
const eventRefusals = computed(() => {
  const sample = props.running;
  if (!sample) return undefined;
  if ('validatorReady' in sample) return engineeringValidatorRefusals(sample);
  if ('maxPublications' in sample)
    return engineeringPublicationRefusals(sample);
  if ('preparationWorkBytes' in sample)
    return [
      { key: 'web_ui_workspace', value: sample.refusedRetainedReservations },
    ];
  if ('observations' in sample) return capabilityRefusals(sample);
  if ('parsedWorkbooks' in sample) return webWorkbookRefusals(sample);
  if ('capacityCeiling' in sample) return webTemplateRefusals(sample);
  if ('footprint' in sample || 'workBacking' in sample)
    return webTlsRefusals(sample);
  if ('minAssetRequestPathBytes' in sample)
    return webUiResponseRefusals(sample);
  if ('activeAcknowledgements' in sample)
    return websocketTrafficRefusals(sample);
  if ('ticketTtlMs' in sample) return websocketAdmissionRefusals(sample);
  if ('refusedGraphWrite' in sample) return authorizationPolicyRefusals(sample);
  if ('maxSessionsPerUser' in sample) return sessionAdmissionRefusals(sample);
  if ('globalTokensAvailable' in sample) return loginAdmissionRefusals(sample);
  if ('nativeWork' in sample) return httpIngressRefusals(sample);
  if ('crypto' in sample) {
    return [
      { key: 'auth_request_count', value: sample.refusedRequests },
      { key: 'auth_crypto_deadline', value: sample.refusedCryptoWaits },
    ];
  }
  if ('cachedModels' in sample) {
    if (props.resource === 'engineering-assets')
      return engineeringAssetRefusals(sample);
    if (props.resource === 'engineering-mapping')
      return engineeringMappingRefusals(sample);
    if (props.resource === 'engineering-browse')
      return engineeringPageRefusals(sample);
    if (props.resource === 'engineering-comparison')
      return engineeringComparisonRefusals(sample);
    if (props.resource === 'engineering-source') {
      return sample.refusedNsdSourceWork === undefined
        ? undefined
        : [
            {
              key: 'engineering_nsd_source_work',
              value: sample.refusedNsdSourceWork,
            },
          ];
    }
    return [
      { key: 'engineering_jobs', value: sample.refusedJobs },
      { key: 'engineering_model_pool', value: sample.refusedModelPool },
      { key: 'engineering_model_envelope', value: sample.refusedModelEnvelope },
    ];
  }
  if ('loads' in sample) {
    return [
      { key: 'native_image_count', value: sample.refusedCount },
      { key: 'native_aggregate_bytes', value: sample.refusedTotalBytes },
      { key: 'native_image_bytes', value: sample.refusedImageBytes },
      { key: 'native_load_slots', value: sample.refusedLoads },
    ];
  }
  if ('preflight' in sample) {
    return [
      { key: 'control_preflight_count', value: sample.refusedPreflightCount },
      { key: 'control_preflight_bytes', value: sample.refusedPreflightBytes },
      { key: 'control_execution_count', value: sample.refusedExecutionCount },
      { key: 'control_execution_bytes', value: sample.refusedExecutionBytes },
    ];
  }
  if ('interfaces' in sample) {
    return [
      { key: 'capture_occupied', value: sample.refusedOccupiedInterface },
      { key: 'capture_interface_count', value: sample.refusedInterfaceCount },
      { key: 'capture_native_bytes', value: sample.refusedCaptureBytes },
      { key: 'capture_runtime_bytes', value: sample.refusedRuntimeBytes },
    ];
  }
  if ('compilations' in sample) {
    return [
      { key: 'southward_material_compile', value: sample.refusedCompilation },
      { key: 'southward_material_verify', value: sample.refusedVerification },
      { key: 'southward_material_bytes', value: sample.refusedBytes },
    ];
  }
  if ('retained' in sample) {
    return [
      {
        key: 'southward_gateway_reservation',
        value: sample.refusedGatewayReservations,
      },
      {
        key: 'southward_channel_reservation',
        value: sample.refusedChannelReservations,
      },
    ];
  }
  if ('refusedPayload' in sample) {
    if ('bytes' in sample) {
      return [
        { key: 'southward_config_count', value: sample.refusedPending },
        { key: 'southward_config_bytes', value: sample.refusedBytes },
        { key: 'southward_config_payload', value: sample.refusedPayload },
      ];
    }
    return [
      { key: 'app_publication_count', value: sample.refusedPending },
      { key: 'app_configuration_payload', value: sample.refusedPayload },
    ];
  }
  if ('replacing' in sample)
    return [{ key: 'event_queue_drain', value: sample.refusedDrain }];
  if (!('execution' in sample)) return undefined;
  const reasons = [
    { key: 'event_count_limit', value: sample.refusedPending },
    { key: 'event_aggregate_bytes', value: sample.refusedBytes },
    { key: 'event_encoding', value: sample.refusedEncoding },
    { key: 'event_json_work', value: sample.refusedJsonWork },
  ];
  if (sample.refusedQueueDrain !== undefined) {
    reasons.push({ key: 'event_queue_drain', value: sample.refusedQueueDrain });
  }
  return reasons;
});
const allRows = computed<RefusalRow[]>(() =>
  (extension.value?.recentRefusals ?? [])
    .map((row, rowKey) => ({ ...row, rowKey }))
    .toReversed(),
);
const reasons = computed(() =>
  [...new Set(allRows.value.map((row) => row.reason))].map((value) => ({
    label: quotaText(`reasons.${value}`),
    value,
  })),
);
watch(reasons, (current) => {
  if (
    selectedReason.value &&
    !current.some(({ value }) => value === selectedReason.value)
  ) {
    selectedReason.value = undefined;
  }
});
const rows = computed(() =>
  selectedReason.value
    ? allRows.value.filter((row) => row.reason === selectedReason.value)
    : allRows.value,
);
const columns = computed<TableColumnsType<RefusalRow>>(() => [
  { key: 'reason', title: quotaText('reason'), width: '26%' },
  { key: 'request', title: quotaText('request'), width: '12%' },
  { key: 'limit', title: quotaText('limit'), width: '12%' },
  { key: 'used', title: quotaText('used'), width: '12%' },
  { key: 'occurrences', title: quotaText('occurrences'), width: '10%' },
  { key: 'revision', title: quotaText('revision'), width: '12%' },
  { key: 'age', title: quotaText('lastObserved'), width: '16%' },
]);

function observedAgo(lastSeenMs: string) {
  if (!extension.value) return quotaText('unknown');
  const age = BigInt(extension.value.ownerUptimeMs) - BigInt(lastSeenMs);
  return age < 0n
    ? quotaText('unknown')
    : quotaText('observedAgo', { age: amount(age.toString()) });
}
</script>

<template>
  <Card
    v-if="eventRefusals"
    :title="quotaText('refusals')"
    class="min-w-0"
    size="small"
  >
    <TypographyText type="secondary">
      {{
        quotaText(
          running && 'nativeWork' in running
            ? 'httpRefusalsScope'
            : 'sinceOwnerStarted',
        )
      }}
    </TypographyText>
    <Descriptions
      class="mt-3"
      size="small"
      :column="{ xs: 1, sm: 2 }"
      :colon="false"
      bordered
    >
      <DescriptionsItem
        v-for="item in eventRefusals"
        :key="item.key"
        :label="quotaText(`reasons.${item.key}`)"
      >
        <Tag
          :color="item.value === '0' ? undefined : 'gold'"
          class="quota-tag !m-0 tabular-nums"
        >
          {{ amount(item.value) }}
        </Tag>
      </DescriptionsItem>
    </Descriptions>
  </Card>
  <Card v-else :title="quotaText('refusals')" class="min-w-0" size="small">
    <div
      v-if="extension"
      class="mb-3 flex flex-wrap items-center justify-between gap-3"
    >
      <div class="flex flex-wrap gap-1.5">
        <Tag class="quota-tag !m-0" color="gold">
          {{ quotaText('refusalsTotal') }}
          {{ amount(extension.refusalsTotal) }}
        </Tag>
        <Tag class="quota-tag !m-0">
          {{ quotaText('detailsEvicted') }}
          {{ amount(extension.refusalsEvicted) }}
        </Tag>
      </div>
      <template v-if="allRows.length > 0">
        <label :for="reasonPickerId" class="sr-only">
          {{ quotaText('filterRefusals') }}
        </label>
        <Select
          :id="reasonPickerId"
          v-model:value="selectedReason"
          :placeholder="quotaText('allReasons')"
          :options="reasons"
          allow-clear
          class="w-full sm:w-48"
        />
      </template>
    </div>
    <Empty
      v-if="!running || rows.length === 0"
      :description="quotaText(running ? 'noRefusals' : 'usageUnavailable')"
    />
    <ul v-else-if="compact" class="m-0 list-none divide-y divide-border p-0">
      <li v-for="item in rows" :key="item.rowKey" class="min-w-0 py-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Tag class="quota-tag !m-0" color="gold">
            {{ quotaText(`reasons.${item.reason}`) }}
          </Tag>
          <span class="text-xs text-muted-foreground">{{
            observedAgo(item.lastSeenMs)
          }}</span>
        </div>
        <Descriptions
          :colon="false"
          class="mt-2"
          :column="3"
          layout="vertical"
          size="small"
        >
          <DescriptionsItem :label="quotaText('request')">
            {{ amount(item.requested) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('limit')">
            {{ amount(item.limit) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('used')">
            {{ amount(item.used) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('occurrences')">
            {{ amount(item.occurrences) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('revision')">
            {{ amount(item.policyRevision) }}
          </DescriptionsItem>
        </Descriptions>
      </li>
    </ul>
    <Table
      v-else
      :aria-label="quotaText('refusals')"
      :columns="columns"
      :data-source="rows"
      :pagination="
        rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false
      "
      row-key="rowKey"
      table-layout="fixed"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="column.key === 'reason'" class="quota-tag !m-0" color="gold">
          {{ quotaText(`reasons.${record.reason}`) }}
        </Tag>
        <span v-else-if="column.key === 'request'" class="tabular-nums">{{
          amount(record.requested)
        }}</span>
        <span v-else-if="column.key === 'limit'" class="tabular-nums">{{
          amount(record.limit)
        }}</span>
        <span v-else-if="column.key === 'used'" class="tabular-nums">{{
          amount(record.used)
        }}</span>
        <span v-else-if="column.key === 'occurrences'" class="tabular-nums">{{
          amount(record.occurrences)
        }}</span>
        <span v-else-if="column.key === 'revision'" class="tabular-nums">{{
          amount(record.policyRevision)
        }}</span>
        <span v-else-if="column.key === 'age'" class="tabular-nums">{{
          observedAgo(record.lastSeenMs)
        }}</span>
      </template>
    </Table>
  </Card>
</template>
