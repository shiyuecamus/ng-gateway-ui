<script setup lang="ts">
import type { SelectOption } from '@vben/types';

import { computed, useAttrs, useSlots } from 'vue';

import { CircleHelp } from '@vben/icons';

import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  VbenTooltip,
} from '@vben-core/shadcn-ui';

defineOptions({
  name: 'PreferenceSelectItem',
});

withDefaults(
  defineProps<{
    disabled?: boolean;
    items?: SelectOption[];
    placeholder?: string;
    tip?: string;
  }>(),
  {
    disabled: false,
    placeholder: '',
    tip: '',
    items: () => [],
  },
);

const inputValue = defineModel<number>();

const slots = useSlots();

const attrs = useAttrs();

/**
 * Reka UI `NumberField` snaps to `step` on blur by default (`stepSnapping=true`).
 *
 * In practice, for some locales/formatting combinations this can cause a small drift
 * (e.g. +1/+2) when `step > 1` and the input is committed on blur.
 *
 * For preferences forms, `step` is a UI convenience (buttons / wheel / arrow keys),
 * not a hard validation rule, so we disable snapping when `step > 1` to keep the
 * user-entered value stable.
 */
const stepSnapping = computed(() => {
  const step = Number((attrs as any).step);
  return !(Number.isFinite(step) && step > 1);
});
</script>

<template>
  <div
    :class="{
      'hover:bg-accent': !slots.tip,
      'pointer-events-none opacity-50': disabled,
    }"
    class="my-1 flex w-full items-center justify-between rounded-md px-2 py-1"
  >
    <span class="flex items-center text-sm">
      <slot></slot>

      <VbenTooltip v-if="slots.tip || tip" side="bottom">
        <template #trigger>
          <CircleHelp class="ml-1 size-3 cursor-help" />
        </template>
        <slot name="tip">
          <template v-if="tip">
            <p v-for="(line, index) in tip.split('\n')" :key="index">
              {{ line }}
            </p>
          </template>
        </slot>
      </VbenTooltip>
    </span>

    <NumberField
      v-model="inputValue"
      v-bind="$attrs"
      :step-snapping="stepSnapping"
      class="w-[165px]"
    >
      <NumberFieldContent>
        <NumberFieldDecrement />
        <NumberFieldInput />
        <NumberFieldIncrement />
      </NumberFieldContent>
    </NumberField>
  </div>
</template>
