import type { DefaultTheme } from 'vitepress';

import { defineConfig } from 'vitepress';

import { version } from '../../../package.json';

export const zh = defineConfig({
  description: 'NG Gateway & 新一代高性能 IoT 网关',
  lang: 'zh-Hans',
  themeConfig: {
    darkModeSwitchLabel: '主题',
    darkModeSwitchTitle: '切换到深色模式',
    docFooter: {
      next: '下一页',
      prev: '上一页',
    },
    editLink: {
      pattern:
        'https://github.com/shiyuecamus/ng-gateway/edit/main/docs/src/:path',
      text: '在 GitHub 上编辑此页面',
    },
    footer: {
      copyright: `Copyright © 2020-${new Date().getFullYear()} Shiyuecamus`,
      message: '基于 MIT 许可发布.',
    },
    langMenuLabel: '多语言',
    lastUpdated: {
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium',
      },
      text: '最后更新于',
    },
    lightModeSwitchTitle: '切换到浅色模式',
    nav: nav(),

    outline: {
      label: '页面导航',
      level: 'deep',
    },
    returnToTopLabel: '回到顶部',

    // Best practice for product docs: a global sidebar tree so readers can always see the full TOC.
    sidebar: sidebar(),
    sidebarMenuLabel: '菜单',
  },
});

