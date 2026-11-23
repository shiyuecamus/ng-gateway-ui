<script setup lang="ts">
import { computed, ref } from 'vue';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Progress,
  Segmented,
  Spin,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { fetchAppPage } from '#/api/core/app';
import { getNorthwardAppQueueUsage } from '#/api/core/resource-quota';

import { amount, quotaText, sampleTime, utilization } from './presentation';
import QuotaAlarms from './quota-alarms.vue';
import QuotaAppQueueEditor from './quota-app-queue-editor.vue';
import QuotaArchivedAppHistory from './quota-archived-app-history.vue';
import QuotaScopePicker from './quota-scope-picker.vue';
import { useQuotaScopeSelection } from './use-quota-scope-selection';

const props = defineProps<{ active: boolean }>();
const mode = ref<'archived' | 'installed'>('installed');
const archive = ref<InstanceType<typeof QuotaArchivedAppHistory>>();
const modes = computed(() => [
  { label: quotaText('apps.installed'), value: 'installed' },
  { label: quotaText('apps.archive.tab'), value: 'archived' },
]);
const {
  chooseTarget,
  listPending,
  listProblem,
  page,
  pageSize,
  pickerId,
  refresh: refreshInstalled,
  sample,
  samplePending,
  sampleProblem,
  searchTargets,
  selected,
  selectedId,
  targetOptions,
  total,
} = useQuotaScopeSelection({
  active: () => props.active && mode.value === 'installed',
  loadPage: fetchAppPage,
  loadSample: getNorthwardAppQueueUsage,
  sampleId: (snapshot) => snapshot.appId,
});

function refresh() {
  return mode.value === 'archived'
    ? archive.value?.refresh()
    : refreshInstalled();
}

defineExpose({ refresh });

const state = computed(() => {
  if (sampleProblem.value) return { color: 'default', key: 'staleSample' };
  return sample.value?.accepting
    ? { color: 'success', key: 'acceptingLabel' }
    : { color: 'gold', key: 'notAccepting' };
});
const lanes = computed(() => {
  const current = sample.value;
  if (!current) return [];
  const { delivery, retention } = current;
  return [
    {
      key: 'ordinary',
      titleColor: 'geekblue',
      meters: [
        { key: 'latestSlots', usage: retention.latestSlots, bytes: false },
        { key: 'retainedBytes', usage: retention.ordinaryBytes, bytes: true },
      ],
      mailbox: current.ordinaryMailbox,
      encoding: retention.reservedOrdinaryEncodingBytes,
      attemptLimit: delivery.ordinaryAttemptLimit,
      eventCount: retention.ordinaryEvents,
    },
    {
      key: 'reply',
      titleColor: 'purple',
      meters: [
        { key: 'replySlots', usage: retention.replySlots, bytes: false },
        { key: 'retainedBytes', usage: retention.replyBytes, bytes: true },
      ],
      mailbox: current.replyMailbox,
      encoding: retention.reservedReplyEncodingBytes,
      attemptLimit: delivery.replyAttemptLimit,
    },
  ];
});

function measured(value: string, bytes = false) {
  return bytes ? `${amount(value)} ${quotaText('units.bytes')}` : amount(value);
}
</script>

