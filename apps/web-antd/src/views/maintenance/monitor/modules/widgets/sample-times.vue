<script lang="ts" setup>
import type { MonitorRow } from '@vben/types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import { sampleTimeText, sourceTimeText } from '../time';

const props = defineProps<{ row: MonitorRow }>();
const key = 'page.monitor.realtime';
const fallbackText = computed(() =>
  props.row.dataTime?.fallback
    ? $t(`${key}.timeFallback.${props.row.dataTime.fallback.kind}`)
    : null,
);
const times = computed(() => [
  {
    label: $t(`${key}.table.receivedTime`),
    value: sampleTimeText(props.row.receivedTime),
  },
  { label: $t(`${key}.table.sourceTime`), value: sourceTimeText(props.row) },
  {
    label: $t(`${key}.table.stateChangedAt`),
    value: sampleTimeText(props.row.stateChangedAt),
  },
  ...(props.row.protocolTime
    ? [
        {
          label: $t(`${key}.protocolTimeKind.${props.row.protocolTime.kind}`),
          value: sampleTimeText(props.row.protocolTime.time),
        },
      ]
    : []),
]);
</script>

<template>
  <section
    class="rounded-lg border border-border p-3 text-xs"
    :aria-label="$t(`${key}.table.dataTime`)"
  >
    <table class="w-full">
      <tbody>
        <tr v-for="time in times" :key="time.label">
          <th class="py-1 text-left font-normal text-muted-foreground">
            {{ time.label }}
          </th>
          <td class="py-1 text-right">{{ time.value || '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="row.dataTime" class="mt-2 break-words">
      {{ $t(`${key}.table.dataTime`) }}:
      {{ sampleTimeText(row.dataTime.time) }} ·
      {{ $t(`${key}.timeOrigin.${row.dataTime.origin}`) }}
      <span v-if="fallbackText"> · {{ fallbackText }}</span>
    </p>
    <p class="mt-2 text-muted-foreground">{{ $t(`${key}.timeHint`) }}</p>
  </section>
</template>
