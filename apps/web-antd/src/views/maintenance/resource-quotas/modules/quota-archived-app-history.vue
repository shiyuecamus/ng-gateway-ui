<script setup lang="ts">
import type { ArchivedAppAlarmPage } from '#/api/core/resource-alarms';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
} from 'vue';

import { Alert, Button, Card, Empty, Select, Skeleton } from 'ant-design-vue';

import { getArchivedAppAlarmScopes } from '#/api/core/resource-alarms';

import { amount, quotaText, sampleTime } from './presentation';
import QuotaAlarms from './quota-alarms.vue';

const pickerId = useId();
const page = shallowRef<ArchivedAppAlarmPage>();
const selectedId = ref<number>();
const beforeAppId = ref<number>();
const pending = ref(false);
const problem = ref<'denied' | 'failed'>();
let request: AbortController | undefined;

const options = computed(() =>
  (page.value?.scopes ?? []).map(({ appId, lastAlarmOpenedAt }) => {
    const id = amount(String(appId));
    return {
      label: lastAlarmOpenedAt
        ? quotaText('apps.archive.option', {
            id,
            at: sampleTime(lastAlarmOpenedAt),
          })
        : quotaText('apps.archive.ruleOnlyOption', { id }),
      value: appId,
    };
  }),
);

async function refresh() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  pending.value = true;
  problem.value = undefined;
  try {
    const result = await getArchivedAppAlarmScopes(
      beforeAppId.value,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    page.value = result;
    if (!result.scopes.some(({ appId }) => appId === selectedId.value)) {
      selectedId.value = undefined;
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    problem.value = status === 401 || status === 403 ? 'denied' : 'failed';
    page.value = undefined;
    selectedId.value = undefined;
  } finally {
    if (!controller.signal.aborted) pending.value = false;
  }
}

function navigate(cursor?: number) {
  beforeAppId.value = cursor;
  page.value = undefined;
  selectedId.value = undefined;
  void refresh();
}

defineExpose({ refresh });
onMounted(() => void refresh());
onBeforeUnmount(() => request?.abort());
</script>

<template>
  <Card size="small" class="min-w-0" :title="quotaText('apps.archive.title')">
    <template #extra>
      <Button size="small" :loading="pending" @click="refresh">
        {{ quotaText('refresh') }}
      </Button>
    </template>
    <Alert
      v-if="problem"
      show-icon
      type="warning"
      :message="
        quotaText(
          problem === 'denied' ? 'apps.denied' : 'apps.archive.lookupFailed',
        )
      "
    />
    <Skeleton v-else-if="pending && !page" active :paragraph="{ rows: 1 }" />
    <Empty
      v-else-if="options.length === 0"
      :description="quotaText('apps.archive.empty')"
    />
    <template v-else>
      <label :for="pickerId" class="mb-1.5 block text-sm font-medium">
        {{ quotaText('apps.archive.selectLabel') }}
      </label>
      <Select
        :id="pickerId"
        v-model:value="selectedId"
        :options="options"
        :placeholder="quotaText('apps.archive.placeholder')"
        :loading="pending"
        :virtual="false"
        class="w-full sm:max-w-lg"
      />
    </template>
    <div
      v-if="beforeAppId !== undefined || page?.nextBeforeAppId != null"
      class="mt-3 flex flex-wrap gap-2"
    >
      <Button
        v-if="beforeAppId !== undefined"
        size="small"
        :disabled="pending"
        @click="navigate()"
      >
        {{ quotaText('apps.archive.firstPage') }}
      </Button>
      <Button
        v-if="page?.nextBeforeAppId != null"
        size="small"
        :disabled="pending"
        @click="navigate(page.nextBeforeAppId)"
      >
        {{ quotaText('apps.archive.nextPage') }}
      </Button>
    </div>
  </Card>
  <QuotaAlarms
    v-if="selectedId !== undefined"
    :key="selectedId"
    :scope="{ appId: selectedId, resource: 'northward_app_queue' }"
    archived
  />
</template>
