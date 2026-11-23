<script setup lang="ts">
import type { QuotaUse } from '#/api/core/resource-quota';

import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Skeleton,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { getGatewayQuotaUsage } from '#/api/core/resource-quota';
import { RESOURCE_QUOTAS_PATH } from '#/router/routes/core';

import {
  amount,
  quotaText,
  resourceName,
  sampleTime,
} from './modules/presentation';

const access = useAccessStore();
const router = useRouter();
const snapshot = shallowRef<Awaited<ReturnType<typeof getGatewayQuotaUsage>>>();
const readError = ref<'busy' | 'denied' | 'unavailable'>();
const reading = ref(false);
const opening = ref(false);
const consoleUnavailable = ref(false);
let pending: AbortController | undefined;

function usageText(value?: QuotaUse, unit: 'bytes' | 'count' = 'count') {
  return value
    ? `${amount(value.used)} / ${amount(value.limit)} ${quotaText(`units.${unit}`)}`
    : quotaText('unknown');
}

const resources = computed(() => {
  const ordinary = snapshot.value?.httpIngress;
  const management = snapshot.value?.quotaManagement;
  const extension = snapshot.value?.extensionStore;
  return [
    {
      label: resourceName('http-ingress'),
      sample: ordinary,
      slots: ordinary?.requests,
      fields: [
        { label: 'httpRequestSlots', value: usageText(ordinary?.requests) },
        { label: 'httpNativeSlots', value: usageText(ordinary?.nativeWork) },
        {
          label: 'recovery.ordinaryRefusals',
          value: amount(ordinary?.refusedRequestSlots),
        },
      ],
    },
    {
      label: quotaText('quotaManagementDetails'),
      sample: management,
      slots: management?.requests,
      fields: [
        {
          label: 'quotaManagementRequests',
          value: usageText(management?.requests),
        },
        {
          label: 'quotaManagementNative',
          value: usageText(management?.nativeWork),
        },
        {
          label: 'quotaManagementBacking',
          value: usageText(management?.backing, 'bytes'),
        },
        {
          label: 'quotaManagementRefusedSource',
          value: amount(management?.refusedSourceBacking),
        },
      ],
    },
    {
      label: resourceName('extension-store'),
      sample: extension,
      slots: extension?.pending,
      fields: [
        { label: 'recovery.inFlight', value: usageText(extension?.pending) },
        {
          label: 'recovery.reserved',
          value: usageText(extension?.bytes, 'bytes'),
        },
        {
          label: 'recovery.totalRefusals',
          value: amount(extension?.refusalsTotal),
        },
      ],
    },
  ];
});

function status(item: (typeof resources.value)[number]) {
  if (!item.sample) return { color: undefined, label: 'unknown' };
  if (readError.value) return { color: 'gold', label: 'staleSample' };
  if (!item.sample.accepting)
    return { color: 'volcano', label: 'notAccepting' };
  if (item.slots?.available === '0')
    return { color: 'gold', label: 'exhaustedLabel' };
  return { color: 'success', label: 'acceptingLabel' };
}

async function refresh() {
  if (pending || !access.accessToken) return;
  const request = new AbortController();
  pending = request;
  reading.value = true;
  try {
    const observed = await getGatewayQuotaUsage(request.signal);
    if (request.signal.aborted) return;
    snapshot.value = observed;
    readError.value = undefined;
  } catch (error) {
    if (request.signal.aborted) return;
    const code = (error as { response?: { status?: number } })?.response
      ?.status;
    if (code === 401 || code === 403) {
      snapshot.value = undefined;
      readError.value = 'denied';
    } else {
      readError.value = code === 429 ? 'busy' : 'unavailable';
    }
  } finally {
    if (pending === request) {
      pending = undefined;
      reading.value = false;
    }
  }
}

