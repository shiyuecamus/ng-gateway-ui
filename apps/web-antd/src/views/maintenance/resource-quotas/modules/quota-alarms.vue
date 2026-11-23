<script setup lang="ts">
import type {
  ResourceAlarm,
  ResourceAlarmAction,
  ResourceAlarmAudit,
  ResourceAlarmPhase,
  ResourceAlarmRule,
  ResourceAlarmScope,
  ResourceAlarmView,
} from '#/api/core/resource-alarms';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Tag,
  Textarea,
  Timeline,
  TimelineItem,
  TypographyText,
} from 'ant-design-vue';

import {
  getResourceAlarmEvents,
  getResourceAlarmRuleEvents,
  getResourceAlarmRules,
  getResourceAlarms,
  recordResourceAlarmAction,
  updateResourceAlarmRule,
} from '#/api/core/resource-alarms';

import { amount, quotaText, sampleTime } from './presentation';

const props = defineProps<{ archived?: boolean; scope: ResourceAlarmScope }>();

const view = ref<ResourceAlarmView>();
const rules = ref<ResourceAlarmRule[]>([]);
const loading = ref(false);
const ready = ref(false);
const fresh = ref(false);
const message = ref('');
const selection = ref('active');
let sampler: ReturnType<typeof setInterval> | undefined;
let disposed = false;

const ruleEditor = ref<null | ResourceAlarmRule>(null);
const actionEditor = ref<null | {
  alarm: ResourceAlarm;
  kind: 'acknowledge' | 'silence';
}>(null);
const reason = ref('');
const minutes = ref(15);
const issuedAction = ref<ResourceAlarmAction>();
const busy = ref(false);
const modalFault = ref('');

const auditTitle = ref('');
const auditLoading = ref(false);
const auditFault = ref(false);
const auditEntries = ref<ResourceAlarmAudit[]>([]);
let auditVersion = 0;

const canManage = computed(
  () => !props.archived && fresh.value && !!view.value?.canManage,
);
const canAudit = computed(() => fresh.value && !!view.value?.canAudit);
const active = computed(() =>
  (view.value?.alarms ?? []).filter((alarm) => isActive(alarm.phase)),
);
const sampleCurrent = computed(
  () => fresh.value && !!view.value?.health.current,
);
const options = computed(() => [
  {
    label: sampleCurrent.value
      ? quotaText('alarms.activeCount', { count: active.value.length })
      : t('active'),
    value: 'active',
  },
  { label: t('recent'), value: 'recent' },
]);
const alarms = computed(() =>
  !props.archived && selection.value === 'active'
    ? active.value
    : (view.value?.alarms ?? []),
);
const latestRule = computed(() =>
  rules.value.find((rule) => rule.id === ruleEditor.value?.id),
);
const ruleIsStale = computed(
  () =>
    !!ruleEditor.value &&
    latestRule.value?.revision !== ruleEditor.value.revision,
);
const appSource = computed(
  () => props.scope.resource === 'northward_app_queue',
);
const managementSource = computed(
  () => props.scope.resource === 'quota_management',
);
const validRule = computed(() => {
  const rule = ruleEditor.value;
  if (!rule) return false;
  const whole = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  return (
    whole(rule.highThreshold, 2, rule.maximumThreshold) &&
    whole(rule.clearThreshold, 1, rule.highThreshold - 1) &&
    whole(Number(rule.fireAfterMs), 1000, 3_600_000) &&
    whole(Number(rule.recoverAfterMs), 1000, 3_600_000)
  );
});
const validReason = computed(() => {
  const text = reason.value.trim();
  return (
    text.length > 0 &&
    new TextEncoder().encode(text).length <= 256 &&
    ![...text].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || (code >= 127 && code <= 159);
    })
  );
});

function t(key: string) {
  return quotaText(`alarms.${key}`);
}

function isActive(phase: ResourceAlarmPhase) {
  return phase === 'PENDING' || phase === 'FIRING' || phase === 'ACKNOWLEDGED';
}

