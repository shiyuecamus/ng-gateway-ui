<script setup lang="ts">
import type {
  AppQueueQuotaCatalog,
  AppQueueQuotaChangeStatus,
  AppQueueQuotaEdit,
  AppQueueQuotaPreview,
  AppQueueQuotaRequest,
  AppQueueQuotaValues,
} from '#/api/core/resource-quota';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue';

import { Settings, X } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@vben-core/shadcn-ui';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  FormItem,
  Input,
  Select,
  Spin,
  Steps,
  Switch,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  changeAppQueueQuota,
  findAppQueueQuotaChange,
  getAppQueueQuotaCatalog,
  previewAppQueueQuota,
} from '#/api/core/resource-quota';
import { requestId } from '#/shared/request-id';

import { amount, quotaText } from './presentation';

const props = defineProps<{
  active: boolean;
  appId: string;
  appName: string;
}>();
const emit = defineEmits<{ changed: [] }>();
const user = useUserStore();

type Field = keyof AppQueueQuotaValues;
type FieldValue = AppQueueQuotaValues[Field];

const keys = {
  blockDuration: 'block_duration',
  bufferCapacity: 'buffer_capacity',
  bufferEnabled: 'buffer_enabled',
  bufferExpireMs: 'buffer_expire_ms',
  capacity: 'capacity',
  deliveryMaxInFlight: 'delivery_max_in_flight',
  deliveryMaxPayloadBytes: 'delivery_max_payload_bytes',
  deliveryRetryMs: 'delivery_retry_ms',
  deliveryTimeoutMs: 'delivery_timeout_ms',
  dropPolicy: 'drop_policy',
  latestCapacity: 'latest_capacity',
  latestMaxBytes: 'latest_max_bytes',
  replyCapacity: 'reply_capacity',
  replyMaxBytes: 'reply_max_bytes',
  replyMaxInFlight: 'reply_max_in_flight',
} as const satisfies Record<Field, keyof AppQueueQuotaEdit['patch']>;

const groups: { fields: Field[]; key: string }[] = [
  {
    key: 'ordinary',
    fields: [
      'capacity',
      'latestCapacity',
      'latestMaxBytes',
      'deliveryMaxInFlight',
    ],
  },
  {
    key: 'reply',
    fields: ['replyCapacity', 'replyMaxBytes', 'replyMaxInFlight'],
  },
  {
    key: 'delivery',
    fields: ['deliveryMaxPayloadBytes', 'deliveryTimeoutMs', 'deliveryRetryMs'],
  },
  {
    key: 'buffer',
    fields: [
      'dropPolicy',
      'blockDuration',
      'bufferEnabled',
      'bufferCapacity',
      'bufferExpireMs',
    ],
  },
];
const fields = groups.flatMap(({ fields }) => fields);
const revisionFormat = /^[1-9]\d{0,18}$/;
const amountFormat = /^(?:0|[1-9]\d{0,19})$/;
const uuidFormat = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const maxAmount = 18_446_744_073_709_551_615n;

const source = shallowRef<AppQueueQuotaCatalog>();
const stored = shallowRef<AppQueueQuotaRequest>();
const result = shallowRef<AppQueueQuotaChangeStatus>();
const knownRejected = ref(false);
const receiptMissing = ref(false);
const draft = shallowRef<AppQueueQuotaValues>();
const draftRevision = ref('');
const reviewed = shallowRef<AppQueueQuotaPreview>();
const editBeingReviewed = shallowRef<AppQueueQuotaEdit>();
const open = ref(false);
const checking = ref(false);
const submitting = ref(false);
const loading = ref(false);
const fault = ref('');
const reviewHeading = ref<HTMLElement>();
const operationHeading = ref<HTMLElement>();
const editorEntry = ref<HTMLElement>();
let opener: HTMLElement | null = null;
let closeToReceipt = false;
let disposed = false;
let catalogEpoch = 0;

