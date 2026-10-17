<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui';

import type { StyleValue } from 'vue';

import type { ClassType } from '@vben-core/typings';

import { ref } from 'vue';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui';

interface Props {
  contentClass?: ClassType;
  contentStyle?: StyleValue;
  delayDuration?: number;
  side?: TooltipContentProps['side'];
}

withDefaults(defineProps<Props>(), {
  delayDuration: 0,
  side: 'right',
});

const open = ref(false);
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <Tooltip v-model:open="open">
      <TooltipTrigger as-child tabindex="-1" @keydown.esc.stop="open = false">
        <slot name="trigger"></slot>
      </TooltipTrigger>
      <TooltipContent
        :class="contentClass"
        :side="side"
        :style="contentStyle"
        class="side-content rounded-md bg-accent text-popover-foreground"
      >
        <slot></slot>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