function tone(phase: ResourceAlarmPhase) {
  switch (phase) {
    case 'ACKNOWLEDGED': {
      return 'geekblue';
    }
    case 'FIRING': {
      return 'volcano';
    }
    case 'PENDING': {
      return 'gold';
    }
    case 'RECOVERED': {
      return 'success';
    }
    default: {
      return undefined;
    }
  }
}

function ruleFor(alarm: ResourceAlarm) {
  return rules.value.find(({ id }) => id === alarm.ruleId);
}

function ruleName(alarm: ResourceAlarm) {
  const rule = ruleFor(alarm);
  return rule ? t(`metric.${rule.metric}`) : `${t('rule')} ${alarm.ruleId}`;
}

function ruleSummary(rule: ResourceAlarmRule) {
  return [
    rule.enabled ? t('enabled') : t('disabled'),
    ruleCondition(rule, 'trigger'),
    ruleCondition(rule, 'recovery'),
  ].join(' · ');
}

function ruleCondition(
  rule: ResourceAlarmRule,
  condition: 'recovery' | 'trigger',
) {
  const triggering = condition === 'trigger';
  const value = threshold(
    rule,
    triggering ? rule.highThreshold : rule.clearThreshold,
  );
  const duration = amount(triggering ? rule.fireAfterMs : rule.recoverAfterMs);
  const relation = triggering ? '≥ ' : '< ';
  const conditionText =
    rule.thresholdUnit === 'state' ? value : `${relation}${value}`;
  return `${conditionText} · ${duration} ms`;
}

function activeSilence(alarm: ResourceAlarm) {
  return !!(
    sampleCurrent.value &&
    view.value?.health.sampledAt &&
    isActive(alarm.phase) &&
    alarm.silencedUntil &&
    Date.parse(alarm.silencedUntil) > Date.parse(view.value.health.sampledAt)
  );
}

function threshold(rule: ResourceAlarmRule, value: number) {
  if (rule.thresholdUnit === 'state') {
    return t(value === 2 ? 'statePresent' : 'stateCleared');
  }
  return rule.thresholdUnit === 'per_mille'
    ? `${value / 10}%`
    : `${amount(value.toString())} ${t(`unit.${rule.thresholdUnit}`)}`;
}

function thresholdLabel(
  rule: ResourceAlarmRule,
  key: 'clearThreshold' | 'highThreshold',
) {
  return `${t(key)} (${t(`unit.${rule.thresholdUnit}`)})`;
}

function timeAt(ms: string) {
  return new Date(Number(ms)).toLocaleString();
}

function auditDot(event: ResourceAlarmAudit['event']) {
  if (event.silencedUntil) return '#9254de';
  if (event.phase === 'FIRING') return 'red';
  if (event.phase === 'RECOVERED') return 'green';
  if (event.phase === 'PENDING') return '#d48806';
  return 'blue';
}

async function refresh() {
  if (loading.value || disposed) return;
  loading.value = true;
  try {
    const alarms = await getResourceAlarms(props.scope).catch(() => undefined);
    if (disposed) return;
    const configs = await getResourceAlarmRules(props.scope).catch(
      () => undefined,
    );
    if (disposed) return;
    // Alarm polling leaves the second management slot available to other requests.
    fresh.value = !!alarms && !!configs;
    if (props.archived && !fresh.value) {
      view.value = undefined;
      rules.value = [];
    } else {
      if (alarms) view.value = alarms;
      if (configs) rules.value = configs;
    }
    ready.value = true;
    if (!fresh.value) message.value = t('refreshFailed');
    if (fresh.value && message.value === t('refreshFailed')) message.value = '';
  } finally {
    loading.value = false;
  }
}
defineExpose({ refresh });

function openRule(rule: ResourceAlarmRule) {
  if (!canManage.value) return;
  modalFault.value = '';
  ruleEditor.value = { ...rule };
}

async function saveRule() {
  const rule = ruleEditor.value;
  if (
    !rule ||
    !validRule.value ||
    !canManage.value ||
    busy.value ||
    ruleIsStale.value
  )
    return;
  busy.value = true;
  modalFault.value = '';
  try {
    await updateResourceAlarmRule(props.scope, {
      ruleId: rule.id,
      expectedRevision: rule.revision,
      enabled: rule.enabled,
      highThreshold: rule.highThreshold,
      clearThreshold: rule.clearThreshold,
      fireAfterMs: rule.fireAfterMs,
      recoverAfterMs: rule.recoverAfterMs,
    });
    ruleEditor.value = null;
    message.value = t('ruleSaved');
    await refresh();
  } catch {
    modalFault.value = t('ruleFailed');
    await refresh();
  } finally {
    busy.value = false;
  }
}

