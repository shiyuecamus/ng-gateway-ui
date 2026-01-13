import type { DefaultTheme } from 'vitepress';

import { defineConfig } from 'vitepress';

import { version } from '../../../package.json';

export const en = defineConfig({
  description: 'NG Gateway & High-performance IoT gateway',
  lang: 'en-US',
  themeConfig: {
    darkModeSwitchLabel: 'Theme',
    darkModeSwitchTitle: 'Switch to Dark Mode',
    docFooter: {
      next: 'Next Page',
      prev: 'Previous Page',
    },
    editLink: {
      pattern:
        'https://github.com/shiyuecamus/node-grove-gateway/edit/main/docs/src/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      copyright: `Copyright © 2020-${new Date().getFullYear()} Shiyuecamus`,
      message: 'Released under the MIT License.',
    },
    langMenuLabel: 'Language',
    lastUpdated: {
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium',
      },
      text: 'Last updated on',
    },
    lightModeSwitchTitle: 'Switch to Light Mode',
    nav: nav(),
    outline: {
      label: 'Navigate',
      level: 'deep',
    },
    returnToTopLabel: 'Back to top',
    // Best practice for product docs: a global sidebar tree so readers can always see the full TOC.
    sidebar: sidebar(),
  },
});

function sidebar(): DefaultTheme.SidebarItem[] {
  return [
    {
      collapsed: false,
      text: 'Overview',
      items: [
        { link: '/en/overview/', text: 'Product Overview' },
        { link: '/en/overview/architecture', text: 'Architecture' },
        { link: '/en/overview/concepts', text: 'Concepts' },
      ],
    },
    {
      collapsed: false,
      text: 'Ops',
      items: [
        { link: '/en/ops/deploy-helm', text: 'Helm Deployment' },
        { link: '/en/ops/tls', text: 'TLS & Security' },
        { link: '/en/ops/metrics', text: 'Metrics' },
        { link: '/en/ops/troubleshooting', text: 'Troubleshooting' },
      ],
    },
    {
      collapsed: false,
      text: 'Southward',
      items: [{ link: '/southward/overview', text: 'Overview' }],
    },
    {
      collapsed: false,
      text: 'Northward',
      items: [{ link: '/northward/mqtt-v5', text: 'MQTT v5' }],
    },
    {
      collapsed: false,
      text: 'Dev',
      items: [
        { link: '/en/dev/driver-dev', text: 'Driver Development' },
        { link: '/en/dev/plugin-dev', text: 'Plugin Development' },
      ],
    },
    {
      collapsed: true,
      text: 'Legacy Guide (vben)',
      items: [
        { link: '/en/guide/introduction/vben', text: 'About (Legacy)' },
        {
          link: '/en/guide/introduction/quick-start',
          text: 'Quick Start (Legacy)',
        },
      ],
    },
    {
      collapsed: true,
      text: 'Community',
      items: [
        { link: '/en/commercial/community', text: 'Community' },
        { link: '/en/commercial/technical-support', text: 'Technical Support' },
      ],
    },
  ];
}

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: 'Doc',
      link: '/en/overview/',
    },
    {
      text: version,
      items: [
        {
          link: 'https://github.com/vbenjs/vue-vben-admin/releases',
          text: 'Changelog',
        },
      ],
    },
    {
      link: '/commercial/technical-support',
      text: '🦄 Tech Support',
    },
    {
      link: '/sponsor/personal',
      text: '✨ Sponsor',
    },
    {
      link: '/commercial/community',
      text: '👨‍👦‍👦 Community',
    },
    // {
    //   link: '/friend-links/',
    //   text: '🤝 Friend Links',
    // },
  ];
}
