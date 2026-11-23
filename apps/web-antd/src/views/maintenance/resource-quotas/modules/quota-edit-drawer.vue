<script setup lang="ts">
import type {
  QuotaDescriptor,
  QuotaField,
  QuotaPreview,
  QuotaResource,
} from '#/api/core/resource-quota';

import { computed, nextTick, ref, useId, watch } from 'vue';

import { X } from '@vben/icons';

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
  Descriptions,
  DescriptionsItem,
  Form,
  FormItem,
  Input,
  Select,
  Steps,
  Tag,
} from 'ant-design-vue';

import {
  amount,
  pillForEffect,
  quotaFieldName,
  quotaText,
} from './presentation';
import { useWorkbookQuotaFields } from './use-workbook-quota-fields';

const props = defineProps<{
  afterDrain: boolean;
  bytesLabel: string;
  canConfirm: boolean;
  canPreview: boolean;
  editedCount: number;
  fault: string;
  fieldErrors: Partial<Record<QuotaField, string>>;
  fields: QuotaDescriptor[];
  focusReceiptOnClose: boolean;
  open: boolean;
  pendingLabel: string;
  preview?: QuotaPreview;
  resource: QuotaResource;
  resourceAccent: string;
  resourceColor: string;
  resourceName: string;
  restartDetail?: string;
  values: Partial<Record<QuotaField, string>>;
  working: boolean;
}>();
const emit = defineEmits<{
  back: [];
  change: [key: QuotaField, value: string];
  closed: [];
  confirm: [];
  preview: [];
  'update:open': [value: boolean];
}>();
const previewHeading = ref<HTMLElement>();
const editForm = ref<HTMLDivElement>();
const editGroupId = useId();
const { group, options, reveal, visibleFields } = useWorkbookQuotaFields(
  () => props.resource,
  () => props.fields,
);
const hiddenInvalid = computed(() => {
  if (options.value.length < 2) return undefined;
  const active = new Set(visibleFields.value.map((field) => field.key));
  return props.fields.find(
    (field) => props.fieldErrors[field.key] && !active.has(field.key),
  );
});

function workbookGroupPopupContainer(trigger: HTMLElement) {
  return trigger.parentElement ?? trigger;
}

async function revealInvalidField() {
  const field = hiddenInvalid.value;
  if (!field) return;
  reveal(field.key);
  await nextTick();
  document.querySelector<HTMLInputElement>(`#quota-edit-${field.key}`)?.focus();
}
const reducesChannelLimit = computed(() =>
  props.preview?.delta.some(
    ({ key, desired, effective }) =>
      key === 'ingress_max_channel_bytes' &&
      BigInt(desired) < BigInt(effective),
  ),
);
const projectedColumns = computed(() => {
  if (props.preview?.projectedPreflightAvailable !== undefined) return 2;
  const fields = [
    props.preview?.projectedPendingAvailable,
    props.preview?.projectedBytesAvailable,
    props.preview?.projectedExecutionAvailable,
  ];
  return Math.min(2, fields.filter((value) => value !== undefined).length);
});
const reviewUnit = computed(
  () =>
    new Map(
      props.fields
        .filter(({ unit }) => unit !== 'count')
        .map(({ key, unit }) => [key, quotaText(`units.${unit}`)]),
    ),
);
let trigger: HTMLElement | null = null;
const steps = computed(() => [
  { title: quotaText('editStep') },
  { title: quotaText('reviewStep') },
]);

watch(
  () => props.preview,
  async (next, previous) => {
    await nextTick();
    if (next) {
      previewHeading.value?.focus();
    } else if (previous && props.open) {
      const changed = props.fields.find(
        (field) =>
          props.values[field.key] !== undefined &&
          props.values[field.key] !== field.desired,
      );
      const input = changed
        ? editForm.value?.querySelector<HTMLElement>(
            `#quota-edit-${changed.key}`,
          )
        : undefined;
      (input ?? editForm.value)?.focus();
    }
  },
);

