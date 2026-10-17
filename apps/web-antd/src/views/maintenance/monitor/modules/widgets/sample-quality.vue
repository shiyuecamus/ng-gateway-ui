<script lang="ts" setup>
import type { MonitorPointEntry, MonitorRow } from '@vben/types';

import { computed, nextTick, ref, watch } from 'vue';

import {
  ChevronDown,
  CircleCheckBig,
  Info,
  InspectionPanel,
  X,
} from '@vben/icons';
import { $t } from '@vben/locales';

import { Popover, PopoverContent, PopoverTrigger } from '@vben-core/shadcn-ui';

import { Tag } from 'ant-design-vue';

import SampleTimes from './sample-times.vue';

const props = defineProps<{ open: boolean; row: MonitorRow }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const trigger = ref<HTMLButtonElement>();
const closeButton = ref<HTMLButtonElement>();

function qualityColor(value: MonitorRow['sourceQuality']) {
  if (value === 'good') return 'success';
  if (value === 'invalid') return 'error';
  if (value === 'questionable') return 'warning';
  return 'default';
}

function qualitySurface(value: MonitorRow['sourceQuality']) {
  if (value === 'good') return 'border-emerald-500/20 bg-emerald-500/5';
  if (value === 'invalid') return 'border-red-500/20 bg-red-500/5';
  if (value === 'questionable') return 'border-amber-500/20 bg-amber-500/5';
  return 'border-border bg-muted/30';
}

function factText(value: boolean | null | undefined) {
  if (value === true) return $t('page.monitor.realtime.facts.yes');
  if (value === false) return $t('page.monitor.realtime.facts.no');
  return $t('page.monitor.realtime.quality.unknown');
}

/** Missing protocol facts remain unknown; false is evidence, not a default. */
function factColor(
  value: boolean | null | undefined,
  presentColor: string,
  absentColor = 'default',
) {
  if (value === true) return presentColor;
  if (value === false) return absentColor;
  return 'default';
}

const timeFacts = computed(() => {
  const time = props.row.timeFacts;
  return [
    {
      key: 'clockFailure',
      value: time?.clockFailure,
      color: factColor(time?.clockFailure, 'error', 'success'),
    },
    {
      key: 'unsynchronized',
      value: time?.clockNotSynchronized,
      color: factColor(time?.clockNotSynchronized, 'warning', 'success'),
    },
    {
      key: 'summerTime',
      value: time?.summerTime,
      color: factColor(time?.summerTime, 'blue'),
    },
    {
      key: 'substituted',
      value: time?.substituted,
      color: factColor(time?.substituted, 'warning'),
    },
    {
      key: 'leapSecondsKnown',
      value: time?.leapSecondsKnown,
      color: factColor(time?.leapSecondsKnown, 'cyan', 'warning'),
    },
  ];
});

const rawFacts = computed(() =>
  [
    { key: 'rawQuality', raw: props.row.sourceFacts?.raw },
    { key: 'rawTime', raw: props.row.timeFacts?.raw },
  ].filter(
    (
      fact,
    ): fact is {
      key: string;
      raw: NonNullable<MonitorPointEntry['sourceQuality']['raw']>;
    } => fact.raw !== null && fact.raw !== undefined,
  ),
);

function rawBytes(bytes: number[]) {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

async function close() {
  emit('update:open', false);
  await nextTick();
  trigger.value?.focus();
}

// A rapid reopen can retain the closing presence; its focus scope does not mount again.
watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      if (props.open) closeButton.value?.focus({ preventScroll: true });
    }
  },
  { flush: 'post' },
);
</script>

