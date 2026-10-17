<script setup lang="ts">
import type { ControlDetails } from '#/api/core/control';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { JsonViewer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  Input,
  Timeline,
  TimelineItem,
} from 'ant-design-vue';

import {
  cancelControl,
  getControlOperation,
  isControlPending,
  reconcileControl,
} from '#/api/core/control';

import { generateControlIdempotencyKey } from './intent';
import StateTag from './state-tag.vue';

const props = defineProps<{ canReconcile: boolean; operationId: string }>();
const details = ref<ControlDetails>();
const error = ref('');
const reason = ref('');
const evidence = ref('');
const busy = ref(false);
const acknowledgedFingerprint = ref('');
const cancelReason = ref('');
const maxCancelReasonBytes = 512;
const validCancellationReason = computed(() => {
  const value = cancelReason.value.trim();
  return (
    value.length > 0 &&
    !/\p{Cc}/u.test(value) &&
    new TextEncoder().encode(value).byteLength <= maxCancelReasonBytes
  );
});
const cancelAcknowledged = ref('');
const cancelAttempt = ref<null | {
  fingerprint: string;
  id: string;
  key: string;
  reason: string;
}>(null);
let cancellationRequest: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
const state = computed(() => details.value?.operation.state);
const target = computed(() => {
  const snapshot = details.value?.operation.targetSnapshot;
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : {};
});

async function refresh(expected = generation) {
  try {
    const response = await getControlOperation(props.operationId);
    if (expected !== generation) return;
    details.value = response;
    error.value = '';
    if (
      isControlPending(response.operation.state) ||
      response.operation.state === 'indeterminate'
    ) {
      timer = setTimeout(() => void refresh(expected), 1000);
    }
  } catch (error_) {
    if (expected === generation) error.value = String(error_);
  }
}

async function requestCancellation() {
  const original = details.value?.operation;
  if (
    !original ||
    !details.value?.canCancel ||
    cancelAcknowledged.value !== original.fingerprint ||
    !validCancellationReason.value ||
    busy.value
  )
    return;
  const expected = generation;
  const attempt = cancelAttempt.value ?? {
    id: original.operationId,
    fingerprint: original.fingerprint,
    key: generateControlIdempotencyKey(),
    reason: cancelReason.value.trim(),
  };
  cancelAttempt.value = attempt;
  const controller = new AbortController();
  cancellationRequest = controller;
  busy.value = true;
  try {
    await cancelControl(
      attempt.id,
      attempt.fingerprint,
      attempt.key,
      attempt.reason,
      controller.signal,
    );
    if (expected !== generation || controller.signal.aborted) return;
    clearTimeout(timer);
    await refresh(expected);
  } catch (error_) {
    if (expected === generation && !controller.signal.aborted)
      error.value = String(error_);
  } finally {
    if (expected === generation && cancellationRequest === controller) {
      busy.value = false;
      cancellationRequest = null;
    }
  }
}

async function reconcile() {
  const original = details.value?.operation;
  if (
    !original ||
    acknowledgedFingerprint.value !== original.fingerprint ||
    !reason.value.trim() ||
    !evidence.value.trim() ||
    busy.value
  )
    return;
  const expected = generation;
  busy.value = true;
  try {
    await reconcileControl(
      original.operationId,
      original.fingerprint,
      reason.value,
      {
        operatorVerification: evidence.value,
      },
    );
    if (expected === generation) {
      clearTimeout(timer);
      await refresh(expected);
    }
  } catch (error_) {
    if (expected === generation) error.value = String(error_);
  } finally {
    if (expected === generation) busy.value = false;
  }
}

function reload() {
  clearTimeout(timer);
  void refresh(++generation);
}

