<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { useAppConfig } from '@vben/hooks';
import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { VbenButton, VbenCheckbox } from '@vben-core/shadcn-ui';

type WebResponse<T> = { code: number; data: T; message?: string };

type LogFileInfo = {
  name: string;
  size: number;
  modifiedAt: number;
  required?: boolean;
};

type LogFilesListResponse = {
  files: LogFileInfo[];
};

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const accessStore = useAccessStore();

const loading = ref(false);
const downloading = ref(false);
const error = ref<string>('');
const files = ref<LogFileInfo[]>([]);
const selectedFiles = ref<Set<string>>(new Set());

const emit = defineEmits<{
  /**
   * Close the modal.
   */
  (e: 'close'): void;
}>();

const hasSelection = computed(() => selectedFiles.value.size > 0);

async function apiFetch<T>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  const token = accessStore.accessToken;
  const resp = await fetch(`${apiURL}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Accept-Language': preferences.app.locale,
      'Accept-Api-Version': 'v1',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await resp.json()) as WebResponse<T>;
  if (json.code !== 0) {
    throw new Error(json.message || `Request failed (code=${json.code})`);
  }
  return json.data;
}

async function loadFiles() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiFetch<LogFilesListResponse>('GET', '/logging/files');
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
    const token = accessStore.accessToken;
    const resp = await fetch(`${apiURL}/logging/download`, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Accept-Language': preferences.app.locale,
        'Accept-Api-Version': 'v1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: Array.from(selectedFiles.value),
      }),
    });

    if (!resp.ok) {
      const json = (await resp.json()) as WebResponse<any>;
      throw new Error(json.message || `Download failed (status=${resp.status})`);
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
      } catch (e: any) {
        // User cancellation or unsupported path: fall back to blob.
        if (e?.name !== 'AbortError') {
          // Keep going to blob fallback.
        } else {
          return;
        }
      }
    }

    // Fallback: blob download (may consume large memory for big archives).
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error_: any) {
    error.value = error_?.message ?? String(error_);
  } finally {
    downloading.value = false;
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

    <div class="max-h-96 space-y-2 overflow-y-auto">
      <div
        v-if="loading"
        class="flex items-center justify-center py-8 text-sm text-muted-foreground"
      >
        {{ $t('common.loading') }}
      </div>

      <div
        v-else-if="files.length === 0"
        class="flex items-center justify-center py-8 text-sm text-muted-foreground"
      >
        {{ $t('preferences.system.log.noFiles') }}
      </div>

      <div
        v-else
        v-for="file in files"
        :key="file.name"
        class="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent"
        role="button"
        tabindex="0"
        @click="toggleFile(file.name)"
        @keydown.enter.prevent="toggleFile(file.name)"
        @keydown.space.prevent="toggleFile(file.name)"
      >
        <VbenCheckbox
          :model-value="selectedFiles.has(file.name)"
          @click.stop
          @update:modelValue="(v) => setFileSelected(file.name, Boolean(v))"
        />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ file.name }}</span>
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ formatFileSize(file.size) }} · {{ formatDate(file.modifiedAt) }}
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2 border-t pt-4">
      <VbenButton variant="outline" :disabled="downloading" @click="emit('close')">
        {{ $t('common.cancel') }}
      </VbenButton>
      <VbenButton :disabled="!hasSelection || downloading" @click="download">
        <span v-if="downloading">{{ $t('preferences.system.log.downloading') }}</span>
        <span v-else>{{ $t('preferences.system.log.download') }}</span>
      </VbenButton>
    </div>
  </div>
</template>
