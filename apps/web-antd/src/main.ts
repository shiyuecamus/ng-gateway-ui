import { initPreferences, updatePreferences } from '@vben/preferences';
import { unmountGlobalLoading } from '@vben/utils';

import { overridesPreferences } from './preferences';

/**
 * Update (or create) the page favicon link at runtime.
 *
 * This is required because:
 * - `index.html` uses a build-time static `href` (dev fallback).
 * - In production, we want the backend-provided branding favicon to win.
 */
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
    // Ignore favicon update failures.
  }
}

/**
 * Load system branding configuration from the backend.
 *
 * This endpoint is public so it can be used before authentication.
 */
async function loadBranding() {
  try {
    const resp = await fetch('/branding.json', { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as {
      faviconUrl: string;
      logoUrl: string;
      title: string;
      updatedAt?: null | string;
    };
  } catch {
    return null;
  }
}

/**
 * 应用初始化完成之后再进行页面加载渲染
 */
async function initApplication() {
  // name用于指定项目唯一标识
  // 用于区分不同项目的偏好设置以及存储数据的key前缀以及其他一些需要隔离的数据
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;

  // app偏好设置初始化
  const branding = await loadBranding();
  const brandingUpdatedAtMs = branding?.updatedAt
    ? new Date(branding.updatedAt).getTime()
    : Date.now();
  const cacheBust =
    Number.isFinite(brandingUpdatedAtMs) && brandingUpdatedAtMs > 0
      ? brandingUpdatedAtMs
      : Date.now();

  if (branding?.title) {
    // Set title early to reduce flicker before router title watcher runs.
    document.title = branding.title;
  }

  if (branding?.faviconUrl) {
    // Always use a dedicated branding favicon path to avoid `public/favicon.ico` shadowing in dev.
    setRuntimeFavicon(`${branding.faviconUrl}?v=${cacheBust}`);
  }

  const baseApp = overridesPreferences.app ?? {
    name: import.meta.env.VITE_APP_TITLE,
  };
  const baseLogo = overridesPreferences.logo ?? {
    source: '/static/logo.png',
  };

  const runtimeOverrides = branding
    ? {
        ...overridesPreferences,
        app: {
          ...baseApp,
          name: branding.title || baseApp.name,
        },
        logo: {
          ...baseLogo,
          source: branding.logoUrl
            ? `${branding.logoUrl}?v=${cacheBust}`
            : baseLogo.source,
        },
      }
    : overridesPreferences;

  await initPreferences({
    namespace,
    overrides: runtimeOverrides,
  });

  // IMPORTANT:
  // `@vben/preferences` loads persisted values from localStorage, which may override
  // our runtime overrides. To ensure system branding always wins, we apply a forced
  // update after initialization.
  if (branding) {
    updatePreferences({
      app: {
        name: branding.title || baseApp.name,
      },
      logo: {
        source: branding.logoUrl
          ? `${branding.logoUrl}?v=${cacheBust}`
          : baseLogo.source,
      },
    });
  }

  // 启动应用并挂载
  // vue应用主要逻辑及视图
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);

  // 移除并销毁loading
  unmountGlobalLoading();
}

initApplication();
