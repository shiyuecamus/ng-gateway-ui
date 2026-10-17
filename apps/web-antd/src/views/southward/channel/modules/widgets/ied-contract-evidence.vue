<script setup lang="ts">
import type { IedContract, StandardPart } from '#/api/core/engineering';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Space,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import { downloadEngineeringOriginal } from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import { describeFailure } from './engineering-evidence';

const props = defineProps<{ contract: IedContract }>();
const key = 'page.southward.channel.engineering.contract';
const parts: StandardPart[] = [
  'scl6',
  'semantics71',
  'acsi72',
  'dataClasses73',
  'logicalNodes74',
  'mapping81',
];
const rows = computed(() =>
  parts.map((part) => ({
    part,
    declaration: props.contract.parts.find((item) => item.part === part),
  })),
);
const error = ref('');
const downloading = ref('');
let alive = true;
let generation = 0;
let request: AbortController | null = null;
let url: null | string = null;
function reset() {
  generation += 1;
  request?.abort();
  request = null;
  downloading.value = '';
  error.value = '';
  if (url) URL.revokeObjectURL(url);
  url = null;
}
watch(() => props.contract, reset);
onBeforeUnmount(() => {
  alive = false;
  reset();
});
async function download(digest: string) {
  reset();
  const version = generation;
  const controller = new AbortController();
  request = controller;
  downloading.value = digest;
  try {
    const blob = await downloadEngineeringOriginal(digest, controller.signal);
    if (
      !alive ||
      controller.signal.aborted ||
      request !== controller ||
      generation !== version
    )
      return;
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${digest}.bin`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch (error_) {
    if (alive && !controller.signal.aborted && version === generation)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && request === controller && version === generation)
      downloading.value = '';
  }
}
</script>
<template>
  <div class="space-y-3" role="region" :aria-label="$t(`${key}.evidence`)">
    <Alert type="info" show-icon :message="$t(`${key}.declaredHint`)" />
    <Alert v-if="error" type="error" show-icon :message="error" />
    <Descriptions bordered size="small" :column="{ xs: 1, md: 3 }">
      <DescriptionsItem
        v-for="field in ['manufacturer', 'model', 'firmware'] as const"
        :key="field"
        :label="$t(`${key}.${field}`)"
      >
        {{ contract[field] ?? $t(`${key}.unknown`) }}
      </DescriptionsItem>
      <DescriptionsItem :label="$t(`${key}.domains`)">
        <Tag v-for="domain in contract.domains" :key="domain">
          {{ domain }}
        </Tag>
      </DescriptionsItem>
    </Descriptions>
    <Table
      :data-source="rows"
      row-key="part"
      :pagination="false"
      :scroll="{ x: 560 }"
      :columns="[
        { key: 'part', title: $t(`${key}.part`), width: 170 },
        { key: 'declaration', title: $t(`${key}.publication`) },
        { key: 'sources', title: $t(`${key}.sources`), width: 240 },
      ]"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <TypographyText v-if="column.key === 'part'" class="font-medium">
          {{ $t(`${key}.parts.${record.part}`) }}
        </TypographyText>
        <template v-else-if="column.key === 'declaration'">
          <Space v-if="record.declaration" direction="vertical" :size="8">
            <TypographyText class="break-words">
              {{ record.declaration.publication }}
            </TypographyText>
            <Tag color="blue" class="!m-0 self-start">
              {{
                `Ed${record.declaration.edition.major}.${record.declaration.edition.amendment}`
              }}
            </Tag>
          </Space>
          <TypographyText v-else type="secondary">
            {{ $t(`${key}.unknown`) }}
          </TypographyText>
        </template>
        <Space v-else-if="record.declaration" direction="vertical" :size="8">
          <EvidenceDigest
            v-for="digest in record.declaration.sources"
            :key="digest"
            :value="digest"
          />
        </Space>
      </template>
    </Table>
    <Card
      v-for="(claim, index) in contract.substitution"
      :key="index"
      :title="$t(`${key}.substitutionTitle`)"
      size="small"
    >
      <Space direction="vertical" :size="12" class="w-full">
        <Tag class="!m-0 self-start">
          {{
            $t(
              `${key}.${claim.support === 'supported' ? 'substitutionSupported' : 'substitutionUnsupported'}`,
            )
          }}
        </Tag>
        <Descriptions :column="1" size="small">
          <DescriptionsItem :label="$t(`${key}.substitutionSource`)">
            <EvidenceDigest :value="claim.source" />
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.locator`)">
            {{ claim.locator }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.substitutionPath`)">
            <Space direction="vertical" :size="8">
              <TypographyText
                v-for="(object, scopeIndex) in claim.objects"
                :key="scopeIndex"
                class="break-all"
              >
                {{ object.domain }}/{{ object.logicalNode }}/{{
                  object.path
                    .map(
                      (part) =>
                        `${part.name}${part.indices.map((index) => `(${index})`).join('')}`,
                    )
                    .join('.')
                }}
              </TypographyText>
            </Space>
          </DescriptionsItem>
        </Descriptions>
      </Space>
    </Card>
    <Card
      v-for="document in contract.documents"
      :key="document.digest"
      :title="document.label"
      size="small"
      class="min-w-0"
    >
      <template #extra>
        <Button
          :loading="downloading === document.digest"
          @click="download(document.digest)"
        >
          {{ $t(`${key}.download`) }}
        </Button>
      </template>
      <Space direction="vertical" :size="12" class="w-full">
        <Space :size="8" wrap>
          <Tag v-for="role in document.roles" :key="role" class="!m-0">
            {{ $t(`${key}.roles.${role}`) }}
          </Tag>
        </Space>
        <TypographyText
          v-if="document.locator"
          type="secondary"
          class="break-words"
        >
          {{ document.locator }}
        </TypographyText>
        <EvidenceDigest :value="document.digest" />
      </Space>
    </Card>
  </div>
</template>
