<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { $t } from '@vben/locales';
import { updatePreferences } from '@vben/preferences';

import { Card, message, Spin } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  updateBrandingTitle,
  uploadBrandingFavicon,
  uploadBrandingLogo,
} from '#/api';

import { buildBrandingFormSchema } from './modules/schemas';

defineOptions({ name: 'MaintenanceBranding' });

type BrandingPublicConfig = {
  faviconUrl: string;
  logoUrl: string;
  title: string;
  updatedAt?: null | string;
};

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;

const loading = ref(false);
const lastUpdatedAtMs = ref<number>(Date.now());

function validateUploadFileType(file: File, kind: 'favicon' | 'logo'): boolean {
  const allowed =
    kind === 'logo'
      ? ['image/png', 'image/webp', 'image/jpeg']
      : ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png'];

  if (!allowed.includes(file.type)) {
    message.error(
      $t('page.maintenance.branding.fileTypeNotSupported', {
        type: file.type || '<empty>',
      }),
    );
    return false;
  }
  return true;
}

function createBeforeSelect(kind: 'favicon' | 'logo') {
  return (file: unknown) => {
    const raw = ((file as any)?.originFileObj ?? file) as File | undefined;
    if (!raw) return false;

    const max = kind === 'logo' ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
    if (typeof raw.size === 'number' && raw.size > max) {
      // Let the adapter remove it from fileList on change.
      (file as any).status = 'removed';
      return false;
    }

    if (!validateUploadFileType(raw, kind)) {
      (file as any).status = 'removed';
      return false;
    }

    // IMPORTANT: always return false to stop auto upload.
    // We will upload everything on "Save".
    return false;
  };
}

const [Form, formApi] = useVbenForm({
  schema: buildBrandingFormSchema({
    beforeLogoSelect: createBeforeSelect('logo'),
    beforeFaviconSelect: createBeforeSelect('favicon'),
  }),
  showDefaultActions: true,
  submitButtonOptions: {
    show: true,
    content: $t('page.maintenance.branding.save'),
  },
  resetButtonOptions: {
    show: false,
  },
  handleSubmit: async (values: Record<string, any>) => {
    const nextTitle = String(values?.title ?? '').trim();
    if (!nextTitle) return;
    loading.value = true;
    try {
      // NOTE:
      // - `logoFiles` / `faviconFiles` are modeled as Upload `fileList`.
      // - When we "echo" current runtime branding into Upload, entries only contain `url`
      //   (no `originFileObj`). We must only upload local files selected by user.
      const logoFile = values?.logoFiles?.[0]?.originFileObj as
        | File
        | undefined;
      const faviconFile = values?.faviconFiles?.[0]?.originFileObj as
        | File
        | undefined;

      if (logoFile) {
        await uploadBrandingLogo(logoFile);
      }
      if (faviconFile) {
        await uploadBrandingFavicon(faviconFile);
      }
      await updateBrandingTitle({ title: nextTitle });
      message.success($t('common.action.saveSuccess'));
      try {
        await refreshPreview();
      } catch {
        // If refresh fails, keep the saved state and allow user to continue.
      }
    } finally {
      loading.value = false;
    }
  },
});

const cacheBust = computed(() => {
  const v = lastUpdatedAtMs.value;
  return Number.isFinite(v) && v > 0 ? v : Date.now();
});

function setRuntimeFavicon(href: string) {
  try {
    const head = document.head || document.querySelectorAll('head')[0];
    const existing =
      (document.querySelector('link[rel="icon"]') as HTMLLinkElement | null) ??
      (document.querySelector(
        'link[rel="shortcut icon"]',
      ) as HTMLLinkElement | null);
    const link = existing ?? document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    if (!existing) head.append(link);
  } catch {
    // ignore
  }
}

async function fetchBrandingPublic() {
  // NOTE:
  // In some environments (reverse proxy / service worker / cache layer), this request may hang.
  // We must ensure the page can recover and release the loading state.
  const timeoutMs = 5000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('/branding.json', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`branding.json http ${resp.status}`);
    return (await resp.json()) as BrandingPublicConfig;
  } finally {
    window.clearTimeout(timer);
  }
}

async function refreshPreview() {
  const branding = await fetchBrandingPublic();

  const updatedAtMs = branding.updatedAt
    ? new Date(branding.updatedAt).getTime()
    : Date.now();
  lastUpdatedAtMs.value =
    Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? updatedAtMs : Date.now();

  const logoUrlWithBust = branding.logoUrl
    ? `${branding.logoUrl}?v=${cacheBust.value}`
    : undefined;
  const faviconUrlWithBust = branding.faviconUrl
    ? `${branding.faviconUrl}?v=${cacheBust.value}`
    : undefined;

  // Echo current runtime branding into Upload, so Upload itself can preview "current" images.
  await formApi.setValues(
    {
      title: branding.title,
      logoFiles: logoUrlWithBust
        ? [{ uid: 'logo', name: 'logo', status: 'done', url: logoUrlWithBust }]
        : undefined,
      faviconFiles: faviconUrlWithBust
        ? [
            {
              uid: 'favicon',
              name: 'favicon',
              status: 'done',
              url: faviconUrlWithBust,
            },
          ]
        : undefined,
    },
    false,
  );

  if (faviconUrlWithBust) {
    setRuntimeFavicon(faviconUrlWithBust);
  }

  if (branding.title) {
    document.title = branding.title;
  }

  // Sync global runtime preferences immediately so the layout updates without a hard refresh.
  // This also updates localStorage to avoid stale values on next reload.
  updatePreferences({
    app: {
      name: branding.title,
    },
    logo: {
      source: logoUrlWithBust ?? '/static/logo.png',
    },
  });
}

onMounted(async () => {
  try {
    await refreshPreview();
  } catch {
    // dev fallback: keep public assets
  }
});
</script>

<template>
  <Card>
    <Spin :spinning="loading">
      <Form />
    </Spin>
  </Card>
</template>