function sidebar(): DefaultTheme.SidebarItem[] {
  return [
    {
      collapsed: false,
      text: '概览',
      items: [
        { link: '/overview/', text: '产品概览' },
        { link: '/overview/architecture', text: '核心架构' },
      ],
    },
    {
      collapsed: true,
      text: '安装',
      items: [
        { link: '/install/', text: '快速开始' },
        { link: '/install/docker', text: 'Docker' },
        { link: '/install/helm', text: 'Helm' },
        { link: '/install/macos', text: 'MacOS' },
        { link: '/install/linux', text: 'Linux' },
        { link: '/install/source-build', text: '源码编译' },
      ],
    },
    {
      collapsed: true,
      text: '南向',
      items: [
        { link: '/southward/overview', text: '南向总览' },
        {
          link: '/southward/data-types-transform',
          text: '数据类型 与 Transform',
        },
        { link: '/southward/group-collection', text: '分组采集' },
        {
          link: '/southward/driver-metadata-schema',
          text: 'Driver Metadata Schema',
        },
        { link: '/southward/iec104-bulk-import', text: 'IEC104 批量导入示例' },
        {
          text: '驱动',
          collapsed: true,
          items: [
            {
              text: 'Modbus',
              collapsed: true,
              items: [
                { link: '/southward/modbus/', text: '驱动概览与配置' },
                { link: '/southward/modbus/addressing', text: '地址与 quantity' },
                { link: '/southward/modbus/batching', text: '批量读写与调优' },
              ],
            },
            {
              text: '西门子 S7',
              collapsed: true,
              items: [
                { link: '/southward/s7/', text: '驱动概览与配置' },
                { link: '/southward/s7/addressing', text: 'S7 地址语法' },
              ],
            },
            {
              text: 'IEC 60870-5-104',
              collapsed: true,
              items: [
                { link: '/southward/iec104/', text: '驱动概览与配置' },
                { link: '/southward/iec104/typeid', text: 'TypeID 与建模' },
                { link: '/southward/iec104/link-timers', text: '链路定时器与背压' },
              ],
            },
            {
              text: 'DLT645',
              collapsed: true,
              items: [
                { link: '/southward/dlt645/', text: '驱动概览与配置' },
                {
                  link: '/southward/dlt645/address-di',
                  text: '表地址 / DI / 小数位',
                },
              ],
            },
            {
              text: 'CJT188',
              collapsed: true,
              items: [
                { link: '/southward/cjt188/', text: '驱动概览与配置' },
                { link: '/southward/cjt188/address-di', text: '地址 / 类型 / DI' },
              ],
            },
            {
              text: 'OPC UA',
              collapsed: true,
              items: [
                { link: '/southward/opcua/', text: '驱动概览与配置' },
                { link: '/southward/opcua/nodeid', text: 'NodeId 语法与获取' },
                { link: '/southward/opcua/security', text: '安全与认证' },
              ],
            },
            {
              text: 'Ethernet-IP',
              collapsed: true,
              items: [
                { link: '/southward/ethernet-ip/', text: '驱动概览与配置' },
                { link: '/southward/ethernet-ip/tag', text: 'Tag 建模与限制' },
              ],
            },
            {
              text: 'DNP3',
              collapsed: true,
              items: [
                { link: '/southward/dnp3/', text: '驱动概览与配置' },
                { link: '/southward/dnp3/groups', text: '对象组/索引/命令类型' },
                { link: '/southward/dnp3/crob', text: 'CROB ControlCode' },
              ],
            },
            {
              text: '三菱 MC',
              collapsed: true,
              items: [
                { link: '/southward/mc/', text: '驱动概览与配置' },
                { link: '/southward/mc/addressing', text: 'MC 地址语法' },
                { link: '/southward/mc/batching', text: '批量读写与调优' },
              ],
            },
          ],
        },
      ],
    },
    {
      collapsed: true,
      text: '北向',
      items: [
        { link: '/northward/overview', text: '北向总览' },
        {
          text: '模板',
          collapsed: true,
          items: [
            { link: '/northward/templates/variables', text: '变量' },
            { link: '/northward/templates/handlebars', text: 'Handlebars' },
          ],
        },
        {
          text: '上行 Payload',
          collapsed: true,
          items: [
            { link: '/northward/payload/overview', text: '总览' },
            { link: '/northward/payload/envelope-json', text: 'EnvelopeJson' },
            { link: '/northward/payload/kv', text: 'Kv' },
            { link: '/northward/payload/timeseries-rows', text: 'TimeseriesRows' },
            { link: '/northward/payload/mapped-json', text: 'MappedJson' },
            { link: '/northward/payload/mapped-json-jmespath', text: 'JMESPath 速查' },
          ],
        },
        {
          text: '下行 Downlink',
          collapsed: true,
          items: [
            { link: '/northward/downlink/overview', text: '总览' },
            { link: '/northward/downlink/envelope-json', text: 'EnvelopeJson' },
            { link: '/northward/downlink/mapped-json', text: 'MappedJson + Filter' },
          ],
        },
        { link: '/northward/troubleshooting', text: '排障索引' },
        {
          text: '插件',
          collapsed: true,
          items: [
            {
              text: 'Kafka',
              link: '/northward/kafka/',
              collapsed: true,
              items: [
                { link: '/northward/kafka/connection-security', text: '连接与安全' },
                { link: '/northward/kafka/uplink', text: '上行' },
                { link: '/northward/kafka/partitions', text: '分区与调优' },
                { link: '/northward/kafka/downlink', text: '下行' },
                { link: '/northward/kafka/examples', text: '配置示例' },
                { link: '/northward/kafka/troubleshooting', text: '排障' },
              ],
            },
            {
              text: 'Pulsar',
              link: '/northward/pulsar/',
              collapsed: true,
              items: [
                { link: '/northward/pulsar/connection-auth', text: '连接与鉴权' },
                { link: '/northward/pulsar/uplink', text: '上行' },
                { link: '/northward/pulsar/partitions', text: '分区与调优' },
                { link: '/northward/pulsar/downlink', text: '下行' },
                { link: '/northward/pulsar/examples', text: '配置示例' },
                { link: '/northward/pulsar/troubleshooting', text: '排障' },
              ],
            },
            {
              text: 'ThingsBoard',
              link: '/northward/thingsboard/',
              collapsed: true,
              items: [
                { link: '/northward/thingsboard/connection-modes', text: '连接模式' },
                { link: '/northward/thingsboard/provision', text: 'Provision' },
                { link: '/northward/thingsboard/uplink-format', text: '上行格式' },
                { link: '/northward/thingsboard/max-payload-bytes-and-chunking', text: 'Payload 上限与分片' },
                { link: '/northward/thingsboard/rpc-and-attributes', text: 'RPC/Attributes 下行' },
                { link: '/northward/thingsboard/examples', text: '配置示例' },
              ],
            },
            {
              text: 'OPC UA Server',
              link: '/northward/opcua-server/',
              collapsed: true,
              items: [
                { link: '/northward/opcua-server/node-mapping', text: 'Node 映射' },
                { link: '/northward/opcua-server/security', text: '安全与证书' },
                { link: '/northward/opcua-server/writeback', text: '写回' },
                { link: '/northward/opcua-server/troubleshooting', text: '排障' },
              ],
            },
            // { link: '/northward/mqtt', text: 'MQTT（占位）' },
            // { link: '/northward/websocket', text: 'WebSocket（占位）' },
            // { link: '/northward/http', text: 'HTTP（占位）' },
          ],
        },
      ],
    },
    {
      collapsed: true,
      text: '运维',
      items: [
        { link: '/ops/data-monitor', text: '数据监控' },
        { link: '/ops/action-debug', text: 'Action 调试' },
        { link: '/ops/net-debug', text: '网络调试' },
        { link: '/ops/branding', text: '白标' },
        { link: '/ops/configuration', text: '配置管理' },
      ],
    },
    {
      collapsed: true,
      text: '开发',
      items: [
        { link: '/dev/local-dev', text: '本地开发' },
        { link: '/dev/driver-dev', text: '南向驱动开发' },
        { link: '/dev/plugin-dev', text: '北向插件开发' },
      ],
    },
    {
      collapsed: true,
      text: '指南',
      items: [
        { link: '/guide/other/release', text: '发布日志' },
        { link: '/guide/introduction/roadmap', text: '路线图' },
      ],
    },
    {
      collapsed: true,
      text: '附录',
      items: [
        { link: '/appendix/data-types', text: '数据类型' },
        { link: '/appendix/protocol-docs', text: '协议文档' },
      ],
    },
  ];
}

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: '文档',
      link: '/overview/',
    },
    {
      text: version,
      items: [
        {
          link: 'https://github.com/vbenjs/vue-vben-admin/releases',
          text: '更新日志',
        },
      ],
    },
    {
      link: '/commercial/technical-support',
      text: '🦄 技术支持',
    },
    {
      link: '/sponsor/personal',
      text: '✨ 赞助',
    },
    // {
    //   link: '/commercial/community',
    //   text: '👨‍👦‍👦 交流群',
    //   items: [
    //     {
    //       link: 'https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=22ySzj7pKiw&businessType=9&from=246610&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl#/pc',
    //       text: 'QQ频道',
    //     },
    //     {
    //       link: 'https://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=mjZmlhgVzzUxvdxllB6C1vHpX8O8QRL0&authKey=DBdFbBwERmfaKY95JvRWqLCJIRGJAmKyZbrpzZ41EKDMZ5SR6MfbjOBaaNRN73fr&noverify=0&group_code=4286109',
    //       text: 'QQ群',
    //     },
    //     {
    //       link: 'https://discord.gg/VU62jTecad',
    //       text: 'Discord',
    //     },
    //   ],
    // },
    // {
    //   link: '/friend-links/',
    //   text: '🤝 友情链接',
    // },
  ];
}

