<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';

import { VbenButton, VbenCheckbox } from '@vben-core/shadcn-ui';

import { useV1Api } from './api';

type LogFileInfo = {
  modifiedAt: number;
  name: string;
  required?: boolean;
  size: number;
};

type LogFilesListResponse = {
  files: LogFileInfo[];
};

type CleanupLogFilesResponse = {
  deleted: LogFileInfo[];
  freedBytes: number;
  protectedActive: boolean;
};

const emit = defineEmits<{
  /**
   * Close the modal.
   */
  (e: 'close'): void;
}>();
const loading = ref(false);
const downloading = ref(false);
const cleaning = ref(false);
const error = ref<string>('');
const files = ref<LogFileInfo[]>([]);
const selectedFiles = ref<Set<string>>(new Set());
const dryRun = ref(true);
const cleanupReport = ref<CleanupLogFilesResponse | null>(null);

const hasSelection = computed(() => selectedFiles.value.size > 0);

const { request, requestRaw } = useV1Api();

async function loadFiles() {
  loading.value = true;
  error.value = '';
  cleanupReport.value = null;
  try {
    const data = await request<LogFilesListResponse>(
      'GET',
      '/system/settings/logging_files',
    );
    files.value = data.files;

    // Reconcile selection with latest server-side list.
    // - Drop selections that no longer exist
    const names = new Set(files.value.map((f) => f.name));
    const next = new Set<string>();
    for (const n of selectedFiles.value) {
      if (names.has(n)) next.add(n);
    }
    selectedFiles.value = next;
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    loading.value = false;
  }
}

function toggleFile(fileName: string) {
  // NOTE:
  // `Set` is mutated in-place, which does NOT trigger Vue ref change detection.
  // Always replace with a new `Set` instance so checkbox UI updates immediately.
  const next = new Set(selectedFiles.value);
  if (next.has(fileName)) next.delete(fileName);
  else next.add(fileName);
  selectedFiles.value = next;
}

function setFileSelected(fileName: string, selected: boolean) {
  // NOTE: same reactivity rule as `toggleFile()`: always replace the Set instance.
  const next = new Set(selectedFiles.value);
  if (selected) next.add(fileName);
  else next.delete(fileName);
  selectedFiles.value = next;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(timestamp: number): string {
  if (timestamp === 0) return '-';
  const date = new Date(timestamp);
  return date.toLocaleString(preferences.app.locale || 'zh-CN');
}

async function download() {
  if (!hasSelection.value || downloading.value) return;

  downloading.value = true;
  error.value = '';

  try {
    const resp = await requestRaw(
      'POST',
      '/system/settings/logging_files/download',
      { files: [...selectedFiles.value] },
    );

    if (!resp.ok) {
      // Server may return a standard WebResponse on error.
      const text = await resp.text();
      try {
        const json = JSON.parse(text) as { code?: number; message?: string };
        throw new Error(
          json.message ||
            `Download failed (status=${resp.status}, code=${json.code ?? '?'})`,
        );
      } catch {
        throw new Error(`Download failed (status=${resp.status}): ${text}`);
      }
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = resp.headers.get('Content-Disposition');
    let filename = 'ng-gateway-logs.zip';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+?)"?$/);
      if (match) {
        const extractedFilename = match[1];
        if (extractedFilename) {
          filename = extractedFilename;
        }
      }
    }

    // Prefer true streaming save-to-disk for large files (zero-copy-ish, minimal memory).
    // File System Access API is supported by Chromium-based browsers.
    const wAny = window as any;
    if (wAny?.showSaveFilePicker && resp.body) {
      try {
        const handle = await wAny.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'ZIP',
              accept: { 'application/zip': ['.zip'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await resp.body.pipeTo(writable);
        return;
      } catch (error_: any) {
        // User cancellation or unsupported path: fall back to blob.
        if (error_?.name === 'AbortError') {
          return;
        } else {
          // Keep going to blob fallback.
        }
      }
    }

    // Fallback: blob download (may consume large memory for big archives).
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    downloading.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function cleanup() {
  if (cleaning.value) return;
  cleaning.value = true;
  error.value = '';
  cleanupReport.value = null;

  try {
    const data = await request<CleanupLogFilesResponse>(
      'POST',
      '/system/settings/logging_files/cleanup',
      { dryRun: dryRun.value },
    );
    cleanupReport.value = data;
    await loadFiles();
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    cleaning.value = false;
  }
}

onMounted(() => {
  loadFiles();
});

defineExpose({
  reload: loadFiles,
});
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-800">
      {{ error }}
    </div>

    <div
      v-if="cleanupReport"
      class="bg-muted/30 text-muted-foreground rounded-md border p-3 text-xs"
    >
      <div class="text-foreground font-medium">
        {{ $t('preferences.system.loggingFiles.cleanupReportTitle') }}
      </div>
      <div class="mt-1">
        {{ $t('preferences.system.loggingFiles.cleanupFreed') }}:
        <span class="text-foreground font-mono">{{
          formatBytes(cleanupReport.freedBytes)
        }}</span>
      </div>
      <div class="mt-1">
        {{ $t('preferences.system.loggingFiles.cleanupDeleted') }}:
        <span class="text-foreground font-mono">{{
          cleanupReport.deleted.length
        }}</span>
      </div>
      <div v-if="cleanupReport.protectedActive" class="mt-1 text-amber-800">
        {{ $t('preferences.system.loggingFiles.cleanupProtectedActive') }}
      </div>
    </div>

    <div class="max-h-96 space-y-2 overflow-y-auto">
      <div
        v-if="loading"
        class="text-muted-foreground flex items-center justify-center py-8 text-sm"
      >
        {{ $t('common.loading') }}
      </div>

      <div
        v-else-if="files.length === 0"
        class="text-muted-foreground flex items-center justify-center py-8 text-sm"
      >
        {{ $t('preferences.system.log.noFiles') }}
      </div>

      <div
        v-else
        v-for="file in files"
        :key="file.name"
        class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
        role="button"
        tabindex="0"
        @click="toggleFile(file.name)"
        @keydown.enter.prevent="toggleFile(file.name)"
        @keydown.space.prevent="toggleFile(file.name)"
      >
        <VbenCheckbox
          :model-value="selectedFiles.has(file.name)"
          @click.stop
          @update:model-value="(v) => setFileSelected(file.name, Boolean(v))"
        />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ file.name }}</span>
          </div>
          <div class="text-muted-foreground mt-1 text-xs">
            {{ formatFileSize(file.size) }} · {{ formatDate(file.modifiedAt) }}
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
    >
      <div class="text-muted-foreground flex items-center gap-2 text-xs">
        <VbenCheckbox v-model="dryRun" />
        <span>{{ $t('preferences.system.loggingFiles.dryRun') }}</span>
      </div>
      <div class="flex justify-end gap-2">
        <VbenButton
          variant="outline"
          :disabled="cleaning || downloading"
          @click="cleanup"
        >
          <span v-if="cleaning">{{
            $t('preferences.system.loggingFiles.cleaning')
          }}</span>
          <span v-else>{{
            $t('preferences.system.loggingFiles.cleanup')
          }}</span>
        </VbenButton>
        <VbenButton
          variant="outline"
          :disabled="downloading"
          @click="emit('close')"
        >
          {{ $t('common.cancel') }}
        </VbenButton>
        <VbenButton :disabled="!hasSelection || downloading" @click="download">
          <span v-if="downloading">{{
            $t('preferences.system.log.downloading')
          }}</span>
          <span v-else>{{ $t('preferences.system.log.download') }}</span>
        </VbenButton>
      </div>
    </div>
  </div>
</template>
