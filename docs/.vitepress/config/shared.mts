import type { PwaOptions } from '@vite-pwa/vitepress';
import type { HeadConfig } from 'vitepress';

import { resolve } from 'node:path';

import {
  viteArchiverPlugin,
  viteVxeTableImportsPlugin,
} from '@vben/vite-config';

import {
  GitChangelog,
  GitChangelogMarkdownSection,
} from '@nolebase/vitepress-plugin-git-changelog/vite';
import tailwind from 'tailwindcss';
import { defineConfig, postcssIsolateStyles } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';

import { demoPreviewPlugin } from './plugins/demo-preview';
import { mermaidPlugin } from './plugins/mermaid';
import { search as zhSearch } from './zh.mts';

/**
 * The base URL the site will be deployed at.
 *
 * - Local dev: default to `/`
 * - GitHub Pages (project pages): set `VITEPRESS_BASE=/ng-gateway/`
 *
 * Notes:
 * - VitePress expects a leading and trailing slash, e.g. `/repo/`.
 * - Using an env var keeps the config portable across different repos/domains.
 */
const site_base = normalize_base(process.env.VITEPRESS_BASE ?? '/');

export const shared = defineConfig({
  appearance: 'dark',
  base: site_base,
  head: head(),
  markdown: {
    preConfig(md) {
      md.use(demoPreviewPlugin);
      md.use(groupIconMdPlugin);
    },
    /**
     * Register Mermaid renderer in `config` (instead of `preConfig`) so our fence override
     * is applied AFTER VitePress internal markdown/highlight plugins.
     *
     * This ensures:
     *   ```mermaid
     *   ...
     *   ```
     * is transformed into:
     *   <pre class="mermaid">...</pre>
     *
     * Then the client-side theme code can render diagrams on navigation.
     */
    config(md) {
      md.use(mermaidPlugin);
    },
  },
  pwa: pwa(),
  srcDir: 'src',
  themeConfig: {
    i18nRouting: true,
    logo: 'https://i.postimg.cc/MTkKmT2b/image.png',
    search: {
      options: {
        locales: {
          ...zhSearch,
        },
      },
      provider: 'local',
    },
    siteTitle: 'NG Gateway',
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/shiyuecamus/ng-gateway',
      },
    ],
  },
  title: 'NG Gateway',
  vite: {
    build: {
      chunkSizeWarningLimit: Infinity,
      minify: 'terser',
    },
    css: {
      postcss: {
        plugins: [
          tailwind(),
          postcssIsolateStyles({ includeFiles: [/vp-doc\.css/] }),
        ],
      },
      preprocessorOptions: {
        scss: {
          api: 'modern',
        },
      },
    },
    json: {
      stringify: true,
    },
    plugins: [
      // NOTE: This repo can pull multiple Vite versions via workspace deps.
      // Some plugins are compiled against a different Vite major, which can cause
      // TypeScript to report incompatible `Plugin` types. For docs config, we only
      // need runtime compatibility, so we narrow them to `any` here to keep the
      // config type-check clean.
      GitChangelog({
        mapAuthors: [
          {
            mapByNameAliases: ['Vben'],
            name: 'vben',
            username: 'anncwb',
          },
          {
            name: 'vince',
            username: 'vince292007',
          },
          {
            name: 'Li Kui',
            username: 'likui628',
          },
        ],
        repoURL: () => 'https://github.com/vbenjs/vue-vben-admin',
      }) as any,
      GitChangelogMarkdownSection({
        sections: {
          disableChangelog: true,
          disableContributors: true,
        },
      }) as any,
      viteArchiverPlugin({ outputDir: '.vitepress' }) as any,
      groupIconVitePlugin() as any,
      (await viteVxeTableImportsPlugin()) as any,
    ],
    server: {
      fs: {
        allow: ['../..'],
      },
      allowedHosts: true,
      host: true,
      port: 6173,
    },

    ssr: {
      external: ['@vue/repl'],
    },
  },
});

function head(): HeadConfig[] {
  return [
    ['meta', { content: 'Shiyuecamus', name: 'author' }],
    [
      'meta',
      {
        content:
          'ng-gateway, rust, tokio, driver, plugin, modbus, s7, opcua, iecl04, mc, mqtt, kafka, pulsar, thingsboard',
        name: 'keywords',
      },
    ],
    [
      'link',
      {
        href: with_base(site_base, 'favicon.ico'),
        rel: 'icon',
        type: 'image/svg+xml',
      },
    ],
    [
      'meta',
      {
        content:
          'width=device-width,initial-scale=1,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no',
        name: 'viewport',
      },
    ],
    ['meta', { content: 'ng-gateway docs', name: 'keywords' }],
    ['link', { href: with_base(site_base, 'favicon.ico'), rel: 'icon' }],
    // [
    //   'script',
    //   {
    //     src: 'https://cdn.tailwindcss.com',
    //   },
    // ],
  ];
}

function pwa(): PwaOptions {
  return {
    includeManifestIcons: false,
    manifest: {
      description: 'NG Gateway is a modern gateway for industrial IoT. ',
      icons: [
        {
          sizes: '192x192',
          src: 'https://i.postimg.cc/MTkKmT2b/image.png',
          type: 'image/png',
        },
        {
          sizes: '512x512',
          src: 'https://i.postimg.cc/MTkKmT2b/image.png',
          type: 'image/png',
        },
      ],
      id: site_base,
      scope: site_base,
      start_url: site_base,
      name: 'NG Gateway Doc',
      short_name: 'ng_gateway_doc',
      theme_color: '#ffffff',
    },
    outDir: resolve(process.cwd(), '.vitepress/dist'),
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{css,js,html,svg,png,ico,txt,woff2}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
  };
}

/**
 * Normalize a VitePress base path to always have leading & trailing slashes.
 *
 * Examples:
 * - `ng-gateway`   -> `/ng-gateway/`
 * - `/ng-gateway`  -> `/ng-gateway/`
 * - `/ng-gateway/` -> `/ng-gateway/`
 * - `/`            -> `/`
 */
function normalize_base(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '/';

  const with_leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return with_leading.endsWith('/') ? with_leading : `${with_leading}/`;
}

/**
 * Join a resource path with VitePress base.
 *
 * This avoids double slashes when base is `/`.
 */
function with_base(base: string, resource_path: string): string {
  if (resource_path.startsWith('/')) {
    return `${base === '/' ? '' : base}${resource_path}`;
  }
  return `${base}${resource_path}`;
}