function openAction(alarm: ResourceAlarm, kind: 'acknowledge' | 'silence') {
  if (!canManage.value) return;
  reason.value = '';
  minutes.value = 15;
  issuedAction.value = undefined;
  modalFault.value = '';
  actionEditor.value = { alarm, kind };
}

async function saveAction() {
  const editor = actionEditor.value;
  if (!editor || !canManage.value || !validReason.value || busy.value) return;
  const action = issuedAction.value ?? {
    acknowledge: editor.kind === 'acknowledge',
    reason: reason.value.trim(),
    silenceUntil:
      editor.kind === 'silence'
        ? new Date(Date.now() + minutes.value * 60_000).toISOString()
        : null,
  };
  issuedAction.value = action;
  busy.value = true;
  modalFault.value = '';
  try {
    await recordResourceAlarmAction(editor.alarm.id, action, props.scope);
    actionEditor.value = null;
    issuedAction.value = undefined;
    message.value = t('actionSaved');
    await refresh();
  } catch {
    modalFault.value = t('actionUnconfirmed');
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function showAudit(target: ResourceAlarm | ResourceAlarmRule) {
  if (!canAudit.value) return;
  const version = ++auditVersion;
  auditTitle.value = 'ruleId' in target ? t('audit') : t('ruleAudit');
  auditLoading.value = true;
  auditFault.value = false;
  auditEntries.value = [];
  try {
    const events = await ('ruleId' in target
      ? getResourceAlarmEvents(target.id, props.scope)
      : getResourceAlarmRuleEvents(target.id, props.scope));
    if (!disposed && version === auditVersion) auditEntries.value = events;
  } catch {
    if (!disposed && version === auditVersion) auditFault.value = true;
  } finally {
    if (version === auditVersion) auditLoading.value = false;
  }
}

function closeAudit() {
  auditVersion++;
  auditTitle.value = '';
  auditEntries.value = [];
}

watch(canAudit, (allowed) => {
  if (!allowed) closeAudit();
});

onMounted(() => {
  void refresh();
  sampler = setInterval(() => {
    if (!document.hidden && !busy.value) void refresh();
  }, 10_000);
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(sampler);
});
</script>

<template>
  <div class="grid min-w-0 gap-3">
    <Alert
      v-if="message"
      show-icon
      :type="fresh ? 'info' : 'warning'"
      :message="message"
    />
    <Card
      size="small"
      :title="
        t(
          archived
            ? 'appArchiveTitle'
            : appSource
              ? 'appTitle'
              : managementSource
                ? 'managementTitle'
                : 'extensionTitle',
        )
      "
    >
      <template #extra>
        <Tag
          v-if="view && !archived"
          class="quota-tag !m-0"
          :color="sampleCurrent ? 'success' : 'warning'"
        >
          {{ t(sampleCurrent ? 'sampleCurrent' : 'sampleStale') }}
        </Tag>
      </template>
      <Skeleton v-if="!ready" active :paragraph="{ rows: 2 }" />
      <template v-else>
        <Alert
          v-if="!archived && view?.health.persistenceUnavailable"
          show-icon
          type="error"
          class="mb-3"
          :message="t('persistenceUnavailable')"
        />
        <Alert
          v-if="!archived && view?.health.historySaturated"
          show-icon
          type="warning"
          class="mb-3"
          :message="t('historySaturated')"
        />
        <Alert
          v-if="!archived && view && !view.health.sourceAvailable"
          show-icon
          type="warning"
          class="mb-3"
          :message="
            t(
              appSource
                ? 'appSampleUnavailable'
                : managementSource
                  ? 'managementSampleUnavailable'
                  : 'sourceUnavailable',
            )
          "
        />
        <div v-if="!archived" class="mb-3 flex flex-wrap items-center gap-3">
          <Segmented v-model:value="selection" :options="options" />
          <span
            v-if="view?.health.sampledAt"
            class="text-xs text-muted-foreground"
          >
            {{ quotaText('sampledAt') }} {{ sampleTime(view.health.sampledAt) }}
          </span>
        </div>
        <Empty
          v-if="alarms.length === 0"
          :description="
            t(sampleCurrent || (archived && fresh) ? 'noMatching' : 'unknown')
          "
        />
        <div
          v-else
          class="grid gap-3"
          :class="{ 'xl:grid-cols-2': alarms.length > 1 }"
        >
          <Card
            v-for="alarm in alarms"
            :key="alarm.id"
            size="small"
            class="min-w-0"
          >
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <h3 class="m-0 text-sm font-semibold">{{ ruleName(alarm) }}</h3>
              <Tag
                v-if="ruleFor(alarm)?.severity"
                class="quota-tag !m-0"
                :color="
                  ruleFor(alarm)?.severity === 'critical' ? 'volcano' : 'gold'
                "
              >
                {{ t(`severity.${ruleFor(alarm)?.severity}`) }}
              </Tag>
              <Tag class="quota-tag !m-0" :color="tone(alarm.phase)">
                {{ t(`phase.${alarm.phase}`) }}
              </Tag>
              <Tag
                v-if="activeSilence(alarm)"
                class="quota-tag !m-0"
                color="purple"
              >
                {{ t('silenceActive') }}
              </Tag>
              <Tag
                v-if="sampleCurrent && isActive(alarm.phase) && alarm.recovery"
                class="quota-tag !m-0"
                color="processing"
              >
                {{ t('observingRecovery') }}
              </Tag>
            </div>
            <Descriptions
              bordered
              layout="vertical"
              :colon="false"
              :column="
                alarms.length === 1 ? { xs: 1, sm: 2, lg: 3 } : { xs: 1, sm: 2 }
              "
              size="small"
            >
              <DescriptionsItem :label="t('openedAt')">
                {{ sampleTime(alarm.openedAt) }}
              </DescriptionsItem>
              <DescriptionsItem :label="t('ruleRevision')">
                {{ amount(alarm.ruleRevision) }}
              </DescriptionsItem>
              <DescriptionsItem :label="quotaText('owner')">
                <TypographyText
                  code
                  :title="alarm.ownerId"
                  :copyable="{ text: alarm.ownerId }"
                >
                  {{ alarm.ownerId.slice(0, 8) }}
                </TypographyText>
              </DescriptionsItem>
              <DescriptionsItem v-if="alarm.acknowledgedBy" :label="t('actor')">
                {{ alarm.acknowledgedBy }}
              </DescriptionsItem>
              <DescriptionsItem
                v-if="alarm.silencedUntil"
                :label="t('silencedUntil')"
              >
                {{ sampleTime(alarm.silencedUntil) }}
              </DescriptionsItem>
              <DescriptionsItem
                v-if="
                  alarm.recovery &&
                  (isActive(alarm.phase) || alarm.phase === 'RECOVERED')
                "
                :label="t('recoveryBaseline')"
              >
                {{ amount(alarm.recovery.successfulHandoffsAtStart) }}
              </DescriptionsItem>
              <DescriptionsItem
                v-if="alarm.recoveredWithSuccessfulHandoffs"
                :label="t('recoveryWitness')"
              >
                {{ amount(alarm.recoveredWithSuccessfulHandoffs) }}
              </DescriptionsItem>
            </Descriptions>
            <div v-if="canManage || canAudit" class="mt-3 flex flex-wrap gap-2">
              <Button
                v-if="canManage && alarm.phase === 'FIRING'"
                size="small"
                @click="openAction(alarm, 'acknowledge')"
              >
                {{ t('acknowledge') }}
              </Button>
              <Button
                v-if="
                  canManage &&
                  (alarm.phase === 'FIRING' || alarm.phase === 'ACKNOWLEDGED')
                "
                size="small"
                @click="openAction(alarm, 'silence')"
              >
                {{ t('silence') }}
              </Button>
              <Button
                v-if="canAudit"
                type="link"
                class="!px-0"
                size="small"
                @click="showAudit(alarm)"
              >
                {{ t('audit') }}
              </Button>
            </div>
          </Card>
        </div>
      </template>
    </Card>
    <Card size="small" :title="t('rules')">
      <Skeleton v-if="!ready" active :paragraph="{ rows: 2 }" />
      <Empty v-else-if="rules.length === 0" :description="t('unknown')" />
      <template v-else>
        <p class="mb-3 text-sm text-muted-foreground">
          {{ t('recoveryRequirement') }}
        </p>
        <div class="grid gap-3" :class="{ 'xl:grid-cols-2': rules.length > 1 }">
          <Card
            v-for="rule in rules"
            :key="rule.id"
            size="small"
            class="min-w-0"
          >
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <h3 class="m-0 text-sm font-semibold">
                {{ t(`metric.${rule.metric}`) }}
              </h3>
              <Tag
                class="quota-tag !m-0"
                :color="rule.severity === 'critical' ? 'volcano' : 'gold'"
              >
                {{ t(`severity.${rule.severity}`) }}
              </Tag>
              <Tag v-if="!rule.enabled" class="quota-tag !m-0">
                {{ t('disabled') }}
              </Tag>
            </div>
            <Descriptions
              bordered
              layout="vertical"
              :colon="false"
              :column="
                rules.length === 1 ? { xs: 1, sm: 2, xl: 3 } : { xs: 1, sm: 2 }
              "
              size="small"
            >
              <DescriptionsItem :label="t('high')">
                {{ ruleCondition(rule, 'trigger') }}
              </DescriptionsItem>
              <DescriptionsItem :label="t('low')">
                {{ ruleCondition(rule, 'recovery') }}
              </DescriptionsItem>
              <DescriptionsItem :label="t('ruleRevision')">
                {{ amount(rule.revision) }}
              </DescriptionsItem>
            </Descriptions>
            <div v-if="canManage || canAudit" class="mt-3 flex flex-wrap gap-2">
              <Button v-if="canManage" size="small" @click="openRule(rule)">
                {{ t('editRule') }}
              </Button>
              <Button
                v-if="canAudit"
                size="small"
                type="link"
                class="!px-0"
                @click="showAudit(rule)"
              >
                {{ t('ruleAudit') }}
              </Button>
            </div>
          </Card>
        </div>
      </template>
    </Card>
  </div>

  <Modal
    :open="!!ruleEditor"
    :title="t('editRule')"
    :ok-text="t('saveRule')"
    :ok-button-props="{ disabled: !validRule || !canManage || ruleIsStale }"
    :confirm-loading="busy"
    :mask-closable="!busy"
    :keyboard="!busy"
    @ok="saveRule"
    @cancel="!busy && (ruleEditor = null)"
  >
    <template v-if="ruleEditor">
      <Alert
        v-if="ruleIsStale"
        type="warning"
        show-icon
        :message="t('ruleChangedWhileEditing')"
        class="mb-3"
      >
        <template #action>
          <Button
            v-if="latestRule"
            size="small"
            :disabled="!canManage"
            @click="openRule(latestRule)"
          >
            {{ t('loadLatestRule') }}
          </Button>
        </template>
      </Alert>
      <Alert
        v-else-if="modalFault"
        type="warning"
        show-icon
        :message="modalFault"
        class="mb-3"
      />
      <Form layout="vertical" @finish="saveRule">
        <FormItem
          :label="t('enabled')"
          :colon="false"
          html-for="quota-alarm-enabled"
        >
          <Switch
            id="quota-alarm-enabled"
            v-model:checked="ruleEditor.enabled"
          />
        </FormItem>
        <FormItem
          v-if="ruleEditor.thresholdUnit !== 'state'"
          :label="thresholdLabel(ruleEditor, 'highThreshold')"
          :colon="false"
          html-for="quota-alarm-high"
        >
          <InputNumber
            id="quota-alarm-high"
            class="!w-full"
            :value="ruleEditor.highThreshold"
            :min="2"
            :max="ruleEditor.maximumThreshold"
            :precision="0"
            @update:value="
              (value) =>
                ruleEditor && (ruleEditor.highThreshold = Number(value))
            "
          />
        </FormItem>
        <FormItem
          v-if="ruleEditor.thresholdUnit !== 'state'"
          :label="thresholdLabel(ruleEditor, 'clearThreshold')"
          :colon="false"
          :help="
            ruleEditor.clearThreshold >= ruleEditor.highThreshold
              ? t('clearBelowHigh')
              : undefined
          "
          :validate-status="
            ruleEditor.clearThreshold >= ruleEditor.highThreshold
              ? 'error'
              : undefined
          "
          html-for="quota-alarm-low"
        >
          <InputNumber
            id="quota-alarm-low"
            class="!w-full"
            :value="ruleEditor.clearThreshold"
            :min="1"
            :max="ruleEditor.maximumThreshold - 1"
            :precision="0"
            @update:value="
              (value) =>
                ruleEditor && (ruleEditor.clearThreshold = Number(value))
            "
          />
        </FormItem>
        <FormItem
          :label="t('fireMs')"
          :colon="false"
          html-for="quota-alarm-fire-ms"
        >
          <InputNumber
            id="quota-alarm-fire-ms"
            class="!w-full"
            :value="ruleEditor.fireAfterMs"
            string-mode
            :min="1000"
            :max="3600000"
            :precision="0"
            @update:value="
              (value) =>
                ruleEditor &&
                (ruleEditor.fireAfterMs = value == null ? '' : String(value))
            "
          />
        </FormItem>
        <FormItem
          :label="t('recoverMs')"
          :colon="false"
          html-for="quota-alarm-recover-ms"
        >
          <InputNumber
            id="quota-alarm-recover-ms"
            class="!w-full"
            :value="ruleEditor.recoverAfterMs"
            string-mode
            :min="1000"
            :max="3600000"
            :precision="0"
            @update:value="
              (value) =>
                ruleEditor &&
                (ruleEditor.recoverAfterMs = value == null ? '' : String(value))
            "
          />
        </FormItem>
      </Form>
    </template>
  </Modal>
  <Modal
    :open="!!actionEditor"
    :title="t(actionEditor?.kind ?? 'acknowledge')"
    :ok-text="t(issuedAction ? 'retryAction' : 'confirmAction')"
    :ok-button-props="{ disabled: !validReason || !canManage }"
    :confirm-loading="busy"
    :mask-closable="!busy"
    :keyboard="!busy"
    @ok="saveAction"
    @cancel="!busy && (actionEditor = null)"
  >
    <Alert
      v-if="modalFault"
      type="warning"
      show-icon
      :message="modalFault"
      class="mb-3"
    />
    <Form layout="vertical" @finish="saveAction">
      <FormItem
        v-if="actionEditor?.kind === 'silence'"
        :label="t('duration')"
        :colon="false"
        html-for="quota-alarm-silence-duration"
      >
        <Select
          id="quota-alarm-silence-duration"
          v-model:value="minutes"
          :disabled="!!issuedAction"
          :options="
            [15, 60, 240, 720].map((value) => ({
              value,
              label: `${value} ${t('minutes')}`,
            }))
          "
        />
      </FormItem>
      <FormItem
        :label="t('reason')"
        :colon="false"
        :help="t('reasonHelp')"
        :validate-status="
          reason.length > 0 && !validReason ? 'error' : undefined
        "
        html-for="quota-alarm-reason"
      >
        <Textarea
          id="quota-alarm-reason"
          v-model:value="reason"
          :maxlength="256"
          :disabled="!!issuedAction"
          :rows="3"
          show-count
        />
      </FormItem>
    </Form>
    <p v-if="issuedAction?.silenceUntil">
      {{ t('silencedUntil') }} {{ sampleTime(issuedAction.silenceUntil) }}
    </p>
  </Modal>
  <Modal
    :open="!!auditTitle"
    :title="auditTitle"
    :footer="null"
    @cancel="closeAudit"
  >
    <Skeleton v-if="auditLoading" active :paragraph="{ rows: 2 }" />
    <Alert
      v-else-if="auditFault"
      type="warning"
      show-icon
      :message="t('auditFailed')"
    />
    <Empty v-else-if="auditEntries.length === 0" :description="t('noAudit')" />
    <Timeline v-else>
      <TimelineItem
        v-for="entry in auditEntries"
        :key="entry.sequence"
        :color="auditDot(entry.event)"
      >
        <div class="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span class="text-sm font-medium tabular-nums">
            {{ timeAt(entry.recordedAtMs) }}
          </span>
          <template v-if="entry.event.kind === 'operator'">
            <Tag
              v-if="entry.event.acknowledged"
              class="quota-tag !m-0"
              color="geekblue"
            >
              {{ t('acknowledge') }}
            </Tag>
            <Tag
              v-if="entry.event.silencedUntil"
              class="quota-tag !m-0"
              color="purple"
            >
              {{ t('silence') }}
            </Tag>
          </template>
          <Tag
            v-else-if="entry.event.phase"
            class="quota-tag !m-0"
            :color="tone(entry.event.phase)"
          >
            {{ t(`phase.${entry.event.phase}`) }}
          </Tag>
          <Tag v-else-if="entry.event.next" class="quota-tag !m-0" color="blue">
            {{ t('ruleRevision') }} {{ amount(entry.event.next.revision) }}
          </Tag>
        </div>
        <Descriptions
          v-if="
            entry.event.next &&
            entry.event.previous &&
            typeof entry.event.previous === 'object'
          "
          :colon="false"
          :column="1"
          size="small"
        >
          <DescriptionsItem :label="t('ruleBefore')">
            {{ ruleSummary(entry.event.previous) }}
          </DescriptionsItem>
          <DescriptionsItem :label="t('ruleAfter')">
            {{ ruleSummary(entry.event.next) }}
          </DescriptionsItem>
        </Descriptions>
        <Descriptions
          v-if="
            entry.event.kind === 'observation' &&
            entry.event.resource === 'quota_management'
          "
          :colon="false"
          :column="1"
          size="small"
        >
          <DescriptionsItem :label="quotaText('owner')">
            <TypographyText code :title="entry.event.ownerId">
              {{ entry.event.ownerId?.slice(0, 8) }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('quotaManagementRefusedSource')">
            {{ amount(entry.event.refusedSourceBacking) }}
          </DescriptionsItem>
          <DescriptionsItem :label="t('handoffsAtObservation')">
            {{ amount(entry.event.successfulHandoffs) }}
          </DescriptionsItem>
        </Descriptions>
        <Descriptions
          v-if="
            entry.event.kind === 'observation' &&
            entry.event.resource === 'northward_app_queue'
          "
          :colon="false"
          :column="{ xs: 1, sm: 2 }"
          size="small"
        >
          <DescriptionsItem :label="quotaText('apps.owner')">
            <TypographyText code :title="entry.event.ownerId">
              {{ entry.event.ownerId?.slice(0, 8) }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('apps.runningRevision')">
            {{ amount(entry.event.policyRevision) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('apps.desiredRevision')">
            {{ amount(entry.event.desiredRevision) }}
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('refusals')">
            {{ amount(entry.event.refusalsTotal) }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="quotaText('apps.completions.brokerAcknowledged')"
          >
            {{ amount(entry.event.brokerAcknowledged) }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="quotaText('apps.completions.transportFlushed')"
          >
            {{ amount(entry.event.transportFlushed) }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="quotaText('apps.completions.appliedLocally')"
          >
            {{ amount(entry.event.appliedLocally) }}
          </DescriptionsItem>
        </Descriptions>
        <Descriptions
          v-if="entry.event.actorId || entry.event.silencedUntil"
          :colon="false"
          :column="1"
          size="small"
        >
          <DescriptionsItem v-if="entry.event.actorId" :label="t('actor')">
            {{ entry.event.actorId }}
          </DescriptionsItem>
          <DescriptionsItem
            v-if="entry.event.silencedUntil"
            :label="t('silencedUntil')"
          >
            {{ sampleTime(entry.event.silencedUntil) }}
          </DescriptionsItem>
        </Descriptions>
        <div v-if="entry.event.reason" class="whitespace-pre-wrap break-words">
          {{ entry.event.reason }}
        </div>
      </TimelineItem>
    </Timeline>
  </Modal>
</template>
