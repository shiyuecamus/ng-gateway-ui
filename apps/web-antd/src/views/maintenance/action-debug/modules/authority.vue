<script setup lang="ts">
import type { IdType } from '@vben/types';

import type { ControlAuthority, ControlRoute } from '#/api/core/control';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Form,
  FormItem,
  Input,
  Tag,
} from 'ant-design-vue';

import {
  createControlAuthority,
  getControlAuthority,
  getControlRoute,
  invalidateControlAuthority,
  proposeControlRoute,
  verifyControlAuthority,
  verifyControlRoute,
} from '#/api/core/control';

import { prepareControlIntent, resetControlIntent } from './intent';

const props = defineProps<{
  channelId: Exclude<IdType, undefined>;
  deviceId: Exclude<IdType, undefined>;
}>();
const userStore = useUserStore();
const authority = ref<ControlAuthority>();
const route = ref<ControlRoute | null>(null);
const authorityId = ref('');
const label = ref('');
const reason = ref('');
const evidence = ref('');
const accessPoint = ref('');
const busy = ref(false);
const error = ref('');
let generation = 0;
const routeVerified = computed(
  () =>
    route.value?.state === 'verified' &&
    authority.value?.state === 'verified' &&
    route.value.authorityId === authority.value.authorityId &&
    route.value.authorityRevision === authority.value.revision,
);

async function load(expected = generation) {
  const currentRoute = await getControlRoute(props.deviceId);
  if (expected !== generation) return;
  route.value = currentRoute;
  if (currentRoute) {
    const current = await getControlAuthority(currentRoute.authorityId);
    if (expected !== generation) return;
    authority.value = current;
    authorityId.value = current.authorityId;
  }
}

async function perform(action: () => Promise<unknown>) {
  if (busy.value) return;
  const expected = generation;
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (error_) {
    if (expected === generation) error.value = String(error_);
  } finally {
    if (expected === generation) busy.value = false;
  }
}

function selectAuthority() {
  const expected = generation;
  return perform(async () => {
    const current = await getControlAuthority(authorityId.value.trim());
    if (expected === generation) authority.value = current;
  });
}

function createAuthority() {
  const expected = generation;
  return perform(async () => {
    if (!userStore.userInfo)
      throw new Error('Authenticated engineering identity is unavailable');
    const intent = prepareControlIntent(
      `user:${userStore.userInfo.id}`,
      'authority-create',
      { label: label.value.trim() },
    );
    const hex = intent.idempotencyKey;
    if (expected === generation) label.value = intent.request.label;
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
    // Preserve the exact identity before admission so a lost reply remains recoverable by ID.
    if (expected === generation) authorityId.value = id;
    const current = await createControlAuthority(id, intent.request.label);
    if (expected === generation) {
      authority.value = current;
      authorityId.value = current.authorityId;
    }
  });
}

function newAuthorityIntent() {
  if (!userStore.userInfo || busy.value) return;
  resetControlIntent(`user:${userStore.userInfo.id}`, 'authority-create');
  label.value = '';
}

function verifyIdentity() {
  const current = authority.value;
  const expected = generation;
  if (!current) return;
  return perform(async () => {
    const verified = await verifyControlAuthority(current, reason.value, {
      assetVerification: evidence.value,
    });
    if (expected === generation) authority.value = verified;
  });
}

function invalidateIdentity() {
  const current = authority.value;
  const expected = generation;
  if (!current) return;
  return perform(async () => {
    const updated = await invalidateControlAuthority(current, reason.value, {
      verificationRevocation: evidence.value,
    });
    if (expected === generation) authority.value = updated;
  });
}

function bindRoute() {
  const current = authority.value;
  const expected = generation;
  if (!current) return;
  return perform(async () => {
    const bound = await proposeControlRoute(props.deviceId, {
      authorityId: current.authorityId,
      channelId: Number(props.channelId),
      expectedRevision: route.value?.revision ?? null,
      reason: reason.value,
      routeSnapshot: { accessPoint: accessPoint.value.trim() },
    });
    if (expected === generation) route.value = bound;
  });
}

function verifyRoute() {
  const current = route.value;
  const expected = generation;
  if (!current || current.authorityId !== authority.value?.authorityId) return;
  return perform(async () => {
    const verified = await verifyControlRoute(current, reason.value, {
      routeVerification: evidence.value,
    });
    if (expected === generation) route.value = verified;
  });
}

