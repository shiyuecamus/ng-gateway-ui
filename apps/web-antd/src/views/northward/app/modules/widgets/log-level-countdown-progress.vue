<script lang="ts" setup>
import type { AppLogOverrideView } from '@vben/types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import { Progress } from 'ant-design-vue';

defineOptions({ name: 'AppLogLevelCountdownProgress' });

const props = defineProps<{
  /** Called when countdown reaches zero (override expired). Parent typically refetches. */
  onExpired?: () => Promise<void> | void;
  /** Active override with ttlMs + expiresAtMs. Not rendered when null or expired. */
  override: AppLogOverrideView | null | undefined;
}>();

const RATE_MS = 1000;

const remainingMs = ref(0);
let timer: null | ReturnType<typeof setInterval> = null;

function computeRemaining(expiresAtMs: number): number {
  return Math.max(0, expiresAtMs - Date.now());
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds <= 0)
    return `0${$t('page.northward.app.logLevelModal.countdownSeconds')}`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const unitS = $t('page.northward.app.logLevelModal.countdownSeconds');
  if (m > 0) {
    const unitM = $t('page.northward.app.logLevelModal.countdownMinutes');
    return `${m}${unitM}${s}${unitS}`;
  }
  return `${s}${unitS}`;
}

function tick() {
  const ov = props.override;
  if (
    !ov ||
    typeof ov.expiresAtMs !== 'number' ||
    typeof ov.ttlMs !== 'number' ||
    ov.ttlMs <= 0
  ) {
    return;
  }
  const r = computeRemaining(ov.expiresAtMs);
  remainingMs.value = r;
  if (r <= 0) {
    stopTimer();
    props.onExpired?.();
  }
}

function startTimer() {
  stopTimer();
  tick();
  timer = setInterval(tick, RATE_MS);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

const percent = computed(() => {
  const ov = props.override;
  if (!ov?.ttlMs || ov.ttlMs <= 0) return 0;
  const r = remainingMs.value;
  return Math.min(100, Math.max(0, (r / ov.ttlMs) * 100));
});

const timeText = computed(() => formatRemaining(remainingMs.value));

const visible = computed(() => {
  const ov = props.override;
  if (
    !ov ||
    typeof ov.expiresAtMs !== 'number' ||
    typeof ov.ttlMs !== 'number' ||
    ov.ttlMs <= 0
  ) {
    return false;
  }
  return computeRemaining(ov.expiresAtMs) > 0 || remainingMs.value > 0;
});

watch(
  () => props.override,
  (ov) => {
    remainingMs.value = ov ? computeRemaining(ov.expiresAtMs) : 0;
    const show =
      !!ov &&
      typeof ov.expiresAtMs === 'number' &&
      typeof ov.ttlMs === 'number' &&
      ov.ttlMs > 0 &&
      (remainingMs.value > 0 || computeRemaining(ov.expiresAtMs) > 0);
    if (!show) {
      stopTimer();
      return;
    }
    startTimer();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<template>
  <div
    v-if="visible"
    class="space-y-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
  >
    <div class="flex items-center justify-between text-sm">
      <span class="text-muted-foreground">
        {{ $t('page.northward.app.logLevelModal.countdownLabel') }}
      </span>
      <span class="font-medium tabular-nums">
        {{
          $t('page.northward.app.logLevelModal.countdownRemaining', {
            time: timeText,
          })
        }}
      </span>
    </div>
    <Progress
      :percent="Math.round(percent)"
      :show-info="false"
      status="active"
      :stroke-color="{
        from: 'var(--ant-color-info)',
        to: 'var(--ant-color-info)',
      }"
    />
  </div>
</template>