const storageKey = computed(() => {
  const owner = user.userInfo?.id;
  return owner === undefined || owner === null
    ? undefined
    : `ng-gateway:app-queue-change:${String(owner)}:${props.appId}`;
});
const receipt = computed(() => result.value?.receipt);
const receiptTone = computed(() => {
  const phase = receipt.value?.phase;
  if (phase === 'APPLIED') return 'success';
  if (phase === 'SAVED_DISABLED') return 'blue';
  if (phase === 'APPLY_FAILED' || phase === 'AUTHORITY_CHANGED') return 'error';
  return 'gold';
});
const versionChanged = computed(
  () => open.value && draftRevision.value !== source.value?.desiredRevision,
);
const busy = computed(() => submitting.value || checking.value);
const unsettled = computed(() => {
  if (!stored.value) return false;
  return (
    !receipt.value ||
    (!result.value?.running &&
      ['DESIRED_COMMITTED', 'VERIFICATION_PENDING'].includes(
        receipt.value.phase,
      ))
  );
});
const canReviewAgain = computed(
  () =>
    knownRejected.value &&
    receiptMissing.value &&
    !receipt.value &&
    source.value?.canPreview === true,
);
const invalid = computed(() =>
  draft.value
    ? fields.filter((field) => {
        const value = draft.value?.[field];
        return (
          typeof value === 'string' &&
          (!amountFormat.test(value) || BigInt(value) > maxAmount)
        );
      })
    : [],
);
const modified = computed(() =>
  fields.filter(
    (field) =>
      draft.value && draft.value[field] !== source.value?.configured[field],
  ),
);
const previewDelta = computed(() =>
  reviewed.value
    ? fields.filter(
        (field) =>
          reviewed.value?.configured[field] !== reviewed.value?.desired[field],
      )
    : [],
);

function text(key: string) {
  return quotaText(`apps.editor.${key}`);
}

function showValue(field: Field, value: FieldValue | undefined) {
  if (typeof value === 'boolean') return text(value ? 'enabled' : 'disabled');
  if (field === 'dropPolicy') return text(value === 0 ? 'discard' : 'block');
  return amount(typeof value === 'string' ? value : undefined);
}

function setField(field: Field, value: FieldValue) {
  if (!draft.value) return;
  draft.value = { ...draft.value, [field]: value };
  reviewed.value = undefined;
  editBeingReviewed.value = undefined;
  fault.value = '';
}

function chooseDrop(value: unknown) {
  if (value === 0 || value === 1) setField('dropPolicy', value);
}

function unitFor(field: Field) {
  if (field === 'dropPolicy' || field === 'bufferEnabled') return undefined;
  if (field.endsWith('Bytes')) return quotaText('units.bytes');
  if (field.endsWith('Ms') || field === 'blockDuration')
    return quotaText('units.milliseconds');
  return undefined;
}

function returnToDraft() {
  reviewed.value = undefined;
  editBeingReviewed.value = undefined;
}

function sameScope(appId: number) {
  return !disposed && String(appId) === props.appId;
}

async function loadSource() {
  const version = ++catalogEpoch;
  loading.value = true;
  try {
    const found = await getAppQueueQuotaCatalog(props.appId);
    if (version === catalogEpoch && sameScope(found.appId)) {
      source.value = found;
      return true;
    }
  } catch {
    if (!disposed && version === catalogEpoch)
      fault.value = text('catalogUnavailable');
  } finally {
    if (!disposed && version === catalogEpoch) loading.value = false;
  }
  return false;
}

function rehydrate() {
  const key = storageKey.value;
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const request: AppQueueQuotaRequest & { knownRejected?: boolean } =
      JSON.parse(raw);
    const patch = request.edit?.patch;
    if (
      !uuidFormat.test(request.requestId) ||
      !revisionFormat.test(request.edit?.expectedRevision) ||
      !patch ||
      typeof patch !== 'object' ||
      Array.isArray(patch) ||
      Object.keys(patch).length === 0
    ) {
      fault.value = text('receiptUnavailable');
      return;
    }
    stored.value = { edit: request.edit, requestId: request.requestId };
    knownRejected.value = request.knownRejected === true;
  } catch {
    fault.value = text('receiptUnavailable');
  }
}

function validateReceipt(
  value: AppQueueQuotaChangeStatus,
  request: AppQueueQuotaRequest,
) {
  return (
    sameScope(value.receipt.appId) &&
    value.receipt.requestId === request.requestId &&
    value.receipt.edit.expectedRevision === request.edit.expectedRevision &&
    Object.keys(request.edit.patch).length ===
      Object.values(value.receipt.edit.patch).filter(
        (value) => value !== null && value !== undefined,
      ).length &&
    Object.entries(request.edit.patch).every(
      ([key, amount]) =>
        value.receipt.edit.patch[key as keyof AppQueueQuotaEdit['patch']] ===
        amount,
    )
  );
}

