<script setup lang="ts">
import type { IdType } from '@vben/types';

import type {
  ControlOperationCursor,
  ControlOperationSearch,
  ControlOperationSummary,
  ControlState,
} from '#/api/core/control';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  FormItem,
  List,
  ListItem,
  Select,
  Tag,
} from 'ant-design-vue';

import { listControlOperations } from '#/api/core/control';

import StateTag from './state-tag.vue';

const props = defineProps<{
  canReadAll: boolean;
  principal: string;
  selectedChannelId?: IdType;
  selectedDeviceId?: IdType;
}>();
const emit = defineEmits<{ select: [operationId: string] }>();

const audience = ref<'all' | 'mine'>('mine');
const stateFilter = ref<'all' | 'unresolved' | ControlState>('unresolved');
const selectedTargetOnly = ref(false);
const fromLocal = ref('');
const untilLocal = ref('');
const items = ref<ControlOperationSummary[]>([]);
const cursor = ref<ControlOperationCursor | null>(null);
const loaded = ref(false);
const loading = ref(false);
const error = ref('');
let generation = 0;

const states: ControlState[] = [
  'registered',
  'dispatching',
  'selected',
  'releasePending',
  'releasePendingLate',
  'awaitingTermination',
  'indeterminate',
  'serviceAccepted',
  'partialProtocolCompleted',
  'partialServiceAccepted',
  'protocolSucceeded',
  'protocolRejected',
  'failedBeforeDispatch',
  'cancelled',
  'expired',
  'resolvedByOperator',
];
const stateOptions = computed(() => [
  { label: $t('page.control.history.unresolved'), value: 'unresolved' },
  { label: $t('page.control.history.allStates'), value: 'all' },
  ...states.map((state) => ({
    label: $t(`page.control.states.${state}`),
    value: state,
  })),
]);
const audienceOptions = computed(() => [
  { label: $t('page.control.history.mine'), value: 'mine' },
  ...(props.canReadAll
    ? [{ label: $t('page.control.history.allOperators'), value: 'all' }]
    : []),
]);

function localIso(value: string): string | undefined {
  if (!value) return;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error($t('page.control.history.invalidTime'));
  return parsed.toISOString();
}

function selectedId(value: IdType | undefined): number | undefined {
  if (value === undefined) return;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 2_147_483_647) {
    throw new Error($t('page.control.history.invalidTarget'));
  }
  return parsed;
}

function search(
  cursorValue: ControlOperationCursor | null,
): ControlOperationSearch {
  const from = localIso(fromLocal.value);
  const until = localIso(untilLocal.value);
  if (from && until && from >= until) {
    throw new Error($t('page.control.history.invalidRange'));
  }
  const query: ControlOperationSearch = {
    audience: props.canReadAll ? audience.value : 'mine',
    limit: 25,
  };
  if (stateFilter.value === 'unresolved') query.unresolvedOnly = true;
  else if (stateFilter.value !== 'all') query.state = stateFilter.value;
  if (selectedTargetOnly.value) {
    const channelId = selectedId(props.selectedChannelId);
    const deviceId = selectedId(props.selectedDeviceId);
    if (channelId === undefined || deviceId === undefined) {
      throw new Error($t('page.control.history.invalidTarget'));
    }
    query.channelId = channelId;
    query.deviceId = deviceId;
  }
  if (from) query.from = from;
  if (until) query.until = until;
  if (cursorValue) {
    query.beforeSequence = cursorValue.sequence;
  }
  return query;
}

