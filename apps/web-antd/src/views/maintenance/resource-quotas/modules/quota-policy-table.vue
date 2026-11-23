<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { QuotaFieldComparison } from './use-quota-console';

import type {
  QuotaDescriptor,
  QuotaField,
  QuotaResource,
  QuotaUsage,
} from '#/api/core/resource-quota';

import { computed, useId } from 'vue';

import { LockKeyhole } from '@vben/icons';

import {
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  RadioGroup,
  Select,
  Skeleton,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  amount,
  effective,
  fileAmount,
  pillForEffect,
  pillForSource,
  quotaFieldName,
  quotaText,
} from './presentation';
import { useWorkbookQuotaFields } from './use-workbook-quota-fields';

const props = defineProps<{
  compact: boolean;
  comparisons?: ReadonlyMap<QuotaField, QuotaFieldComparison>;
  fields: QuotaDescriptor[];
  loaded: boolean;
  resource: QuotaResource;
  running?: QuotaUsage;
}>();
const filter = defineModel<'all' | 'differences'>('filter', { required: true });

const filterId = useId();
const groupsId = useId();
const {
  group,
  options,
  visibleFields: groupedFields,
} = useWorkbookQuotaFields(
  () => props.resource,
  () => props.fields,
);

const filterOptions = computed(() => [
  {
    label: quotaText(
      options.value.length > 1 ? 'policyByGroup' : 'policyAllFields',
    ),
    value: 'all',
  },
  { label: quotaText('policyOnlyDifferences'), value: 'differences' },
]);
const comparisonBadges = {
  different: { color: 'gold', label: 'policyDifferent' },
  'restart-pending': { color: 'blue', label: 'pendingRestartLabel' },
  unconfirmed: { color: 'default', label: 'policyLimitUnconfirmed' },
} satisfies Record<QuotaFieldComparison, { color: string; label: string }>;
const rows = computed(() => {
  const differences = filter.value === 'differences';
  const fields = differences ? props.fields : groupedFields.value;
  return fields.flatMap((field) => {
    const state = props.comparisons?.get(field.key);
    if (differences && (!state || state === 'unconfirmed')) return [];
    return [{ ...field, comparison: state && comparisonBadges[state] }];
  });
});

const columns = computed<TableColumnsType<QuotaDescriptor>>(() => [
  { key: 'field', title: quotaText('field'), width: '23%' },
  {
    align: 'right',
    className: 'quota-policy-runtime',
    key: 'effective',
    title: quotaText('effective'),
    width: '13%',
  },
  { align: 'right', key: 'desired', title: quotaText('desired'), width: '13%' },
  {
    align: 'right',
    key: 'persisted',
    title: quotaText('persisted'),
    width: '13%',
  },
  { key: 'source', title: quotaText('source'), width: '21%' },
  { key: 'effect', title: quotaText('effect'), width: '17%' },
]);
</script>

