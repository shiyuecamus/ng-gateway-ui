<script setup lang="ts">
import type { IdType } from '@vben/types';

import type { MmsTlsIdentity } from '#/api/core/mms-tls';

import { nextTick, onBeforeUnmount, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
  Spin,
} from 'ant-design-vue';

import { getMmsTlsIdentity } from '#/api/core/mms-tls';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

const key = 'page.southward.channel.mmsTls';
const identity = ref<MmsTlsIdentity | null>(null);
const loading = ref(false);
const error = ref('');
let generation = 0;
let active: AbortController | null = null;
function reset() {
  generation += 1;
  active?.abort();
  active = null;
  loading.value = false;
  identity.value = null;
  error.value = '';
}
onBeforeUnmount(reset);
const [Modal, modalApi] = useVbenModal({
  class: 'w-[900px] max-w-[95vw]',
  destroyOnClose: true,
  footer: false,
  async onOpenChange(open) {
    reset();
    if (!open) return;
    const current = generation;
    await nextTick();
    if (current !== generation) return;
    const controller = new AbortController();
    active = controller;
    loading.value = true;
    try {
      const result = await getMmsTlsIdentity(
        modalApi.getData<{ channelId: IdType }>().channelId,
        controller.signal,
      );
      if (current === generation && !controller.signal.aborted)
        identity.value = result;
    } catch {
      if (current === generation && !controller.signal.aborted)
        error.value = $t(`${key}.loadFailed`);
    } finally {
      if (current === generation) loading.value = false;
    }
  },
});
function date(value: string) {
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function download() {
  if (identity.value?.mode !== 'tls') return;
  const binary = atob(identity.value.client_certificate_der_base64);
  const bytes = Uint8Array.from(
    binary,
    (character) => character.codePointAt(0) ?? 0,
  );
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/pkix-cert' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mms-client-${identity.value.client_certificate_sha256}.der`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <Spin :spinning="loading">
      <div class="space-y-4">
        <Alert :message="$t(`${key}.instructions`)" type="info" show-icon />
        <Alert v-if="error" :message="error" type="error" show-icon />
        <Alert
          v-if="identity?.mode === 'tcp'"
          :message="$t(`${key}.plain`)"
          type="warning"
          show-icon
        />
        <Descriptions
          v-if="identity?.mode === 'tls'"
          bordered
          :column="1"
          size="small"
        >
          <DescriptionsItem :label="$t(`${key}.serverName`)">
            {{ identity.server_name }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.identity`)">
            <EvidenceDigest :value="identity.client_certificate_sha256" />
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.starts`)">
            {{ date(identity.not_before_unix) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.expires`)">
            {{ date(identity.not_after_unix) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.trust`)">
            <div v-for="hash in identity.trust_material_sha256" :key="hash">
              <EvidenceDigest :value="hash" />
            </div>
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.revocation`)">
            <div
              v-for="hash in identity.revocation_material_sha256"
              :key="hash"
            >
              <EvidenceDigest :value="hash" />
            </div>
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.signers`)">
            <div
              v-for="hash in identity.revocation_issuer_material_sha256"
              :key="hash"
            >
              <EvidenceDigest :value="hash" />
            </div>
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.interval`)">
            {{ identity.material_check_interval_ms }} ms
          </DescriptionsItem>
        </Descriptions>
        <Button v-if="identity?.mode === 'tls'" @click="download">
          {{ $t(`${key}.download`) }}
        </Button>
      </div>
    </Spin>
  </Modal>
</template>