function fieldLabel(field: QuotaField) {
  return quotaFieldName(props.resource, field);
}

watch(
  () => props.open,
  (open) => {
    if (open) group.value = undefined;
    const active = document.activeElement;
    if (
      open &&
      active instanceof HTMLElement &&
      !active.closest('[role="dialog"]')
    ) {
      trigger = active;
    }
  },
  { flush: 'sync' },
);

function preventWhileWorking(event: Event) {
  if (props.working) event.preventDefault();
}

function focusEditor(event: Event) {
  if (!editForm.value) return;
  event.preventDefault();
  editForm.value.focus({ preventScroll: true });
}

function close(open: boolean) {
  if (!open && !props.working) emit('update:open', false);
}

function restoreFocus(event: Event) {
  event.preventDefault();
  if (
    !props.focusReceiptOnClose &&
    trigger?.isConnected &&
    !trigger.matches(':disabled')
  ) {
    trigger.focus();
  } else {
    emit('closed');
  }
  trigger = null;
}
</script>

<template>
  <Sheet :open="open" modal @update:open="close">
    <SheetContent
      :open="open"
      modal
      side="right"
      :z-index="1000"
      class="quota-editor flex h-dvh !w-full max-w-[620px] flex-col"
      :style="{ '--quota-editor-accent': resourceAccent }"
      @open-auto-focus="focusEditor"
      @close-auto-focus="restoreFocus"
      @escape-key-down="preventWhileWorking"
      @interact-outside="preventWhileWorking"
    >
      <SheetHeader
        class="quota-editor-header flex shrink-0 flex-row items-start justify-between border-b border-border px-4 py-4 sm:px-6"
      >
        <div class="min-w-0">
          <SheetTitle class="text-lg">{{ quotaText('adjust') }}</SheetTitle>
          <Tag :color="resourceColor" class="quota-tag !m-0 !mt-2">
            {{ resourceName }}
          </Tag>
        </div>
        <SheetDescription class="sr-only">
          {{ quotaText('editorDescription') }}
        </SheetDescription>
        <Button
          type="text"
          :aria-label="quotaText('closeEditor')"
          :disabled="working"
          @click="close(false)"
        >
          <template #icon><X :size="17" aria-hidden="true" /></template>
        </Button>
      </SheetHeader>
      <div
        class="quota-editor-body min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      >
        <Steps
          :items="steps"
          :current="preview ? 1 : 0"
          :responsive="false"
          size="small"
          class="quota-editor-steps mb-4"
        />
        <Alert
          v-if="fault"
          class="mb-4"
          show-icon
          type="warning"
          :message="fault"
        />
        <div v-if="preview" class="space-y-4">
          <h2
            ref="previewHeading"
            class="m-0 text-base font-semibold focus:outline-none"
            tabindex="-1"
          >
            {{ quotaText('reviewSummary') }}
          </h2>
          <Alert
            v-if="preview.requiresProcessRestart"
            show-icon
            type="info"
            :message="quotaText('quotaPolicyNeedsRestart')"
            :description="restartDetail"
          />
          <Alert
            v-else-if="afterDrain"
            show-icon
            :type="preview.requiresQueueDrain ? 'warning' : 'info'"
            :message="
              quotaText(
                preview.requiresQueueDrain
                  ? 'queueRequiresDrain'
                  : 'queueApplyNote',
              )
            "
          />
          <Alert
            v-else-if="preview.wouldDrain"
            show-icon
            type="warning"
            :message="quotaText('wouldDrain')"
          />
          <Alert
            v-if="reducesChannelLimit"
            show-icon
            type="info"
            :message="quotaText('channels.reductionTitle')"
            :description="quotaText('channels.reductionNote')"
          />
          <section
            v-for="item in preview.delta"
            :key="item.key"
            class="quota-review-field"
          >
            <div
              class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5"
            >
              <h3 class="m-0 text-sm font-semibold">
                {{ fieldLabel(item.key) }}
              </h3>
              <Tag
                class="quota-tag !m-0"
                :color="pillForEffect(item.effectMode)"
              >
                {{ quotaText(`modes.${item.effectMode}`) }}
              </Tag>
            </div>
            <Descriptions
              :colon="false"
              :column="2"
              class="quota-review-values"
              layout="vertical"
              size="small"
              bordered
            >
              <DescriptionsItem :label="quotaText('effective')">
                <span class="quota-review-number tabular-nums">
                  {{ amount(item.effective) }}
                  <span class="text-xs text-muted-foreground">{{
                    reviewUnit.get(item.key)
                  }}</span>
                </span>
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('newTarget')">
                <span
                  class="quota-review-number quota-review-target font-semibold tabular-nums"
                >
                  {{ amount(item.desired) }}
                  <span class="text-xs font-normal text-muted-foreground">{{
                    reviewUnit.get(item.key)
                  }}</span>
                </span>
              </DescriptionsItem>
            </Descriptions>
          </section>
          <Descriptions
            v-if="!preview.requiresProcessRestart && projectedColumns > 0"
            :colon="false"
            :title="quotaText('projectedHeadroom')"
            size="small"
            :column="projectedColumns"
            layout="vertical"
            bordered
          >
            <DescriptionsItem
              v-if="preview.projectedPreflightAvailable !== undefined"
              :label="quotaText('controlPreflightCount')"
            >
              {{ amount(preview.projectedPreflightAvailable) }}
            </DescriptionsItem>
            <DescriptionsItem
              v-if="preview.projectedPreflightBytesAvailable !== undefined"
              :label="quotaText('controlPreflightBytes')"
            >
              {{ amount(preview.projectedPreflightBytesAvailable) }}
              {{ quotaText('units.bytes') }}
            </DescriptionsItem>
            <DescriptionsItem
              v-if="preview.projectedPendingAvailable !== undefined"
              :label="pendingLabel"
            >
              {{ amount(preview.projectedPendingAvailable) }}
            </DescriptionsItem>
            <DescriptionsItem
              v-if="preview.projectedBytesAvailable !== undefined"
              :label="bytesLabel"
            >
              {{ amount(preview.projectedBytesAvailable) }}
              {{ quotaText('units.bytes') }}
            </DescriptionsItem>
            <DescriptionsItem
              v-if="preview.projectedExecutionAvailable !== undefined"
              :label="quotaText('executionSlots')"
            >
              {{ amount(preview.projectedExecutionAvailable) }}
            </DescriptionsItem>
          </Descriptions>
        </div>
        <div
          v-else
          ref="editForm"
          :aria-label="quotaText('editStep')"
          role="region"
          tabindex="-1"
        >
          <Form class="grid gap-4" layout="vertical" label-wrap>
            <div v-if="options.length > 1" class="grid gap-2">
              <label :for="editGroupId" class="text-sm font-medium">
                {{ quotaText('workbookEditGroup') }}
              </label>
              <Select
                :id="editGroupId"
                v-model:value="group"
                :aria-label="quotaText('workbookEditGroup')"
                :options="options"
                :disabled="working"
                :get-popup-container="workbookGroupPopupContainer"
                class="w-full"
              />
            </div>
            <Alert
              v-if="hiddenInvalid"
              :message="quotaText('workbookHiddenInvalid')"
              type="error"
              show-icon
            >
              <template #action>
                <Button size="small" @click="revealInvalidField">
                  {{ quotaText('workbookRevealInvalid') }}
                </Button>
              </template>
            </Alert>
            <FormItem
              v-for="field in visibleFields"
              :key="field.key"
              :colon="false"
              :html-for="`quota-edit-${field.key}`"
              :validate-status="fieldErrors[field.key] ? 'error' : undefined"
              class="quota-editor-field !mb-0"
            >
              <template #label>
                <span class="quota-editor-field__label">
                  <span>{{ fieldLabel(field.key) }}</span>
                  <Tag
                    :color="pillForEffect(field.effectMode)"
                    class="quota-tag !m-0"
                  >
                    {{ quotaText(`modes.${field.effectMode}`) }}
                  </Tag>
                </span>
              </template>
              <template #help>
                <span :id="`quota-edit-help-${field.key}`">
                  {{
                    fieldErrors[field.key] ||
                    quotaText('fieldRange', {
                      min: amount(field.min),
                      max: amount(field.max),
                      defaultValue: amount(field.default),
                    })
                  }}
                </span>
              </template>
              <Input
                :id="`quota-edit-${field.key}`"
                :aria-label="fieldLabel(field.key)"
                :aria-describedby="`quota-edit-help-${field.key}`"
                :aria-invalid="Boolean(fieldErrors[field.key])"
                :value="values[field.key] ?? field.desired"
                :disabled="working"
                :suffix="quotaText(`units.${field.unit}`)"
                :maxlength="20"
                inputmode="numeric"
                @update:value="
                  (value: string) => emit('change', field.key, value)
                "
                @press-enter="canPreview && !working && emit('preview')"
              />
            </FormItem>
          </Form>
        </div>
      </div>
      <footer
        class="quota-editor-footer flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-6"
      >
        <span
          v-if="!preview && editedCount > 0"
          class="quota-editor-edited mr-auto self-center text-xs text-muted-foreground"
          role="status"
        >
          {{ quotaText('editedFields', { count: editedCount }) }}
        </span>
        <Button v-if="preview" :disabled="working" @click="emit('back')">
          {{ quotaText('backToEdit') }}
        </Button>
        <Button v-else :disabled="working" @click="emit('update:open', false)">
          {{ quotaText('closeEditor') }}
        </Button>
        <Button
          v-if="preview"
          type="primary"
          :disabled="!canConfirm"
          :loading="working"
          @click="emit('confirm')"
        >
          {{
            quotaText(
              preview?.requiresProcessRestart ? 'saveForRestart' : 'save',
            )
          }}
        </Button>
        <Button
          v-else
          type="primary"
          :disabled="!canPreview"
          :loading="working"
          @click="emit('preview')"
        >
          {{ quotaText('preview') }}
        </Button>
      </footer>
    </SheetContent>
  </Sheet>