async function load(reset: boolean) {
  if (!props.principal || (!reset && (loading.value || !cursor.value))) return;
  const requestGeneration = reset ? ++generation : generation;
  const pageCursor = reset ? null : cursor.value;
  if (reset) {
    items.value = [];
    cursor.value = null;
    loaded.value = false;
  }
  loading.value = true;
  error.value = '';
  try {
    const page = await listControlOperations(search(pageCursor));
    if (requestGeneration !== generation) return;
    items.value = reset ? page.items : [...items.value, ...page.items];
    cursor.value = page.nextCursor;
    loaded.value = true;
  } catch (error_) {
    if (requestGeneration === generation) error.value = String(error_);
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

watch(
  () => props.principal,
  () => {
    audience.value = 'mine';
    ++generation;
    items.value = [];
    cursor.value = null;
    loaded.value = false;
    error.value = '';
    if (props.principal) void load(true);
  },
  { immediate: true },
);
watch(
  () => props.canReadAll,
  (canReadAll) => {
    if (!canReadAll && audience.value === 'all') {
      audience.value = 'mine';
    }
  },
);
watch(
  [
    audience,
    stateFilter,
    selectedTargetOnly,
    fromLocal,
    untilLocal,
    () => (selectedTargetOnly.value ? props.selectedChannelId : undefined),
    () => (selectedTargetOnly.value ? props.selectedDeviceId : undefined),
  ],
  () => {
    ++generation;
    items.value = [];
    cursor.value = null;
    loaded.value = false;
    loading.value = false;
    error.value = '';
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  ++generation;
});
</script>

<template>
  <div class="space-y-4">
    <Form layout="vertical">
      <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormItem
          :label="$t('page.control.history.visibility')"
          html-for="control-history-visibility"
        >
          <Select
            v-model:value="audience"
            id="control-history-visibility"
            :aria-label="$t('page.control.history.visibility')"
            :options="audienceOptions"
          />
        </FormItem>
        <FormItem
          :label="$t('page.control.history.status')"
          html-for="control-history-status"
        >
          <Select
            v-model:value="stateFilter"
            id="control-history-status"
            :aria-label="$t('page.control.history.status')"
            :options="stateOptions"
          />
        </FormItem>
        <FormItem
          :label="$t('page.control.history.from')"
          html-for="control-history-from"
        >
          <DatePicker
            v-model:value="fromLocal"
            id="control-history-from"
            :aria-label="$t('page.control.history.from')"
            show-time
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
        </FormItem>
        <FormItem
          :label="$t('page.control.history.until')"
          html-for="control-history-until"
        >
          <DatePicker
            v-model:value="untilLocal"
            id="control-history-until"
            :aria-label="$t('page.control.history.until')"
            show-time
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
        </FormItem>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Checkbox v-model:checked="selectedTargetOnly">
          {{ $t('page.control.history.selectedTarget') }}
        </Checkbox>
        <Button type="primary" :loading="loading" @click="load(true)">
          {{ $t('page.control.history.search') }}
        </Button>
      </div>
    </Form>
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Empty
      v-if="loaded && items.length === 0"
      :description="$t('page.control.history.empty')"
    />
    <List v-else :data-source="items" :loading="loading" :split="false">
      <template #renderItem="{ item }">
        <ListItem class="mb-3 rounded-lg border p-4">
          <div class="w-full min-w-0 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <StateTag :state="item.state" />
                <Tag>
                  {{ $t('page.control.history.recordSequence') }}
                  {{ item.recordSequence }}
                </Tag>
              </div>
              <time
                :datetime="item.createdAt"
                class="text-xs text-muted-foreground"
              >
                <span>{{ item.createdAt }}</span>
              </time>
            </div>
            <Button
              type="link"
              class="h-auto max-w-full whitespace-normal break-all p-0 text-left font-mono text-xs"
              @click="emit('select', item.operationId)"
            >
              {{ item.operationId }}
            </Button>
            <div class="flex flex-wrap gap-2 text-sm">
              <Tag color="blue">
                {{ $t('page.control.channel') }} {{ item.channelId }}
              </Tag>
              <Tag color="cyan">
                {{ $t('page.control.device') }} {{ item.deviceId }}
              </Tag>
              <Tag color="geekblue">{{ item.scope }}</Tag>
              <Tag v-if="audience === 'all'" color="purple">
                {{ item.principal }}
              </Tag>
            </div>
            <code class="block break-all text-xs text-muted-foreground">{{
              item.authorityId
            }}</code>
          </div>
        </ListItem>
      </template>
    </List>
    <Button v-if="cursor" block :loading="loading" @click="load(false)">
      {{ $t('page.control.history.more') }}
    </Button>
  </div>
</template>