async function refreshReceipt() {
  const pending = stored.value;
  if (!pending || checking.value) return;
  checking.value = true;
  receiptMissing.value = false;
  fault.value = '';
  try {
    const found = await findAppQueueQuotaChange(props.appId, pending.requestId);
    if (disposed || stored.value !== pending) return;
    if (found && validateReceipt(found, pending)) {
      result.value = found;
      emit('changed');
      void loadSource();
    } else if (found === null) {
      receiptMissing.value = true;
      fault.value = text(
        knownRejected.value ? 'rejectedBeforeSave' : 'receiptNotFound',
      );
    } else {
      fault.value = text('receiptUnavailable');
    }
  } catch {
    if (!disposed) fault.value = text('receiptUnavailable');
  } finally {
    if (!disposed) checking.value = false;
  }
}

function openEditor() {
  if (!source.value?.canPreview || submitting.value || unsettled.value) return;
  opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  closeToReceipt = false;
  draft.value = { ...source.value.configured };
  draftRevision.value = source.value.desiredRevision;
  reviewed.value = undefined;
  editBeingReviewed.value = undefined;
  fault.value = '';
  open.value = true;
}

function review() {
  if (
    checking.value ||
    versionChanged.value ||
    !source.value?.canPreview ||
    !draft.value ||
    invalid.value.length > 0 ||
    modified.value.length === 0
  )
    return;
  const edit: AppQueueQuotaEdit = {
    expectedRevision: source.value.desiredRevision,
    patch: Object.fromEntries(
      modified.value.map((field) => [keys[field], draft.value?.[field]]),
    ),
  };
  checking.value = true;
  fault.value = '';
  void (async () => {
    try {
      const next = await previewAppQueueQuota(props.appId, edit);
      if (!sameScope(next.appId) || !open.value) return;
      if (next.expectedRevision !== source.value?.desiredRevision) {
        fault.value = text('versionChanged');
        return;
      }
      reviewed.value = next;
      editBeingReviewed.value = edit;
      await nextTick();
      reviewHeading.value?.focus();
    } catch (error) {
      if (!disposed) {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        fault.value = text(status === 409 ? 'versionChanged' : 'reviewFailed');
        if (status === 409) void loadSource();
      }
    } finally {
      if (!disposed) checking.value = false;
    }
  })();
}

async function send(request: AppQueueQuotaRequest) {
  const owner = storageKey.value;
  if (!owner || submitting.value || !source.value?.canChange) return;
  submitting.value = true;
  fault.value = '';
  try {
    const value = await changeAppQueueQuota(props.appId, request);
    if (owner !== storageKey.value || stored.value !== request || disposed)
      return;
    if (!validateReceipt(value, request))
      throw new Error('Scope receipt did not match');
    result.value = value;
    emit('changed');
    void loadSource();
  } catch (error) {
    if (!disposed && owner === storageKey.value && stored.value === request) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409 || status === 422 || status === 400) {
        try {
          localStorage.setItem(
            owner,
            JSON.stringify({ ...request, knownRejected: true }),
          );
          knownRejected.value = true;
        } catch {
          // Keep the original request as unresolved if the rejection could not be retained.
          knownRejected.value = false;
        }
      }
      await refreshReceipt();
    }
  } finally {
    if (!disposed) {
      submitting.value = false;
      await nextTick();
      operationHeading.value?.focus({ preventScroll: true });
    }
  }
}

function submit() {
  const owner = storageKey.value;
  const edit = editBeingReviewed.value;
  if (
    !reviewed.value ||
    !edit ||
    !source.value?.canChange ||
    !owner ||
    edit.expectedRevision !== source.value.desiredRevision ||
    busy.value
  ) {
    return;
  }
  const request: AppQueueQuotaRequest = { edit, requestId: requestId() };
  try {
    localStorage.setItem(owner, JSON.stringify(request));
  } catch {
    fault.value = text('cannotRetain');
    return;
  }
  stored.value = request;
  result.value = undefined;
  knownRejected.value = false;
  receiptMissing.value = false;
  closeToReceipt = true;
  open.value = false;
  void send(request);
}

async function reviewAgain() {
  const key = storageKey.value;
  const rejected = stored.value;
  if (!key || !rejected || !canReviewAgain.value || busy.value) return;
  if (
    !(await loadSource()) ||
    disposed ||
    stored.value !== rejected ||
    key !== storageKey.value
  )
    return;
  try {
    localStorage.removeItem(key);
  } catch {
    fault.value = text('cannotRetain');
    return;
  }
  stored.value = undefined;
  result.value = undefined;
  knownRejected.value = false;
  receiptMissing.value = false;
  openEditor();
}

