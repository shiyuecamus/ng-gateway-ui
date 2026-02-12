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
        'https://github.com/shiyuecamus/ng-gateway/edit/main/docs/src/:path',
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
    sidebarMenuLabel: 'Menu',
  },
});

function sidebar(): DefaultTheme.SidebarItem[] {
  return [
    {
      collapsed: false,
      text: 'Overview',
      items: [
        { link: '/en/overview/', text: 'Product Overview' },
        { link: '/en/overview/architecture', text: 'Core Architecture' },
      ],
    },
    {
      collapsed: true,
      text: 'Install',
      items: [
        { link: '/en/install/', text: 'Quick Start' },
        { link: '/en/install/docker', text: 'Docker' },
        { link: '/en/install/helm', text: 'Helm' },
        { link: '/en/install/macos', text: 'macOS' },
        { link: '/en/install/linux', text: 'Linux' },
        { link: '/en/install/source-build', text: 'Build from Source' },
      ],
    },
    {
      collapsed: true,
      text: 'Southward',
      items: [
        { link: '/en/southward/overview', text: 'Overview' },
        { link: '/en/southward/data-types-transform', text: 'Data Types & Transform' },
        { link: '/en/southward/group-collection', text: 'Group Collection' },
        {
          link: '/en/southward/driver-metadata-schema',
          text: 'Driver Metadata Schema',
        },
        { link: '/en/southward/iec104-bulk-import', text: 'IEC104 Bulk Import Example' },
        {
          text: 'Drivers',
          collapsed: true,
          items: [
            {
              text: 'Modbus',
              collapsed: true,
              items: [
                { link: '/en/southward/modbus/', text: 'Overview & Configuration' },
                { link: '/en/southward/modbus/addressing', text: 'Addressing & Quantity' },
                { link: '/en/southward/modbus/batching', text: 'Batch Read/Write & Tuning' },
              ],
            },
            {
              text: 'Siemens S7',
              collapsed: true,
              items: [
                { link: '/en/southward/s7/', text: 'Overview & Configuration' },
                { link: '/en/southward/s7/addressing', text: 'S7 Address Syntax' },
              ],
            },
            {
              text: 'IEC 60870-5-104',
              collapsed: true,
              items: [
                { link: '/en/southward/iec104/', text: 'Overview & Configuration' },
                { link: '/en/southward/iec104/typeid', text: 'TypeID & Modeling' },
                { link: '/en/southward/iec104/link-timers', text: 'Link Timers & Backpressure' },
              ],
            },
            {
              text: 'DLT645',
              collapsed: true,
              items: [
                { link: '/en/southward/dlt645/', text: 'Overview & Configuration' },
                { link: '/en/southward/dlt645/address-di', text: 'Meter Address / DI / Decimals' },
              ],
            },
            {
              text: 'CJT188',
              collapsed: true,
              items: [
                { link: '/en/southward/cjt188/', text: 'Overview & Configuration' },
                { link: '/en/southward/cjt188/address-di', text: 'Address / Type / DI' },
              ],
            },
            {
              text: 'OPC UA',
              collapsed: true,
              items: [
                { link: '/en/southward/opcua/', text: 'Overview & Configuration' },
                { link: '/en/southward/opcua/nodeid', text: 'NodeId Syntax & Fetching' },
                { link: '/en/southward/opcua/security', text: 'Security & Authentication' },
              ],
            },
            {
              text: 'EtherNet/IP',
              collapsed: true,
              items: [
                { link: '/en/southward/ethernet-ip/', text: 'Overview & Configuration' },
                { link: '/en/southward/ethernet-ip/tag', text: 'Tag Modeling & Limits' },
              ],
            },
            {
              text: 'DNP3',
              collapsed: true,
              items: [
                { link: '/en/southward/dnp3/', text: 'Overview & Configuration' },
                { link: '/en/southward/dnp3/groups', text: 'Object Groups / Index / Command Types' },
                { link: '/en/southward/dnp3/crob', text: 'CROB ControlCode' },
              ],
            },
            {
              text: 'Mitsubishi MC',
              collapsed: true,
              items: [
                { link: '/en/southward/mc/', text: 'Overview & Configuration' },
                { link: '/en/southward/mc/addressing', text: 'MC Address Syntax' },
                { link: '/en/southward/mc/batching', text: 'Batch Read/Write & Tuning' },
              ],
            },
          ],
        },
      ],
    },
    {
      collapsed: true,
      text: 'Northward',
      items: [
        {
          link: '/en/northward/overview',
          text: 'Overview',
        },
        {
          text: 'Templates',
          collapsed: true,
          items: [
            { link: '/en/northward/templates/variables', text: 'Variables' },
            { link: '/en/northward/templates/handlebars', text: 'Handlebars' },
          ],
        },
        {
          text: 'Uplink Payload',
          collapsed: true,
          items: [
            { link: '/en/northward/payload/overview', text: 'Overview' },
            { link: '/en/northward/payload/envelope-json', text: 'EnvelopeJson' },
            { link: '/en/northward/payload/kv', text: 'Kv' },
            { link: '/en/northward/payload/timeseries-rows', text: 'TimeseriesRows' },
            { link: '/en/northward/payload/mapped-json', text: 'MappedJson' },
            { link: '/en/northward/payload/mapped-json-jmespath', text: 'JMESPath Cheat Sheet' },
          ],
        },
        {
          text: 'Downlink',
          collapsed: true,
          items: [
            { link: '/en/northward/downlink/overview', text: 'Overview' },
            { link: '/en/northward/downlink/envelope-json', text: 'EnvelopeJson' },
            { link: '/en/northward/downlink/mapped-json', text: 'MappedJson + Filter' },
          ],
        },
        { link: '/en/northward/troubleshooting', text: 'Troubleshooting Index' },
        {
          text: 'Plugins',
          collapsed: true,
          items: [
            {
              text: 'Kafka',
              link: '/en/northward/kafka/',
              collapsed: true,
              items: [
                { link: '/en/northward/kafka/connection-security', text: 'Connection & Security' },
                { link: '/en/northward/kafka/uplink', text: 'Uplink' },
                { link: '/en/northward/kafka/partitions', text: 'Partitions & Tuning' },
                { link: '/en/northward/kafka/downlink', text: 'Downlink' },
                { link: '/en/northward/kafka/examples', text: 'Examples' },
                { link: '/en/northward/kafka/troubleshooting', text: 'Troubleshooting' },
              ],
            },
            {
              text: 'Pulsar',
              link: '/en/northward/pulsar/',
              collapsed: true,
              items: [
                { link: '/en/northward/pulsar/connection-auth', text: 'Connection & Authentication' },
                { link: '/en/northward/pulsar/uplink', text: 'Uplink' },
                { link: '/en/northward/pulsar/partitions', text: 'Partitions & Tuning' },
                { link: '/en/northward/pulsar/downlink', text: 'Downlink' },
                { link: '/en/northward/pulsar/examples', text: 'Examples' },
                { link: '/en/northward/pulsar/troubleshooting', text: 'Troubleshooting' },
              ],
            },
            {
              text: 'ThingsBoard',
              link: '/en/northward/thingsboard/',
              collapsed: true,
              items: [
                { link: '/en/northward/thingsboard/connection-modes', text: 'Connection Modes' },
                { link: '/en/northward/thingsboard/provision', text: 'Provision' },
                { link: '/en/northward/thingsboard/uplink-format', text: 'Uplink Format' },
                { link: '/en/northward/thingsboard/max-payload-bytes-and-chunking', text: 'Payload Limits & Chunking' },
                { link: '/en/northward/thingsboard/rpc-and-attributes', text: 'RPC / Attributes Downlink' },
                { link: '/en/northward/thingsboard/examples', text: 'Examples' },
              ],
            },
            {
              text: 'OPC UA Server',
              link: '/en/northward/opcua-server/',
              collapsed: true,
              items: [
                { link: '/en/northward/opcua-server/node-mapping', text: 'Node Mapping' },
                { link: '/en/northward/opcua-server/security', text: 'Security & Certificates' },
                { link: '/en/northward/opcua-server/writeback', text: 'Writeback' },
                { link: '/en/northward/opcua-server/troubleshooting', text: 'Troubleshooting' },
              ],
            },
            // { link: '/en/northward/mqtt', text: 'MQTT (Placeholder)' },
            // { link: '/en/northward/websocket', text: 'WebSocket (Placeholder)' },
            // { link: '/en/northward/http', text: 'HTTP (Placeholder)' },
          ],
        },
      ],
    },
    {
      collapsed: true,
      text: 'Ops',
      items: [
        { link: '/en/ops/data-monitor', text: 'Data Monitor' },
        { link: '/en/ops/observability', text: 'Observability' },
        { link: '/en/ops/action-debug', text: 'Action Debug' },
        { link: '/en/ops/net-debug', text: 'Network Debug' },
        { link: '/en/ops/branding', text: 'Branding' },
        { link: '/en/ops/configuration', text: 'Configuration' },
      ],
    },
    {
      collapsed: true,
      text: 'Dev',
      items: [
        { link: '/en/dev/local-dev', text: 'Local Development' },
        { link: '/en/dev/driver-dev', text: 'Southward Driver Development' },
        { link: '/en/dev/plugin-dev', text: 'Northward Plugin Development' },
      ],
    },
    {
      collapsed: true,
      text: 'Guide',
      items: [
        { link: '/en/guide/introduction/roadmap', text: 'Roadmap' },
        { link: '/en/guide/tools', text: 'Simulators & Tools' },
        {
          text: 'Benchmark',
          collapsed: true,
          items: [
            { link: '/en/guide/benchmark/modbus', text: 'Modbus' },
            { link: '/en/guide/benchmark/opcua', text: 'OPC UA' },
          ],
        },
      ],
    },
  ];
}

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: 'Docs',
      link: '/en/overview/',
    },
    {
      text: version,
      items: [
        {
          link: 'https://github.com/shiyuecamus/ng-gateway/releases',
          text: 'Changelog',
        },
      ],
    },
    {
      link: '/en/commercial/technical-support',
      text: '🦄 Technical Support',
    },
    {
      link: '/en/sponsor/personal',
      text: '✨ Sponsor',
    },
    // {
    //   link: '/en/commercial/community',
    //   text: '👨‍👦‍👦 Community',
    //   items: [
    //     {
    //       link: 'https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=22ySzj7pKiw&businessType=9&from=246610&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl#/pc',
    //       text: 'QQ Channel',
    //     },
    //     {
    //       link: 'https://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=mjZmlhgVzzUxvdxllB6C1vHpX8O8QRL0&authKey=DBdFbBwERmfaKY95JvRWqLCJIRGJAmKyZbrpzZ41EKDMZ5SR6MfbjOBaaNRN73fr&noverify=0&group_code=4286109',
    //       text: 'QQ Group',
    //     },
    //     {
    //       link: 'https://discord.gg/VU62jTecad',
    //       text: 'Discord',
    //     },
    //   ],
    // },
    // {
    //   link: '/en/friend-links/',
    //   text: '🤝 Friend Links',
    // },
  ];
}
