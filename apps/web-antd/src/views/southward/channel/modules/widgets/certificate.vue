<script lang="ts" setup>
import type { IdType } from '@vben/types';

import type { OpcuaClientIdentityInfo } from '#/api/core/opcua-client';

import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
  message,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  downloadOpcuaClientCertificate,
  getOpcuaClientCertificateInfo,
} from '#/api/core/opcua-client';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

defineOptions({ name: 'OpcuaClientCertificateModal' });

type ModalData = {
  channelId: IdType;
  channelName: string;
};

const channelId = ref<IdType>(0);
const channelName = ref('');
const loading = ref(false);
const identity = ref<null | OpcuaClientIdentityInfo>(null);
const noSecurity = computed(() => identity.value?.mode === 'none');
const publicCertificate = computed(() => identity.value?.certificate ?? null);

let generation = 0;
let active: AbortController | null = null;
function resetRequests() {
  generation += 1;
  active?.abort();
  active = null;
  loading.value = false;
}
onBeforeUnmount(resetRequests);

const [Modal, modalApi] = useVbenModal({
  class: 'w-[720px] max-w-[95vw]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    resetRequests();
    const epoch = generation;
    if (!isOpen) return;
    await nextTick();
    if (epoch !== generation) return;
    const controller = new AbortController();
    active = controller;
    const data = modalApi.getData<ModalData>();
    channelId.value = data.channelId;
    channelName.value = data.channelName;
    identity.value = null;
    loading.value = true;
    try {
      const result = await getOpcuaClientCertificateInfo(
        data.channelId,
        controller.signal,
      );
      if (epoch === generation && !controller.signal.aborted)
        identity.value = result;
    } catch {
      if (epoch === generation && !controller.signal.aborted)
        message.error($t('page.southward.channel.certificate.loadFailed'));
    } finally {
      if (epoch === generation) loading.value = false;
    }
  },
});

async function download() {
  if (!publicCertificate.value) return;
  const epoch = generation;
  const controller = new AbortController();
  active?.abort();
  active = controller;
  loading.value = true;
  try {
    const blob = await downloadOpcuaClientCertificate(
      channelId.value,
      controller.signal,
    );
    if (epoch !== generation || controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ng-gateway-opcua-client-channel-${channelId.value}.der`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    if (epoch === generation && !controller.signal.aborted)
      message.error($t('page.southward.channel.certificate.downloadFailed'));
  } finally {
    if (epoch === generation) loading.value = false;
  }
}
</script>

<template>
  <Modal>
    <Spin :spinning="loading">
      <div class="space-y-4">
        <Alert
          show-icon
          type="info"
          :message="
            $t(
              noSecurity
                ? 'page.southward.channel.certificate.noneMode'
                : 'page.southward.channel.certificate.clientInstructions',
            )
          "
        />
        <Descriptions
          v-if="publicCertificate"
          bordered
          :column="1"
          size="small"
        >
          <DescriptionsItem :label="$t('page.southward.channel.name')">
            {{ channelName }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.southward.channel.certificate.status')"
          >
            <Tag :color="publicCertificate.validNow ? 'green' : 'orange'">
              {{
                $t(
                  publicCertificate.validNow
                    ? 'page.southward.channel.certificate.valid'
                    : 'page.southward.channel.certificate.invalid',
                )
              }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="ApplicationUri">
            <Tag
              v-for="uri in publicCertificate.applicationUris"
              :key="uri"
              color="blue"
              class="max-w-full whitespace-normal break-all"
            >
              {{ uri }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="SAN">
            {{
              [
                ...publicCertificate.dnsNames,
                ...publicCertificate.ipAddresses,
              ].join(', ')
            }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.southward.channel.certificate.validity')"
          >
            {{ publicCertificate.notBefore }} – {{ publicCertificate.notAfter }}
          </DescriptionsItem>
          <DescriptionsItem label="SHA-256">
            <EvidenceDigest :value="publicCertificate.sha256Hex" />
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.southward.channel.certificate.revision')"
          >
            <Tag color="geekblue">{{ identity?.configurationRevision }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.southward.channel.certificate.subject')"
          >
            {{ publicCertificate.subject }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.southward.channel.certificate.issuer')"
          >
            {{ publicCertificate.issuer }}
          </DescriptionsItem>
        </Descriptions>
        <div class="flex justify-end gap-2">
          <Button @click="modalApi.close()">
            {{ $t('page.southward.channel.certificate.close') }}
          </Button>
          <Button
            v-if="!noSecurity"
            type="primary"
            :disabled="!publicCertificate"
            :loading="loading"
            @click="download"
          >
            {{ $t('page.southward.channel.certificate.download') }}
          </Button>
        </div>
      </div>
    </Spin>
  </Modal>
</template>