export const search: DefaultTheme.AlgoliaSearchOptions['locales'] = {
  root: {
    placeholder: '搜索文档',
    translations: {
      button: {
        buttonAriaLabel: '搜索文档',
        buttonText: '搜索文档',
      },
      modal: {
        errorScreen: {
          helpText: '你可能需要检查你的网络连接',
          titleText: '无法获取结果',
        },
        footer: {
          closeText: '关闭',
          navigateText: '切换',
          searchByText: '搜索提供者',
          selectText: '选择',
        },
        noResultsScreen: {
          noResultsText: '无法找到相关结果',
          reportMissingResultsLinkText: '点击反馈',
          reportMissingResultsText: '你认为该查询应该有结果？',
          suggestedQueryText: '你可以尝试查询',
        },
        searchBox: {
          cancelButtonAriaLabel: '取消',
          cancelButtonText: '取消',
          resetButtonAriaLabel: '清除查询条件',
          resetButtonTitle: '清除查询条件',
        },
        startScreen: {
          favoriteSearchesTitle: '收藏',
          noRecentSearchesText: '没有搜索历史',
          recentSearchesTitle: '搜索历史',
          removeFavoriteSearchButtonTitle: '从收藏中移除',
          removeRecentSearchButtonTitle: '从搜索历史中移除',
          saveRecentSearchButtonTitle: '保存至搜索历史',
        },
      },
    },
  },
};