<template>
  <Card
    class="quota-policy-card min-w-0"
    size="small"
    :title="quotaText('configuration')"
  >
    <div
      v-if="loaded && fields.length > 0"
      class="mb-4 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <RadioGroup
          v-model:value="filter"
          :name="filterId"
          :options="filterOptions"
          :aria-label="quotaText('policyFilter')"
          option-type="button"
          role="radiogroup"
          class="quota-policy-filter"
        />
        <Select
          v-if="options.length > 1 && filter === 'all'"
          :id="groupsId"
          v-model:value="group"
          :aria-label="quotaText('workbookPolicyGroup')"
          :options="options"
          class="min-w-0 max-w-full sm:w-56"
        />
      </div>
      <Tag class="quota-tag !m-0" color="geekblue">
        <span class="tabular-nums" role="status">
          {{ quotaText('policyFieldCount', { count: rows.length }) }}
        </span>
      </Tag>
    </div>
    <Skeleton v-if="!loaded" active :paragraph="{ rows: 3 }" />
    <Empty
      v-else-if="fields.length === 0"
      :description="quotaText('configUnavailable')"
    />
    <Empty
      v-else-if="rows.length === 0"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      class="quota-policy-empty"
      :description="
        quotaText(comparisons ? 'policyNoDifferences' : 'policyComparisonStale')
      "
    />
    <ul
      v-else-if="compact"
      class="quota-policies m-0 grid min-w-0 list-none gap-2.5 p-0"
    >
      <li
        v-for="field in rows"
        :key="field.key"
        class="quota-policy-item min-w-0"
      >
        <div
          class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5"
        >
          <div>
            <h3 class="m-0 font-medium">
              {{ quotaFieldName(resource, field.key) }}
            </h3>
            <span class="text-xs text-muted-foreground">{{
              quotaText(`units.${field.unit}`)
            }}</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <Tag
              v-if="field.comparison"
              :color="field.comparison.color"
              class="quota-tag !m-0"
            >
              {{ quotaText(field.comparison.label) }}
            </Tag>
            <Tag class="quota-tag !m-0" :color="pillForSource(field.source)">
              {{ quotaText(`sources.${field.source}`) }}
            </Tag>
            <Tag v-if="!field.writable" class="quota-tag !m-0">
              <span class="inline-flex items-center gap-1">
                <LockKeyhole :size="11" aria-hidden="true" />
                {{ quotaText('readOnly') }}
              </span>
            </Tag>
            <Tag
              class="quota-tag !m-0"
              :color="pillForEffect(field.effectMode)"
            >
              {{ quotaText(`modes.${field.effectMode}`) }}
            </Tag>
          </div>
        </div>
        <Descriptions
          :colon="false"
          class="quota-policy-values"
          :column="3"
          layout="vertical"
          size="small"
        >
          <DescriptionsItem :label="quotaText('effective')">
            <span class="quota-policy-current font-semibold tabular-nums">
              {{ amount(effective(running, field.key)) }}
            </span>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('desired')">
            <span class="tabular-nums">{{ amount(field.desired) }}</span>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('persisted')">
            {{ fileAmount(field.persisted, field.fileValuePresent) }}
          </DescriptionsItem>
        </Descriptions>
        <TypographyText
          v-if="field.envKey"
          class="quota-env"
          type="secondary"
          :copyable="{ text: field.envKey }"
        >
          <code :title="field.envKey">{{ field.envKey }}</code>
        </TypographyText>
      </li>
    </ul>
    <Table
      v-else
      :aria-label="quotaText('configuration')"
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      size="small"
      row-key="key"
      table-layout="fixed"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'field'">
          <span class="block font-medium">{{
            quotaFieldName(resource, record.key)
          }}</span>
          <span class="text-xs text-muted-foreground">{{
            quotaText(`units.${record.unit}`)
          }}</span>
          <Tag
            v-if="record.comparison"
            :color="record.comparison.color"
            class="quota-tag !mx-0 !mb-0 !mt-1 block w-fit max-w-full whitespace-normal"
          >
            {{ quotaText(record.comparison.label) }}
          </Tag>
        </template>
        <span
          v-else-if="column.key === 'effective'"
          class="quota-policy-current font-semibold tabular-nums"
        >
          {{ amount(effective(running, record.key)) }}
        </span>
        <span v-else-if="column.key === 'desired'" class="tabular-nums">{{
          amount(record.desired)
        }}</span>
        <span
          v-else-if="column.key === 'persisted'"
          class="tabular-nums"
          :class="record.persisted == null && 'text-muted-foreground'"
        >
          {{ fileAmount(record.persisted, record.fileValuePresent) }}
        </span>
        <template v-else-if="column.key === 'source'">
          <Tag class="quota-tag !m-0" :color="pillForSource(record.source)">
            {{ quotaText(`sources.${record.source}`) }}
          </Tag>
          <Tag v-if="!record.writable" class="quota-tag !mr-0 ml-1">
            <span class="inline-flex items-center gap-1">
              <LockKeyhole :size="11" aria-hidden="true" />
              {{ quotaText('readOnly') }}
            </span>
          </Tag>
          <TypographyText
            v-if="record.envKey"
            class="quota-env mt-1"
            type="secondary"
            :copyable="{ text: record.envKey }"
          >
            <code :title="record.envKey">{{ record.envKey }}</code>
          </TypographyText>
        </template>
        <Tag
          v-else-if="column.key === 'effect'"
          class="quota-tag !m-0"
          :color="pillForEffect(record.effectMode)"
        >
          {{ quotaText(`modes.${record.effectMode}`) }}
        </Tag>
      </template>
    </Table>
  </Card>
</template>

<style scoped>
.quota-policy-card {
  --quota-current-accent: #3472c7;

  border-radius: 14px;
}

:global(.dark .quota-policy-card) {
  --quota-current-accent: #a4cbff;
}

.quota-policy-card :deep(.quota-policy-runtime) {
  background: color-mix(
    in srgb,
    var(--quota-current-accent) 6%,
    hsl(var(--card))
  );
}

.quota-policy-current {
  color: var(--quota-current-accent);
}

.quota-policy-card :deep(.quota-tag) {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quota-policy-values :deep(.ant-descriptions-item-label),
.quota-policy-values :deep(.ant-descriptions-item-content),
.quota-policy-card :deep(.ant-table-cell) {
  overflow-wrap: anywhere;
}

.quota-policy-filter {
  --quota-filter-active-text: #173e73;
  --quota-filter-active-surface: #e9f2ff;
  --quota-filter-active-border: #4078bc;
  --quota-filter-focus: #285ba9;
}

:global(.dark .quota-policy-filter) {
  --quota-filter-active-text: #dbeafe;
  --quota-filter-active-surface: #172840;
  --quota-filter-active-border: #83aaf2;
  --quota-filter-focus: #9fc4ff;
}

.quota-policy-filter :deep(.ant-radio-button-wrapper-checked),
.quota-policy-filter :deep(.ant-radio-button-wrapper-checked:hover) {
  color: var(--quota-filter-active-text);
  background-color: var(--quota-filter-active-surface);
  border-color: var(--quota-filter-active-border);
}

.quota-policy-filter :deep(.ant-radio-button-wrapper-checked::before) {
  background-color: var(--quota-filter-active-border);
}

.quota-policy-filter :deep(.ant-radio-button-wrapper:focus-within) {
  z-index: 2;
  outline: 2px solid var(--quota-filter-focus);
  outline-offset: 2px;
}

.quota-policy-empty :deep(.ant-empty-description) {
  color: hsl(var(--muted-foreground));
}

.quota-policy-item {
  padding: 0.75rem;
  background: color-mix(
    in srgb,
    var(--quota-current-accent) 3%,
    hsl(var(--card))
  );
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.quota-policy-values {
  padding-block-start: 0.55rem;
  margin-block-start: 0.55rem;
  border-block-start: 1px solid hsl(var(--border));
}

.quota-env {
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: 0.7rem;
}

.quota-env code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