watch(
  () => props.operationId,
  () => {
    details.value = undefined;
    busy.value = false;
    error.value = '';
    acknowledgedFingerprint.value = '';
    cancelAcknowledged.value = '';
    cancelReason.value = '';
    cancelAttempt.value = null;
    cancellationRequest?.abort();
    cancellationRequest = null;
    reason.value = '';
    evidence.value = '';
    reload();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cancellationRequest?.abort();
  generation++;
  clearTimeout(timer);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <StateTag v-if="state" :state="state" />
      <code class="break-all text-xs">{{ operationId }}</code>
      <Button size="small" @click="reload">
        {{ $t('page.control.refresh') }}
      </Button>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Alert
      v-if="state === 'indeterminate'"
      type="warning"
      show-icon
      :message="$t('page.control.unknownHint')"
    />
    <Alert
      v-if="state === 'releasePendingLate'"
      type="warning"
      show-icon
      :message="$t('page.control.releasePendingLateHint')"
    />
    <template v-if="details">
      <Card size="small" :title="$t('page.control.originalTarget')">
        <p class="mb-2 font-medium">
          {{ target.channelName }} / {{ target.deviceName }} /
          {{
            target.pointName ??
            target.actionName ??
            target.pointKey ??
            target.command
          }}
        </p>
        <Descriptions :column="{ xs: 1, sm: 2 }" size="small" class="mb-4">
          <DescriptionsItem :label="$t('page.control.channel')">
            {{ details.operation.channelId }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.control.device')">
            {{ details.operation.deviceId }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.control.configuration')">
            {{ details.operation.configurationRevision }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.control.authorityId')">
            <code class="break-all text-xs">{{
              details.operation.binding.authorityId
            }}</code>
          </DescriptionsItem>
        </Descriptions>
        <JsonViewer
          :value="details.operation.targetSnapshot"
          :sort="false"
          boxed
        />
        <h4 class="my-2">{{ $t('page.control.claimedScope') }}</h4>
        <JsonViewer
          :value="details.operation.binding.footprints"
          :sort="false"
          boxed
        />
        <h4 class="my-2">{{ $t('page.control.originalRequest') }}</h4>
        <JsonViewer
          :value="details.operation.clientRequest"
          :sort="false"
          boxed
        />
      </Card>
      <Card size="small" :title="$t('page.control.protocolEvidence')">
        <Timeline>
          <TimelineItem
            v-for="event in details.events"
            :key="event.sequence"
            :color="
              event.state === 'protocolSucceeded'
                ? 'green'
                : event.state === 'protocolRejected'
                  ? 'red'
                  : 'blue'
            "
          >
            <div class="flex flex-wrap items-center gap-2">
              <span v-if="event.cancellation" class="text-sm font-medium">
                {{ $t('page.control.cancelRequest') }}
              </span>
              <StateTag v-else :state="event.state" />
              <time
                :datetime="event.recordedAt"
                class="text-xs text-muted-foreground"
              >
                <span>{{ event.recordedAt }}</span>
              </time>
            </div>
            <p class="mt-1 break-words text-sm">{{ event.reason }}</p>
            <JsonViewer
              v-if="event.cancellation"
              :value="event.cancellation"
              :sort="false"
              boxed
            />
            <JsonViewer
              v-if="event.evidence !== null"
              :value="event.evidence"
              :sort="false"
              boxed
            />
          </TimelineItem>
        </Timeline>
      </Card>
      <Card
        v-if="details.operation.cancellation"
        size="small"
        :title="$t('page.control.cancelRequest')"
        role="region"
        :aria-label="$t('page.control.cancelRequest')"
      >
        <Alert
          type="info"
          show-icon
          :message="$t('page.control.cancelRecorded')"
        />
        <JsonViewer
          :value="details.operation.cancellation"
          :sort="false"
          boxed
        />
      </Card>
      <Card
        v-if="details.canCancel"
        size="small"
        :title="$t('page.control.cancelControl')"
        role="region"
        :aria-label="$t('page.control.cancelControl')"
      >
        <Form layout="vertical" :disabled="busy">
          <Alert
            type="warning"
            show-icon
            :message="$t('page.control.cancelHint')"
          />
          <Checkbox
            :checked="cancelAcknowledged === details.operation.fingerprint"
            @update:checked="
              (checked) =>
                (cancelAcknowledged = checked
                  ? details!.operation.fingerprint
                  : '')
            "
          >
            {{ $t('page.control.confirmOriginalTarget') }}
          </Checkbox>
          <FormItem
            :label="$t('page.control.cancelReason')"
            :validate-status="
              cancelReason && !validCancellationReason ? 'error' : undefined
            "
            :help="
              cancelReason && !validCancellationReason
                ? $t('page.control.cancelReasonInvalid', {
                    maxBytes: maxCancelReasonBytes,
                  })
                : undefined
            "
            class="mt-4"
          >
            <Input
              v-model:value="cancelReason"
              :aria-label="$t('page.control.cancelReason')"
              :maxlength="maxCancelReasonBytes"
              :disabled="busy || cancelAttempt !== null"
            />
          </FormItem>
          <code
            v-if="cancelAttempt"
            class="block break-all text-xs"
            v-text="cancelAttempt.key"
          ></code>
          <Button
            danger
            :loading="busy"
            :disabled="
              cancelAcknowledged !== details.operation.fingerprint ||
              !validCancellationReason
            "
            @click="requestCancellation"
          >
            {{ $t('page.control.requestCancel') }}
          </Button>
        </Form>
      </Card>
      <Card size="small" :title="$t('page.control.observation')">
        <JsonViewer
          v-if="details.currentObservation"
          :value="details.currentObservation"
          :sort="false"
          boxed
        />
        <Empty v-else :description="$t('page.control.noObservation')" />
      </Card>
      <Card
        size="small"
        :title="$t('page.control.reconcile')"
        v-if="
          (state === 'indeterminate' || state === 'releasePendingLate') &&
          canReconcile
        "
      >
        <Form layout="vertical" :disabled="busy">
          <p class="text-sm">{{ $t('page.control.reconcileHint') }}</p>
          <Checkbox
            :checked="acknowledgedFingerprint === details.operation.fingerprint"
            @update:checked="
              (checked) =>
                (acknowledgedFingerprint = checked
                  ? details!.operation.fingerprint
                  : '')
            "
          >
            {{ $t('page.control.confirmOriginalTarget') }}
          </Checkbox>
          <FormItem :label="$t('page.control.reason')" class="mt-4">
            <Input
              v-model:value="reason"
              :aria-label="$t('page.control.reason')"
              :maxlength="1000"
              :placeholder="$t('page.control.reason')"
            />
          </FormItem>
          <FormItem :label="$t('page.control.evidence')">
            <Input.TextArea
              v-model:value="evidence"
              :aria-label="$t('page.control.evidence')"
              :rows="4"
              :maxlength="8000"
              :placeholder="$t('page.control.evidence')"
            />
          </FormItem>
          <Button
            :loading="busy"
            :disabled="
              !reason.trim() ||
              !evidence.trim() ||
              acknowledgedFingerprint !== details.operation.fingerprint
            "
            @click="reconcile"
          >
            {{ $t('page.control.recordVerification') }}
          </Button>
        </Form>
      </Card>
    </template>
  </div>
</template>
