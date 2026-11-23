<script setup lang="ts">
import { computed } from 'vue';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Progress,
  Spin,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { fetchChannelPage } from '#/api/core/channel';
import { getChannelRetainedStateUsage } from '#/api/core/resource-quota';

import { amount, quotaText, sampleTime, utilization } from './presentation';
import QuotaScopePicker from './quota-scope-picker.vue';
import { useQuotaScopeSelection } from './use-quota-scope-selection';

const props = defineProps<{ active: boolean }>();

const {
  chooseTarget,
  listPending,
  listProblem,
  page,
  pageSize,
  pickerId,
  refresh,
  sample,
  samplePending,
  sampleProblem,
  searchTargets,
  selected,
  selectedId,
  targetOptions,
  total,
} = useQuotaScopeSelection({
  active: () => props.active,
  loadPage: fetchChannelPage,
  loadSample: getChannelRetainedStateUsage,
  sampleId: (snapshot) => snapshot.channelId,
});

defineExpose({ refresh });

const meter = computed(() =>
  sample.value ? utilization(sample.value.retained) : undefined,
);
const currentState = computed(() => {
  const reading = sample.value;
  if (sampleProblem.value) return { color: 'default', key: 'channels.stale' };
  if (!reading) return { color: 'default', key: 'channels.unavailable' };
  if (reading.draining) return { color: 'warning', key: 'drainingLabel' };
  if (!reading.accepting)
    return { color: 'default', key: 'channels.notAccepting' };
  if (reading.retained.available === '0')
    return { color: 'error', key: 'exhaustedLabel' };
  return { color: 'success', key: 'acceptingLabel' };
});
const configuration = computed(() => selected.value?.configuration);
const revisionPending = computed(
  () =>
    sample.value &&
    configuration.value &&
    configuration.value.desiredRevision !== sample.value.configurationRevision,
);

function exactBytes(value: string) {
  return quotaText('channels.bytes', { value: amount(value) });
}
</script>

<template>
  <section class="space-y-3 pt-1" :aria-label="quotaText('channels.tab')">
    <Card size="small" class="min-w-0">
      <template #title>
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="m-0 text-sm font-semibold">
            {{ quotaText('channels.title') }}
          </h3>
          <Tag color="geekblue" class="quota-tag !m-0">
            {{ quotaText('channels.inherited') }}
          </Tag>
        </div>
      </template>
      <p class="mb-3 text-sm text-muted-foreground">
        {{ quotaText('channels.description') }}
      </p>
      <QuotaScopePicker
        v-model:page="page"
        :id="pickerId"
        :selected="selectedId"
        :options="targetOptions"
        :list-pending="listPending"
        :sample-pending="samplePending"
        :total="total"
        :page-size="pageSize"
        kind="channels"
        @choose="chooseTarget"
        @refresh="refresh"
        @search="searchTargets"
      />
    </Card>

    <Alert
      v-if="listProblem || sampleProblem"
      show-icon
      type="warning"
      :message="
        quotaText(
          listProblem === 'denied' || sampleProblem === 'denied'
            ? 'channels.denied'
            : listProblem
              ? 'channels.lookupFailed'
              : 'channels.sampleFailed',
        )
      "
    />

    <Card v-if="sample" size="small" class="min-w-0">
      <template #title>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3
            class="m-0 max-w-full whitespace-normal break-words text-sm font-semibold"
          >
            {{ selected?.name }}
          </h3>
          <Tag :color="currentState.color" class="quota-tag !m-0" role="status">
            {{ quotaText(currentState.key) }}
          </Tag>
          <Tag v-if="revisionPending" class="quota-tag !m-0" color="gold">
            {{ quotaText('channels.revisionPending') }}
          </Tag>
        </div>
      </template>
      <div class="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-1 text-sm">
          <span class="font-medium">{{ quotaText('channels.usage') }}</span>
          <span class="tabular-nums">
            {{ exactBytes(sample.retained.used) }} /
            {{ exactBytes(sample.retained.limit) }}
          </span>
        </div>
        <Progress
          :percent="meter?.percent"
          :show-info="false"
          :status="
            sample.draining || sample.retained.available === '0'
              ? 'exception'
              : 'normal'
          "
          :stroke-color="
            sampleProblem ? 'var(--color-muted-foreground)' : undefined
          "
          :aria-label="quotaText('channels.usage')"
          :aria-valuetext="meter?.text"
          class="!m-0"
        />
      </div>
      <Descriptions :colon="false" :column="{ xs: 1, sm: 2 }" size="small">
        <DescriptionsItem :label="quotaText('channels.headroom')">
          <span class="tabular-nums">{{
            exactBytes(sample.retained.available)
          }}</span>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.peak')">
          <span class="tabular-nums">{{
            exactBytes(sample.retained.peak)
          }}</span>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.channelRefusals')">
          <Tag
            :color="sample.refusedChannel === '0' ? 'default' : 'orange'"
            class="quota-tag !m-0"
          >
            {{ amount(sample.refusedChannel) }}
          </Tag>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.gatewayRefusals')">
          <Tag
            :color="sample.refusedGateway === '0' ? 'default' : 'volcano'"
            class="quota-tag !m-0"
          >
            {{ amount(sample.refusedGateway) }}
          </Tag>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.sampleTime')">
          <time :datetime="sample.sampledAt">{{
            sampleTime(sample.sampledAt)
          }}</time>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.policyRevision')">
          {{ amount(sample.policyRevision) }}
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.configurationRevision')">
          {{ amount(sample.configurationRevision) }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="revisionPending"
          :label="quotaText('channels.desiredRevision')"
        >
          {{ amount(configuration?.desiredRevision) }}
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.configurationEpoch')">
          {{ amount(sample.configurationEpoch) }}
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('channels.owner')">
          <TypographyText
            code
            :copyable="{ text: sample.ownerId }"
            :title="sample.ownerId"
          >
            {{ sample.ownerId.slice(0, 8) }}
          </TypographyText>
        </DescriptionsItem>
      </Descriptions>
    </Card>
    <div
      v-else-if="!listProblem && !sampleProblem"
      class="rounded-md border border-dashed border-border px-3 py-2"
    >
      <Spin :spinning="samplePending || listPending">
        <Empty
          :description="
            quotaText(
              selected
                ? configuration?.state === 'disabled'
                  ? 'channels.disabled'
                  : 'channels.unavailable'
                : 'channels.selectHint',
            )
          "
        />
      </Spin>
    </div>
  </section>
</template>
