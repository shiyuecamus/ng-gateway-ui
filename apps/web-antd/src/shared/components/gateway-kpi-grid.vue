<script setup lang="ts">
import type { AnalysisOverviewItem } from '@vben/common-ui';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  VbenCountToAnimator,
  VbenIcon,
} from '@vben-core/shadcn-ui';

defineOptions({ name: 'GatewayKpiGrid' });

withDefaults(
  defineProps<{
    items?: AnalysisOverviewItem[];
  }>(),
  { items: () => [] },
);

// Per-card gradients for key numbers (preferred palette).
// IMPORTANT: darker colors in light mode; lighter colors in dark mode for readability.
const numberGradients = [
  'from-sky-600 via-cyan-600 to-blue-600 dark:from-sky-200 dark:via-cyan-200 dark:to-blue-200',
  'from-emerald-600 via-teal-600 to-cyan-600 dark:from-emerald-200 dark:via-teal-200 dark:to-cyan-200',
  'from-violet-600 via-purple-600 to-fuchsia-600 dark:from-violet-200 dark:via-purple-200 dark:to-fuchsia-200',
  'from-pink-600 via-rose-600 to-fuchsia-600 dark:from-pink-200 dark:via-rose-200 dark:to-fuchsia-200',
  'from-amber-600 via-orange-600 to-rose-600 dark:from-amber-200 dark:via-orange-200 dark:to-rose-200',
  'from-orange-600 via-amber-600 to-yellow-600 dark:from-orange-200 dark:via-amber-200 dark:to-yellow-200',
  'from-cyan-600 via-sky-600 to-indigo-600 dark:from-cyan-200 dark:via-sky-200 dark:to-indigo-200',
  'from-fuchsia-600 via-purple-600 to-sky-600 dark:from-fuchsia-200 dark:via-purple-200 dark:to-sky-200',
] as const;

function numberGradientClass(index: number): string {
  const g = numberGradients[index % numberGradients.length];
  return `bg-gradient-to-r ${g} bg-clip-text text-transparent`;
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
    <template v-for="(item, idx) in items" :key="item.title">
      <Card
        class="w-full dark:border-white/10 dark:bg-slate-950/40 dark:ring-1 dark:ring-white/5"
        :title="item.title"
      >
        <CardHeader>
          <CardTitle class="text-xl text-foreground">
            {{ item.title }}
          </CardTitle>
        </CardHeader>

        <CardContent class="flex items-center justify-between">
          <VbenCountToAnimator
            :end-val="item.value"
            :start-val="1"
            :class="`${numberGradientClass(idx)} text-2xl font-semibold`"
            prefix=""
            :suffix="item.valueSuffix ?? ''"
          />
          <!-- Bigger icon + subtle glow -->
          <VbenIcon
            :icon="item.icon"
            class="size-12 flex-shrink-0 dark:drop-shadow-[0_0_14px_rgba(255,255,255,0.18)]"
          />
        </CardContent>

        <CardFooter class="justify-between">
          <span class="text-sm text-foreground/60 dark:text-white/70">{{
            item.totalTitle
          }}</span>
          <VbenCountToAnimator
            :end-val="item.totalValue"
            :start-val="1"
            :class="`${numberGradientClass(idx)} text-sm font-medium`"
            prefix=""
            :suffix="item.totalSuffix ?? ''"
          />
        </CardFooter>
      </Card>
    </template>
  </div>
</template>