function closeEditor() {
  open.value = false;
}

function restoreFocus(event: Event) {
  event.preventDefault();
  if (closeToReceipt) {
    operationHeading.value?.focus({ preventScroll: true });
  } else {
    const target =
      opener?.isConnected && !opener.matches(':disabled')
        ? opener
        : editorEntry.value?.querySelector('button');
    target?.focus({ preventScroll: true });
  }
  opener = null;
}

watch(
  [() => props.active, storageKey],
  ([active, key], previous) => {
    if (previous[1] !== key) {
      catalogEpoch++;
      stored.value = undefined;
      result.value = undefined;
      knownRejected.value = false;
      receiptMissing.value = false;
      source.value = undefined;
      open.value = false;
    }
    if (!active) return;
    void loadSource();
    if (!stored.value) rehydrate();
    if (stored.value && unsettled.value) void refreshReceipt();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
  catalogEpoch++;
});
</script>

<template>
  <section class="space-y-2" :aria-label="text('title')">
    <div
      v-if="source?.canPreview"
      ref="editorEntry"
      class="flex flex-wrap items-center gap-2"
    >
      <Button
        size="small"
        :disabled="busy || unsettled || loading"
        @click="openEditor"
      >
        <template #icon><Settings :size="14" aria-hidden="true" /></template>
        {{ text('adjust') }}
      </Button>
    </div>

    <Alert v-if="fault && !open" type="warning" show-icon :message="fault" />

    <Card v-if="stored" size="small" class="min-w-0">
      <template #title>
        <div class="flex flex-wrap items-center gap-2">
          <h3
            ref="operationHeading"
            tabindex="-1"
            class="m-0 text-sm font-semibold"
          >
            {{ text('operation') }}
          </h3>
          <Tag class="quota-tag !m-0" :color="receiptTone" role="status">
            {{
              text(
                receipt
                  ? `phases.${receipt.phase}`
                  : canReviewAgain
                    ? 'noCommitLabel'
                    : 'unconfirmed',
              )
            }}
          </Tag>
          <Tag v-if="result?.running" color="success" class="quota-tag !m-0">
            {{ text('runningConfirmed') }}
          </Tag>
        </div>
      </template>
      <Descriptions
        v-if="receipt"
        :colon="false"
        :column="{ xs: 1, sm: 2 }"
        size="small"
      >
        <DescriptionsItem :label="quotaText('operationId')">
          <TypographyText
            code
            :copyable="{ text: receipt.operationId }"
            :title="receipt.operationId"
          >
            {{ receipt.operationId.slice(0, 8) }}
          </TypographyText>
        </DescriptionsItem>
        <DescriptionsItem :label="quotaText('apps.desiredRevision')">
          {{ amount(receipt.desiredRevision) }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="result?.running"
          :label="quotaText('apps.runningRevision')"
        >
          {{ amount(result.running.policyRevision) }}
        </DescriptionsItem>
      </Descriptions>
      <div v-if="unsettled" class="flex flex-wrap gap-2">
        <Button
          type="link"
          size="small"
          :loading="checking"
          :disabled="submitting"
          @click="refreshReceipt"
        >
          {{ text('lookup') }}
        </Button>
        <Button
          v-if="canReviewAgain"
          size="small"
          :disabled="busy || loading"
          @click="reviewAgain"
        >
          {{ text('reviewAgain') }}
        </Button>
        <Button
          v-else-if="!receipt && source?.canChange"
          size="small"
          :loading="submitting"
          :disabled="checking"
          @click="send(stored)"
        >
          {{ text('retry') }}
        </Button>
      </div>
    </Card>

    <Sheet
      :open="open"
      modal
      @update:open="
        (value) => {
          if (!value) closeEditor();
        }
      "
    >
      <SheetContent
        :open="open"
        modal
        side="right"
        :z-index="1000"
        @close-auto-focus="restoreFocus"
        class="!flex !h-full !w-full min-w-0 !max-w-full flex-col gap-0 !p-0 sm:!max-w-2xl"
      >
        <SheetHeader
          class="relative shrink-0 border-b border-border px-4 py-3 text-left sm:px-6"
        >
          <SheetTitle>{{ text('title') }}</SheetTitle>
          <SheetDescription>{{ appName }}</SheetDescription>
          <Button
            class="!absolute right-3 top-3"
            type="text"
            :aria-label="text('close')"
            @click="closeEditor"
          >
            <template #icon><X :size="16" aria-hidden="true" /></template>
          </Button>
        </SheetHeader>
        <div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
          <Steps
            :current="reviewed ? 1 : 0"
            :items="[
              { title: quotaText('editStep') },
              { title: quotaText('reviewStep') },
            ]"
            size="small"
          />
          <Alert
            v-if="fault || versionChanged"
            type="warning"
            show-icon
            :message="versionChanged ? text('versionChanged') : fault"
          />
          <template v-if="reviewed">
            <h2
              ref="reviewHeading"
              tabindex="-1"
              class="m-0 text-base font-semibold"
            >
              {{ quotaText('reviewSummary') }}
            </h2>
            <Alert
              show-icon
              :type="reviewed.effect === 'SAVED_DISABLED' ? 'info' : 'warning'"
              :message="text(`effects.${reviewed.effect}`)"
            />
            <Descriptions
              :colon="false"
              :column="{ xs: 1, sm: 2 }"
              size="small"
            >
              <DescriptionsItem :label="quotaText('apps.desiredRevision')">
                {{ amount(reviewed.expectedRevision) }}
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('apps.runningRevision')">
                {{ amount(reviewed.runtime?.configurationRevision) }}
              </DescriptionsItem>
            </Descriptions>
            <Descriptions
              v-for="field in previewDelta"
              :key="field"
              :title="text(`fields.${field}`)"
              :colon="false"
              :column="2"
              layout="vertical"
              bordered
              size="small"
            >
              <DescriptionsItem :label="text('storedValue')">
                {{ showValue(field, reviewed.configured[field]) }}
                {{ unitFor(field) }}
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('newTarget')">
                <strong>{{ showValue(field, reviewed.desired[field]) }}</strong>
                {{ unitFor(field) }}
              </DescriptionsItem>
            </Descriptions>
            <Alert
              v-if="!source?.canChange"
              show-icon
              type="info"
              :message="text('activationPermission')"
            />
          </template>
          <Spin v-else :spinning="loading">
            <div v-if="draft" class="space-y-4">
              <Card
                v-for="group in groups"
                :key="group.key"
                :title="text(`groups.${group.key}`)"
                size="small"
              >
                <div class="grid gap-x-3 sm:grid-cols-2">
                  <FormItem
                    v-for="field in group.fields"
                    :key="field"
                    :label="text(`fields.${field}`)"
                    :validate-status="
                      invalid.includes(field) ? 'error' : undefined
                    "
                  >
                    <Switch
                      v-if="field === 'bufferEnabled'"
                      :checked="draft.bufferEnabled"
                      :disabled="busy || versionChanged"
                      :aria-label="text(`fields.${field}`)"
                      @change="(value) => setField(field, !!value)"
                    />
                    <Select
                      v-else-if="field === 'dropPolicy'"
                      :value="draft.dropPolicy"
                      :disabled="busy || versionChanged"
                      :aria-label="text(`fields.${field}`)"
                      :options="[
                        { value: 0, label: text('discard') },
                        { value: 1, label: text('block') },
                      ]"
                      @change="chooseDrop"
                    />
                    <Input
                      v-else
                      :value="String(draft[field])"
                      inputmode="numeric"
                      :maxlength="20"
                      :suffix="unitFor(field)"
                      :disabled="busy || versionChanged"
                      :aria-label="text(`fields.${field}`)"
                      :aria-invalid="invalid.includes(field)"
                      @update:value="(value) => setField(field, value)"
                    />
                  </FormItem>
                </div>
              </Card>
            </div>
          </Spin>
        </div>
        <footer
          class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-6"
        >
          <template v-if="reviewed">
            <Button :disabled="busy" @click="returnToDraft">
              {{ quotaText('backToEdit') }}
            </Button>
            <Button
              type="primary"
              :disabled="busy || versionChanged || !source?.canChange"
              @click="submit"
            >
              {{
                text(
                  reviewed.effect === 'SAVED_DISABLED'
                    ? 'saveOnly'
                    : 'saveAndActivate',
                )
              }}
            </Button>
          </template>
          <Button
            v-else
            type="primary"
            :loading="checking"
            :disabled="
              versionChanged ||
              invalid.length > 0 ||
              modified.length === 0 ||
              !source?.canPreview
            "
            @click="review"
          >
            {{ quotaText('preview') }}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  </section>
</template>