async function openConsole() {
  opening.value = true;
  consoleUnavailable.value = false;
  try {
    await router.replace(RESOURCE_QUOTAS_PATH);
    consoleUnavailable.value =
      router.currentRoute.value.path !== RESOURCE_QUOTAS_PATH;
  } catch {
    consoleUnavailable.value = true;
  } finally {
    opening.value = false;
  }
}

watch(
  () => access.accessToken,
  () => {
    pending?.abort();
    pending = undefined;
    reading.value = false;
    snapshot.value = undefined;
    readError.value = access.accessToken ? undefined : 'denied';
    void refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => pending?.abort());
</script>

<template>
  <main class="min-h-dvh bg-background px-4 py-7 sm:px-6 lg:py-10">
    <div class="mx-auto grid w-full max-w-6xl gap-5">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="m-0 text-2xl font-semibold">{{ quotaText('title') }}</h1>
            <Tag class="!m-0" color="blue">
              {{ quotaText('recovery.mode') }}
            </Tag>
          </div>
          <p class="mb-0 mt-2 text-sm text-muted-foreground">
            {{ quotaText('recovery.description') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button :loading="reading" type="primary" @click="refresh">
            {{ quotaText('refreshStatus') }}
          </Button>
          <Button :loading="opening" @click="openConsole">
            {{ quotaText('recovery.openConsole') }}
          </Button>
        </div>
      </header>
      <Alert
        v-if="consoleUnavailable"
        show-icon
        type="info"
        :message="quotaText('recovery.consoleUnavailable')"
      />
      <Alert
        v-if="readError"
        show-icon
        :type="readError === 'denied' ? 'error' : 'warning'"
        :message="quotaText(`recovery.${readError}`)"
      />
      <Card v-if="reading && !snapshot">
        <Skeleton active :paragraph="{ rows: 3 }" />
      </Card>
      <section
        v-if="snapshot"
        class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3"
        :aria-label="quotaText('recovery.readings')"
        :aria-busy="reading"
      >
        <Card
          v-for="item in resources"
          :key="item.label"
          size="small"
          class="min-w-0"
        >
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h2 class="m-0 text-base font-semibold">{{ item.label }}</h2>
            <Tag :color="status(item).color" class="!m-0">
              {{ quotaText(status(item).label) }}
            </Tag>
          </div>
          <Descriptions
            bordered
            layout="vertical"
            :colon="false"
            :column="1"
            size="small"
          >
            <DescriptionsItem
              v-for="field in item.fields"
              :key="field.label"
              :label="quotaText(field.label)"
            >
              <strong class="tabular-nums">{{ field.value }}</strong>
            </DescriptionsItem>
            <DescriptionsItem :label="quotaText('sampledAt')">
              {{ sampleTime(item.sample?.sampledAt) }}
            </DescriptionsItem>
            <DescriptionsItem v-if="item.sample" :label="quotaText('owner')">
              <TypographyText
                code
                :title="item.sample.ownerId"
                :copyable="{ text: item.sample.ownerId }"
              >
                {{ item.sample.ownerId.slice(0, 8) }}
              </TypographyText>
            </DescriptionsItem>
          </Descriptions>
        </Card>
      </section>
      <Card v-if="snapshot" :title="quotaText('processRss')" size="small">
        <Descriptions
          :colon="false"
          :column="{ xs: 1, sm: 2 }"
          bordered
          layout="vertical"
          size="small"
        >
          <DescriptionsItem :label="quotaText('residentBytes')">
            <strong class="tabular-nums">{{
              amount(snapshot.processRss?.bytes)
            }}</strong>
            <span v-if="snapshot.processRss">{{
              quotaText('units.bytes')
            }}</span>
          </DescriptionsItem>
          <DescriptionsItem :label="quotaText('sampledAt')">
            {{ sampleTime(snapshot.processRss?.sampledAt) }}
          </DescriptionsItem>
        </Descriptions>
      </Card>
    </div>
  </main>
</template>