<template>
  <Popover :open="open" @update:open="emit('update:open', $event)">
    <PopoverContent
      side="bottom"
      :side-offset="8"
      :collision-padding="16"
      :aria-label="$t('page.monitor.realtime.facts.title')"
      class="monitor-quality-popover z-popup max-h-[min(42rem,var(--reka-popover-content-available-height))] w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0 shadow-2xl"
    >
      <section
        class="quality-detail flex max-h-[inherit] flex-col text-left text-foreground"
        @keydown.esc.stop.prevent="close"
      >
        <header
          class="flex shrink-0 items-start gap-3 border-b border-border bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent p-4"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400"
          >
            <CircleCheckBig class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold leading-6">
              {{ $t('page.monitor.realtime.facts.title') }}
            </h3>
            <p class="break-all text-xs leading-5 text-muted-foreground">
              {{ row.deviceName }} · {{ row.key }}
            </p>
          </div>
          <button
            ref="closeButton"
            type="button"
            :aria-label="$t('page.monitor.realtime.facts.close')"
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </header>

        <div class="min-h-0 space-y-4 overflow-y-auto p-4">
          <div class="grid grid-cols-2 gap-2.5">
            <div
              class="rounded-lg border p-3"
              :class="qualitySurface(row.sourceQuality)"
            >
              <p class="mb-2 text-xs text-muted-foreground">
                {{ $t('page.monitor.realtime.table.sourceQuality') }}
              </p>
              <Tag :color="qualityColor(row.sourceQuality)" class="!m-0">
                {{
                  $t(
                    `page.monitor.realtime.quality.${row.sourceQuality ?? 'unknown'}`,
                  )
                }}
              </Tag>
            </div>
            <div class="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
              <p class="mb-2 text-xs text-muted-foreground">
                {{ $t('page.monitor.realtime.table.sourceMode') }}
              </p>
              <Tag
                :color="
                  row.sourceMode === 'normal'
                    ? 'cyan'
                    : row.sourceMode === 'test'
                      ? 'warning'
                      : 'default'
                "
                class="!m-0"
              >
                {{
                  $t(
                    `page.monitor.realtime.sourceMode.${row.sourceMode ?? 'unknown'}`,
                  )
                }}
              </Tag>
            </div>
            <div class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <p class="mb-2 text-xs text-muted-foreground">
                {{ $t('page.monitor.realtime.table.freshness') }}
              </p>
              <Tag
                :color="
                  row.freshness === 'current'
                    ? 'success'
                    : row.freshness === 'recovering'
                      ? 'processing'
                      : row.freshness === 'stale'
                        ? 'warning'
                        : 'default'
                "
                class="!m-0"
              >
                {{
                  $t(
                    `page.monitor.realtime.freshness.${row.freshness ?? 'unknown'}`,
                  )
                }}
              </Tag>
            </div>
            <div
              class="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"
            >
              <p class="mb-2 text-xs text-muted-foreground">
                {{ $t('page.monitor.realtime.table.timeValidity') }}
              </p>
              <Tag :color="qualityColor(row.timeValidity)" class="!m-0">
                {{
                  $t(
                    `page.monitor.realtime.quality.${row.timeValidity ?? 'unknown'}`,
                  )
                }}
              </Tag>
            </div>
          </div>

          <SampleTimes :row="row" />

          <section :aria-label="$t('page.monitor.realtime.facts.clockTitle')">
            <h4 class="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Info class="size-4 text-indigo-500 dark:text-indigo-400" />
              {{ $t('page.monitor.realtime.facts.clockTitle') }}
            </h4>
            <dl
              class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-muted/30 p-3 text-xs"
            >
              <div
                v-for="fact in timeFacts"
                :key="fact.key"
                class="flex flex-wrap items-center justify-between gap-1.5"
              >
                <dt class="text-muted-foreground">
                  {{ $t(`page.monitor.realtime.facts.${fact.key}`) }}
                </dt>
                <dd>
                  <Tag :color="fact.color" class="!m-0 !text-xs">
                    {{ factText(fact.value) }}
                  </Tag>
                </dd>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-1.5">
                <dt class="text-muted-foreground">
                  {{ $t('page.monitor.realtime.facts.accuracy') }}
                </dt>
                <dd>
                  <Tag
                    :color="
                      row.timeFacts?.accuracy == null ? 'default' : 'purple'
                    "
                    class="!m-0 !text-xs"
                  >
                    {{
                      row.timeFacts?.accuracy ??
                      $t('page.monitor.realtime.quality.unknown')
                    }}
                  </Tag>
                </dd>
              </div>
            </dl>
          </section>

          <section
            v-if="rawFacts.length > 0"
            :aria-label="$t('page.monitor.realtime.facts.rawTitle')"
          >
            <h4 class="mb-2 flex items-center gap-2 text-xs font-semibold">
              <InspectionPanel
                class="size-4 text-amber-600 dark:text-amber-400"
              />
              {{ $t('page.monitor.realtime.facts.rawTitle') }}
            </h4>
            <div class="space-y-2">
              <div
                v-for="fact in rawFacts"
                :key="fact.key"
                class="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div
                  class="mb-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span class="text-muted-foreground">{{
                    $t(`page.monitor.realtime.facts.${fact.key}`)
                  }}</span>
                  <Tag color="geekblue" class="!m-0 !text-[11px]">
                    {{
                      $t('page.monitor.realtime.facts.bits', {
                        count: fact.raw.bitLen,
                      })
                    }}
                  </Tag>
                </div>
                <p
                  class="break-all font-mono text-[11px] text-muted-foreground"
                >
                  {{ fact.raw.protocol }}
                </p>
                <code
                  class="mt-1.5 block break-all font-mono text-sm font-medium tracking-wider text-amber-700 dark:text-amber-300"
                  v-text="rawBytes(fact.raw.bytes)"
                ></code>
              </div>
            </div>
          </section>
          <p class="text-[11px] leading-4 text-muted-foreground">
            {{ $t('page.monitor.realtime.facts.unknownHint') }}
          </p>
        </div>
      </section>
    </PopoverContent>
    <PopoverTrigger as-child>
      <button
        ref="trigger"
        type="button"
        :aria-label="$t('page.monitor.realtime.facts.open', { key: row.key })"
        aria-haspopup="dialog"
        :aria-expanded="open"
        class="quality-trigger inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-transparent p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        @keydown.esc.stop.prevent="close"
      >
        <Tag :color="qualityColor(row.sourceQuality)" class="!m-0">
          {{
            $t(
              `page.monitor.realtime.quality.${row.sourceQuality ?? 'unknown'}`,
            )
          }}
        </Tag>
        <Tag v-if="row.sourceMode === 'test'" color="warning" class="!m-0">
          {{ $t('page.monitor.realtime.sourceMode.test') }}
        </Tag>
        <ChevronDown
          class="size-3.5 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': open }"
        />
      </button>
    </PopoverTrigger>
  </Popover>
</template>

<style scoped>
.quality-trigger:hover :deep(.ant-tag) {
  filter: brightness(1.12);
}
</style>