</template>

<style scoped>
.quota-editor-header {
  background: radial-gradient(
    ellipse at top left,
    color-mix(in srgb, var(--quota-editor-accent) 20%, hsl(var(--card))),
    hsl(var(--card)) 80%
  );
}

.quota-editor-header .quota-tag,
.quota-editor-field .quota-tag {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quota-editor-body {
  overscroll-behavior: contain;
}

.quota-editor-steps,
.quota-editor-field {
  padding: 0.8rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.quota-editor-field__label {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.6rem;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-weight: 550;
  overflow-wrap: anywhere;
}

.quota-editor-field :deep(.ant-form-item-label > label) {
  width: 100%;
  height: auto;
}

.quota-editor-field :deep(.ant-form-item-explain) {
  padding-block-start: 0.25rem;
}

.quota-review-field {
  padding: 0.85rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.quota-review-values {
  margin-block-start: 0.65rem;
}

.quota-review-values :deep(.ant-descriptions-item-label),
.quota-review-values :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}

.quota-review-number {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.1rem 0.35rem;
  align-items: baseline;
}

.quota-review-target {
  color: #235eac;
}

:global(.dark .quota-review-target) {
  color: #a4cbff;
}

.quota-editor-footer {
  padding-block-end: max(0.75rem, env(safe-area-inset-bottom));
  background: hsl(var(--card));
}

.quota-editor-footer :deep(.ant-btn) {
  min-height: 2.625rem;
}

@media (max-width: 430px) {
  .quota-editor-steps :deep(.ant-steps-item-title) {
    font-size: 0.8rem;
  }

  .quota-editor-edited {
    width: 100%;
  }
}
</style>
