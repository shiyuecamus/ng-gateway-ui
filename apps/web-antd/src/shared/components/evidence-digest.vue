<script setup lang="ts">
import { computed } from 'vue';

import { TypographyText } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{ compact?: boolean; value: string }>(),
  { compact: true },
);
/** Presentation shortening never changes the copied immutable source identity. */
const display = computed(() =>
  props.compact && props.value.length > 24
    ? `${props.value.slice(0, 12)}…${props.value.slice(-8)}`
    : props.value,
);
</script>

<template>
  <TypographyText
    :copyable="{ text: value }"
    :title="value"
    class="!m-0 break-all font-mono text-xs"
  >
    {{ display }}
  </TypographyText>
</template>