watch(
  () => props.deviceId,
  () => {
    generation++;
    authority.value = undefined;
    route.value = null;
    authorityId.value = '';
    busy.value = false;
    reason.value = '';
    evidence.value = '';
    accessPoint.value = '';
    void perform(() => load());
  },
  { immediate: true },
);
onBeforeUnmount(() => generation++);
</script>

<template>
  <Card :title="$t('page.control.engineering')">
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        {{ $t('page.control.engineeringHint') }}
      </p>
      <Alert v-if="error" type="error" show-icon :message="error" />
      <div class="flex flex-wrap gap-2">
        <Input
          v-model:value="authorityId"
          class="min-w-0 flex-1 sm:min-w-64"
          :disabled="busy"
          :placeholder="$t('page.control.authorityId')"
        />
        <Button
          :disabled="busy || !authorityId.trim()"
          @click="selectAuthority"
        >
          {{ $t('page.control.lookupAuthority') }}
        </Button>
      </div>
      <div class="flex flex-wrap gap-2">
        <Input
          v-model:value="label"
          class="flex-1"
          :disabled="busy"
          :maxlength="512"
          :placeholder="$t('page.control.assetLabel')"
        />
        <Button :disabled="busy || !label.trim()" @click="createAuthority">
          {{ $t('page.control.createAuthority') }}
        </Button>
        <Button :disabled="busy" @click="newAuthorityIntent">
          {{ $t('page.control.newAuthorityIntent') }}
        </Button>
      </div>
      <p class="text-sm text-muted-foreground">
        {{ $t('page.control.authorityIntentHint') }}
      </p>
      <div v-if="authority">
        {{ authority.label }}
        <Tag :color="authority.state === 'verified' ? 'green' : 'orange'">
          {{ $t(`page.control.${authority.state}`) }}
        </Tag>
        <code class="break-all text-xs">{{ authority.authorityId }}</code>
      </div>
      <Form layout="vertical" :disabled="busy">
        <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
          <FormItem :label="$t('page.control.reason')">
            <Input
              v-model:value="reason"
              :aria-label="$t('page.control.reason')"
              :disabled="busy"
              :maxlength="1000"
              :placeholder="$t('page.control.reason')"
            />
          </FormItem>
          <FormItem :label="$t('page.control.evidence')">
            <Input.TextArea
              v-model:value="evidence"
              :aria-label="$t('page.control.evidence')"
              :rows="3"
              :disabled="busy"
              :maxlength="8000"
              :placeholder="$t('page.control.evidence')"
            />
          </FormItem>
        </div>
        <div class="mb-4 flex flex-wrap gap-3">
          <Button
            :disabled="
              busy ||
              !authority ||
              authority.state === 'verified' ||
              !reason.trim() ||
              !evidence.trim()
            "
            @click="verifyIdentity"
          >
            {{ $t('page.control.verifyAuthority') }}
          </Button>
          <Button
            danger
            :disabled="
              busy ||
              authority?.state !== 'verified' ||
              !reason.trim() ||
              !evidence.trim()
            "
            @click="invalidateIdentity"
          >
            {{ $t('page.control.invalidateAuthority') }}
          </Button>
        </div>
        <FormItem :label="$t('page.control.accessPoint')">
          <Input
            v-model:value="accessPoint"
            :aria-label="$t('page.control.accessPoint')"
            :disabled="busy"
            :maxlength="1000"
            :placeholder="$t('page.control.accessPoint')"
          />
        </FormItem>
        <Button
          :disabled="
            busy ||
            authority?.state !== 'verified' ||
            !reason.trim() ||
            !accessPoint.trim()
          "
          @click="bindRoute"
        >
          {{ $t('page.control.bindRoute') }}
        </Button>
        <div v-if="route">
          {{ $t('page.control.route') }}
          <Tag :color="routeVerified ? 'green' : 'orange'">
            {{
              $t(`page.control.${routeVerified ? 'verified' : 'unverified'}`)
            }}
          </Tag>
          · {{ route.revision }}
        </div>
        <Button
          :disabled="
            busy ||
            !route ||
            routeVerified ||
            route.authorityId !== authority?.authorityId ||
            authority?.state !== 'verified' ||
            !reason.trim() ||
            !evidence.trim()
          "
          @click="verifyRoute"
        >
          {{ $t('page.control.verifyRoute') }}
        </Button>
      </Form>
    </div>
  </Card>
</template>
