<script setup lang="ts">
import type { ControlState } from '#/api/core/control';

import { $t } from '@vben/locales';

import { Tag } from 'ant-design-vue';

defineProps<{ state: ControlState }>();

// Service acceptance and operator resolution do not prove physical execution.
const colors: Record<ControlState, string> = {
  awaitingTermination: 'processing',
  cancelled: 'default',
  dispatching: 'processing',
  expired: 'default',
  failedBeforeDispatch: 'error',
  indeterminate: 'warning',
  partialProtocolCompleted: 'warning',
  partialServiceAccepted: 'warning',
  protocolRejected: 'error',
  protocolSucceeded: 'success',
  registered: 'blue',
  releasePending: 'processing',
  releasePendingLate: 'warning',
  resolvedByOperator: 'purple',
  selected: 'cyan',
  serviceAccepted: 'warning',
};
</script>

<template>
  <Tag :color="colors[state]">{{ $t(`page.control.states.${state}`) }}</Tag>
</template>