<template>
  <section class="space-y-3 pt-1" :aria-label="quotaText('apps.tab')">
    <Segmented v-model:value="mode" :options="modes" />
    <template v-if="mode === 'installed'">
      <Card size="small" class="min-w-0">
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-sm font-semibold">
              {{ quotaText('apps.title') }}
            </h3>
            <Tag color="geekblue" class="quota-tag !m-0">
              {{ quotaText('apps.source') }}
            </Tag>
          </div>
        </template>
        <p class="mb-3 text-sm text-muted-foreground">
          {{ quotaText('apps.description') }}
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
          kind="apps"
          @choose="chooseTarget"
          @refresh="refresh"
          @search="searchTargets"
        />
      </Card>

      <QuotaAppQueueEditor
        v-if="selectedId && selected"
        :key="selectedId"
        :active="active"
        :app-id="selectedId"
        :app-name="selected.name"
        @changed="refresh"
      />

      <Alert
        v-if="listProblem || sampleProblem"
        type="warning"
        show-icon
        :message="
          quotaText(
            listProblem === 'denied' || sampleProblem === 'denied'
              ? 'apps.denied'
              : listProblem
                ? 'apps.lookupFailed'
                : 'apps.sampleFailed',
          )
        "
      />

      <template v-if="sample">
        <Card size="small" class="min-w-0">
          <template #title>
            <div class="flex flex-wrap items-center gap-2">
              <h3
                class="m-0 max-w-full whitespace-normal break-words text-sm font-semibold"
              >
                {{ selected?.name }}
              </h3>
              <Tag class="quota-tag !m-0" :color="state.color" role="status">
                {{ quotaText(state.key) }}
              </Tag>
              <Tag
                v-if="!sampleProblem"
                class="quota-tag !m-0"
                :color="sample.connected ? 'blue' : 'default'"
              >
                {{
                  quotaText(
                    sample.connected ? 'apps.connected' : 'apps.disconnected',
                  )
                }}
              </Tag>
            </div>
          </template>
          <Descriptions :colon="false" :column="{ xs: 1, sm: 2 }" size="small">
            <DescriptionsItem :label="quotaText('apps.desiredRevision')">
              {{ amount(selected?.desiredRevision) }}
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('apps.runningRevision')">
              {{ amount(sample.configurationRevision) }}
              <Tag
                v-if="
                  selected?.desiredRevision !== sample.configurationRevision
                "
                class="quota-tag !m-0 ml-2"
                color="gold"
              >
                {{ quotaText('apps.revisionPending') }}
              </Tag>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('sampledAt')">
              <time :datetime="sample.sampledAt">{{
                sampleTime(sample.sampledAt)
              }}</time>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('apps.owner')">
              <TypographyText
                code
                :copyable="{ text: sample.ownerId }"
                :title="sample.ownerId"
              >
                {{ sample.ownerId.slice(0, 8) }}
              </TypographyText>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('apps.ownerUptime')">
              {{ amount(sample.ownerUptimeMs) }}
              {{ quotaText('units.milliseconds') }}
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('apps.lastCompletionAge')">
              <template v-if="sample.progress.lastCompletionAgeMs === null">
                {{ quotaText('apps.noCompletion') }}
              </template>
              <template v-else>
                {{ amount(sample.progress.lastCompletionAgeMs) }}
                {{ quotaText('units.milliseconds') }}
              </template>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('apps.noProgressAge')">
              <template v-if="!sample.progress.hasPendingWork">
                {{ quotaText('apps.noPendingWork') }}
              </template>
              <template v-else-if="sample.progress.noProgressAgeMs === null">
                {{ quotaText('unknown') }}
              </template>
              <template v-else>
                {{ amount(sample.progress.noProgressAgeMs) }}
                {{ quotaText('units.milliseconds') }}
              </template>
            </DescriptionsItem>
          </Descriptions>
          <Descriptions
            :colon="false"
            :column="{ xs: 1, sm: 2, xl: 3 }"
            size="small"
            class="mt-2"
          >
            <DescriptionsItem
              v-for="(count, boundary) in sample.progress.completions"
              :key="boundary"
              :label="quotaText(`apps.completions.${boundary}`)"
            >
              {{ amount(count) }}
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <div class="grid min-w-0 gap-3 min-[920px]:grid-cols-2">
          <Card
            v-for="lane in lanes"
            :key="lane.key"
            class="min-w-0"
            size="small"
          >
            <template #title>
              <Tag :color="lane.titleColor" class="quota-tag !m-0">
                {{ quotaText(`apps.${lane.key}`) }}
              </Tag>
            </template>
            <div class="grid gap-2">
              <div
                v-for="meter in lane.meters"
                :key="meter.key"
                class="rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div
                  class="flex flex-wrap items-center justify-between gap-1 text-sm"
                >
                  <span class="font-medium">{{
                    quotaText(`apps.${meter.key}`)
                  }}</span>
                  <span class="tabular-nums">
                    {{ measured(meter.usage.used, meter.bytes) }} /
                    {{ measured(meter.usage.limit, meter.bytes) }}
                  </span>
                </div>
                <Progress
                  :percent="utilization(meter.usage)?.percent"
                  :aria-valuetext="utilization(meter.usage)?.text"
                  :aria-label="quotaText(`apps.${meter.key}`)"
                  :status="
                    meter.usage.available === '0' ? 'exception' : 'normal'
                  "
                  :stroke-color="
                    sampleProblem ? 'var(--color-muted-foreground)' : undefined
                  "
                  :show-info="false"
                  class="!m-0"
                />
                <span class="text-xs text-muted-foreground">
                  {{
                    quotaText('apps.peak', {
                      value: measured(meter.usage.peak, meter.bytes),
                    })
                  }}
                </span>
              </div>
            </div>
            <Descriptions :colon="false" :column="1" size="small" class="mt-3">
              <DescriptionsItem :label="quotaText('apps.mailboxSlots')">
                {{ amount(lane.mailbox.occupied) }} /
                {{ amount(lane.mailbox.limit) }}
              </DescriptionsItem>
              <DescriptionsItem
                v-if="lane.eventCount"
                :label="quotaText('apps.retainedEvents')"
              >
                {{ amount(lane.eventCount.used) }} /
                {{ amount(lane.eventCount.limit) }}
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('apps.encodingReserve')">
                {{ measured(lane.encoding, true) }}
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('apps.attemptLimit')">
                {{ amount(lane.attemptLimit) }}
              </DescriptionsItem>
            </Descriptions>
          </Card>
        </div>

        <Card size="small" class="min-w-0">
          <template #title>
            <h3 class="m-0 text-sm font-semibold">
              {{ quotaText('refusals') }}
            </h3>
          </template>
          <Descriptions
            :colon="false"
            :column="{ xs: 1, sm: 2, xl: 3 }"
            size="small"
          >
            <DescriptionsItem
              v-for="(count, key) in {
                ...sample.retention.refusals,
                ...sample.retention.ordinaryAdmissionRefusals,
              }"
              :key="key"
              :label="quotaText(`apps.reasons.${key}`)"
            >
              <Tag v-if="count !== '0'" color="orange" class="quota-tag !m-0">
                {{ amount(count) }}
              </Tag>
              <span v-else class="text-muted-foreground">{{
                amount(count)
              }}</span>
            </DescriptionsItem>
          </Descriptions>
        </Card>
      </template>

      <div
        v-else-if="!listProblem && !sampleProblem"
        class="rounded-md border border-dashed border-border px-3 py-2"
      >
        <Spin :spinning="samplePending || listPending">
          <Empty
            :description="
              quotaText(
                selected
                  ? selected.configurationState === 'disabled'
                    ? 'apps.disabled'
                    : 'apps.unavailable'
                  : 'apps.selectHint',
              )
            "
          />
        </Spin>
      </div>
      <QuotaAlarms
        v-if="active && selected && selectedId"
        :key="selectedId"
        :scope="{ resource: 'northward_app_queue', appId: Number(selectedId) }"
      />
    </template>
    <QuotaArchivedAppHistory v-else-if="active" ref="archive" />
  </section>
</template>
