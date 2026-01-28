<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { $t } from '@vben/locales';

import { useVbenModal } from '@vben-core/popup-ui';
import { VbenButton } from '@vben-core/shadcn-ui';

import { useV1Api } from '../../api/v1';
import CardShell from '../system/card-shell.vue';
import LogDownloadModal from './log-download-modal.vue';

type LogFileInfo = {
  modifiedAt: number;
  name: string;
  size: number;
};

type LogFilesListResponse = {
  files: LogFileInfo[];
};

const { request } = useV1Api();

const loading = ref(false);
const error = ref('');
const fileCount = ref<number>(0);

const [LogFilesModalComponent, logFilesModalApi] = useVbenModal({
  class: 'w-[700px]',
  destroyOnClose: true,
  footer: false,
  title: $t('preferences.system.loggingFiles.modalTitle'),
  onCancel() {
    logFilesModalApi.close();
  },
});

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const data = await request<LogFilesListResponse>(
      'GET',
      '/system/settings/logging_files',
    );
    fileCount.value = data.files.length;
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  reload();
});
</script>

<template>
  <CardShell
    :title="$t('preferences.system.loggingFiles.title')"
    :description="$t('preferences.system.loggingFiles.desc')"
    :loading="loading"
    :dirty="false"
    :error="error"
    :disable-apply="true"
    @reload="reload"
    @reset="() => {}"
    @apply="() => {}"
  >
    <div class="bg-muted/10 flex items-center justify-between rounded-md border p-3 text-sm">
      <div class="text-muted-foreground text-xs">
        {{ $t('preferences.system.loggingFiles.count') }}:
        <span class="text-foreground ml-1 font-mono">{{ fileCount }}</span>
      </div>
      <VbenButton size="sm" @click="logFilesModalApi.open()">
        {{ $t('preferences.system.loggingFiles.manage') }}
      </VbenButton>
    </div>

    <LogFilesModalComponent>
      <LogDownloadModal @close="logFilesModalApi.close()" />
    </LogFilesModalComponent>
  </CardShell>
</template>

