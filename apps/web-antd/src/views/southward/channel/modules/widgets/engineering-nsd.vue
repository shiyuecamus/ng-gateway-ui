<script setup lang="ts">
import type {
  AssetInfo,
  EngineeringStatus,
  NsdRole,
} from '#/api/core/engineering';

import { computed, onBeforeUnmount, ref, useId } from 'vue';

import { VbenButton } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Input,
  Select,
  Tag,
  Upload,
} from 'ant-design-vue';

import { getEngineeringAsset, uploadNsd } from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import { describeFailure } from './engineering-evidence';

const props = defineProps<{ status: EngineeringStatus | null }>();
const key = 'page.southward.channel.engineering.nsd';
const digest = ref('');
const asset = ref<AssetInfo | null>(null);
const role = ref<NsdRole>();
const roleId = useId();
const loading = ref(false);
const error = ref('');
const available = computed(
  () => props.status?.nsdImportAvailable && !loading.value,
);
let request: AbortController | null = null;

/** Closing the owner fences late upload/read callbacks and cancels the host observer. */
function reset() {
  request?.abort();
  request = null;
  asset.value = null;
  digest.value = '';
  error.value = '';
  loading.value = false;
  role.value = undefined;
}

function selectRole(value: unknown) {
  reset();
  if (value === 'data' || value === 'service' || value === 'applicability') {
    role.value = value;
  }
}

async function load(operation: (signal: AbortSignal) => Promise<AssetInfo>) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  asset.value = null;
  error.value = '';
  try {
    const result = await operation(controller.signal);
    if (request !== controller || controller.signal.aborted) return;
    if (result.source.kind !== 'nsd') {
      error.value = $t(`${key}.wrongRole`);
      return;
    }
    asset.value = result;
    role.value = result.source.identity.role;
    digest.value = result.digest;
  } catch (error_) {
    if (request === controller && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (request === controller) loading.value = false;
  }
}

async function selectFile(file: File) {
  if (!available.value || !props.status || !role.value) return false;
  if (file.size === 0 || file.size > props.status.maxInputBytes) {
    error.value = $t('page.southward.channel.engineering.sizeRejected', {
      bytes: props.status.maxInputBytes,
    });
    return false;
  }
  const selectedRole = role.value;
  await load((signal) => uploadNsd(file, selectedRole, signal));
  return false;
}

async function openAsset() {
  if (
    loading.value ||
    !props.status?.storeAvailable ||
    !/^[a-f\d]{64}$/.test(digest.value)
  )
    return;
  const selected = digest.value;
  await load((signal) => getEngineeringAsset(selected, signal));
}

onBeforeUnmount(reset);
defineExpose({ reset });
</script>

<template>
  <Card
    :title="$t(`${key}.title`)"
    size="small"
    role="region"
    :aria-label="$t(`${key}.title`)"
  >
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">
        {{ $t(`${key}.description`) }}
      </p>
      <Alert v-if="error" type="error" show-icon :message="error" />
      <div class="flex flex-wrap items-center gap-2">
        <label :for="roleId" class="sr-only">{{ $t(`${key}.role`) }}</label>
        <Select
          :id="roleId"
          :value="role"
          :placeholder="$t(`${key}.chooseRole`)"
          :disabled="loading"
          :options="[
            { value: 'data', label: $t(`${key}.dataRole`) },
            { value: 'service', label: $t(`${key}.serviceRole`) },
            { value: 'applicability', label: $t(`${key}.applicabilityRole`) },
          ]"
          class="min-w-56"
          @change="selectRole"
        />
        <Upload
          :disabled="!available || !role"
          :file-list="[]"
          :max-count="1"
          :show-upload-list="false"
          :before-upload="selectFile"
          accept=".nsd,.snsd,.appns,.xml"
        >
          <VbenButton
            as="span"
            variant="outline"
            size="sm"
            :disabled="!available || !role"
            :loading="loading"
          >
            {{ $t(`${key}.upload`) }}
          </VbenButton>
        </Upload>
        <Input
          v-model:value="digest"
          :aria-label="$t(`${key}.digest`)"
          :placeholder="$t(`${key}.digest`)"
          :maxlength="64"
          :disabled="loading"
          class="min-w-48 flex-1 font-mono"
        />
        <VbenButton
          variant="outline"
          size="sm"
          :disabled="
            loading ||
            !props.status?.storeAvailable ||
            !/^[a-f\d]{64}$/.test(digest)
          "
          :loading="loading"
          @click="openAsset"
        >
          {{ $t(`${key}.open`) }}
        </VbenButton>
      </div>
      <Descriptions
        v-if="asset?.source.kind === 'nsd'"
        :column="{ xs: 1, sm: 2, md: 3 }"
        size="small"
      >
        <DescriptionsItem label="SHA-256">
          <EvidenceDigest :value="asset.digest" />
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.role`)">
          {{ $t(`${key}.${asset.source.identity.role}Role`) }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role !== 'applicability'"
          :label="$t(`${key}.namespace`)"
        >
          {{ asset.source.identity.namespace }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role !== 'applicability'"
          :label="$t(`${key}.coordinates`)"
        >
          {{ asset.source.identity.version
          }}{{ asset.source.identity.revision }} /
          {{ asset.source.identity.release }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.schema`)">
          {{ asset.source.schema }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role === 'data'"
          :label="$t(`${key}.namespaceType`)"
        >
          {{ asset.source.identity.namespaceType ?? $t(`${key}.undeclared`) }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role !== 'applicability'"
          :label="$t(`${key}.stage`)"
        >
          <Tag>{{ asset.source.identity.publicationStage }}</Tag>
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role === 'applicability'"
          :label="$t(`${key}.applicationVersion`)"
        >
          {{ asset.source.identity.version }}
        </DescriptionsItem>
        <DescriptionsItem
          v-if="asset.source.identity.role === 'applicability'"
          :label="$t(`${key}.definitionDate`)"
        >
          {{ asset.source.identity.date }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.importedBy`)">
          {{ asset.importedBy }}
        </DescriptionsItem>
      </Descriptions>
    </div>
  </Card>
</template>
