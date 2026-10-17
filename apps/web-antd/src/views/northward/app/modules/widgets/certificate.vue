<script lang="ts" setup>
import type { IdType } from '@vben/types';

import type { OpcuaPublicCertificateInfo } from '#/api/core/opcua-server';

import { nextTick, onBeforeUnmount, ref } from 'vue';

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
  downloadOpcuaServerCertificate,
  getOpcuaServerCertificateInfo,
} from '#/api/core/opcua-server';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

defineOptions({ name: 'OpcuaServerCertificateModal' });

type ModalData = { appId: IdType; appName: string };
const appId = ref<IdType>(0);
const appName = ref('');
const loading = ref(false);
const certificate = ref<null | OpcuaPublicCertificateInfo>(null);

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
    appId.value = data.appId;
    appName.value = data.appName;
    certificate.value = null;
    loading.value = true;
    try {
      const result = await getOpcuaServerCertificateInfo(
        data.appId,
        controller.signal,
      );
      if (epoch === generation && !controller.signal.aborted)
        certificate.value = result;
    } catch {
      if (epoch === generation && !controller.signal.aborted)
        message.error($t('page.northward.app.certificate.loadFailed'));
    } finally {
      if (epoch === generation) loading.value = false;
    }
  },
});

async function download() {
  if (!certificate.value) return;
  const epoch = generation;
  const controller = new AbortController();
  active?.abort();
  active = controller;
  loading.value = true;
  try {
    const { blob, filename } = await downloadOpcuaServerCertificate(
      appId.value,
      controller.signal,
    );
    if (epoch !== generation || controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    if (epoch === generation && !controller.signal.aborted)
      message.error($t('page.northward.app.certificate.downloadFailed'));
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
          :message="$t('page.northward.app.certificate.instructions')"
        />
        <Descriptions v-if="certificate" bordered :column="1" size="small">
          <DescriptionsItem :label="$t('page.northward.app.certificate.app')">
            {{ appName }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.northward.app.certificate.status')"
          >
            <Tag
              :color="
                certificate.summary.health === 'healthy'
                  ? 'green'
                  : certificate.summary.health === 'expiring'
                    ? 'orange'
                    : 'red'
              "
            >
              {{
                $t(
                  `page.northward.app.certificate.health.${certificate.summary.health}`,
                )
              }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="ApplicationUri">
            <Tag color="blue" class="max-w-full whitespace-normal break-all">
              {{ certificate.summary.san_uri }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="SAN">
            {{
              [
                ...certificate.summary.san_hostnames,
                ...certificate.summary.san_ips,
              ].join(', ')
            }}
          </DescriptionsItem>
          <DescriptionsItem
            :label="$t('page.northward.app.certificate.validity')"
          >
            {{ certificate.summary.not_before }} –
            {{ certificate.summary.not_after }}
          </DescriptionsItem>
          <DescriptionsItem label="SHA-256">
            <EvidenceDigest :value="certificate.sha256Hex" />
          </DescriptionsItem>
          <DescriptionsItem label="OPC UA Thumbprint (SHA-1)">
            <code class="break-all">{{
              certificate.summary.thumbprint_hex
            }}</code>
          </DescriptionsItem>
        </Descriptions>
        <div class="flex justify-end gap-2">
          <Button @click="modalApi.close()">
            {{ $t('page.northward.app.certificate.close') }}
          </Button>
          <Button
            type="primary"
            :disabled="!certificate"
            :loading="loading"
            @click="download"
          >
            {{ $t('page.northward.app.certificate.download') }}
          </Button>
        </div>
      </div>
    </Spin>
  </Modal>
</template>
