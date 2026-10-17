<script setup lang="ts">
import type { CustomRenderType } from '../types';

import { CircleHelp } from '@vben-core/icons';
import {
  FormLabel,
  VbenButton,
  VbenRenderContent,
  VbenTooltip,
} from '@vben-core/shadcn-ui';
import { cn } from '@vben-core/shared/utils';

interface Props {
  class?: string;
  colon?: boolean;
  help?: CustomRenderType;
  label?: CustomRenderType;
  required?: boolean;
}

const props = defineProps<Props>();
</script>

<template>
  <div :class="cn('flex items-center', props.class)">
    <FormLabel class="flex items-center">
      <span v-if="required" class="mr-[2px] text-destructive">*</span>
      <slot></slot>
      <span v-if="colon && label" class="ml-[2px]">:</span>
    </FormLabel>
    <VbenTooltip
      v-if="help"
      :delay-duration="300"
      side="top"
      content-class="max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal break-words leading-5"
    >
      <template #trigger>
        <VbenButton
          type="button"
          variant="icon"
          size="icon"
          tabindex="0"
          :aria-label="typeof label === 'string' ? label : undefined"
          class="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp class="size-3.5" aria-hidden="true" />
        </VbenButton>
      </template>
      <VbenRenderContent :content="help" />
    </VbenTooltip>
  </div>
</template>
