import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { Recordable } from '@vben/types';

import type { ComponentType } from './component';

import { h } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $te } from '@vben/locales';
import {
  setupVbenVxeTable,
  useVbenVxeGrid as useGrid,
} from '@vben/plugins/vxe-table';
import { get, isFunction, isString } from '@vben/utils';

import { objectOmit } from '@vueuse/core';
import {
  Button,
  Dropdown,
  Image,
  Menu,
  Switch,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { $t } from '#/locales';

import { useVbenForm } from './form';

setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        align: 'center',
        border: false,
        columnConfig: {
          resizable: true,
        },

        formConfig: {
          // 全局禁用vxe-table的表单配置，使用formOptions
          enabled: false,
        },
        minHeight: 180,
        proxyConfig: {
          autoLoad: true,
          response: {
            result: 'items',
            total: 'total',
            list: '',
          },
          showActiveMsg: true,
          showResponseMsg: false,
        },
        round: true,
        showOverflow: true,
        size: 'small',
      } as VxeTableGridOptions,
    });

    /**
     * 解决vxeTable在热更新时可能会出错的问题
     */
    vxeUI.renderer.forEach((_item, key) => {
      if (key.startsWith('Cell')) {
        vxeUI.renderer.delete(key);
      }
    });

    // 表格配置项可以用 cellRender: { name: 'CellImage' },
    vxeUI.renderer.add('CellImage', {
      renderTableDefault(renderOpts, params) {
        const { props } = renderOpts;
        const { column, row } = params;
        return h(Image, { src: row[column.field], ...props });
      },
    });

    // 表格配置项可以用 cellRender: { name: 'CellLink' },
    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        return h(
          Button,
          { size: 'small', type: 'link' },
          { default: () => props?.text },
        );
      },
    });

    // 单元格渲染： Tag
    vxeUI.renderer.add('CellTag', {
      renderTableDefault({ options, props }, { column, row }) {
        const value = get(row, column.field);
        const tagOptions = options ?? [
          { color: 'success', label: $t('common.enabled'), value: 1 },
          { color: 'error', label: $t('common.disabled'), value: 0 },
        ];
        const tagItem = tagOptions.find((item) => item.value === value);
        return h(
          Tag,
          {
            ...props,
            ...objectOmit(tagItem ?? {}, ['label']),
          },
          { default: () => tagItem?.label ?? value },
        );
      },
    });

    // 单元格渲染：连接状态
    vxeUI.renderer.add('CellConnectionState', {
      renderTableDefault(_renderOpts, { column, row }) {
        const raw = get(row, column.field) as { phase?: string } | null | undefined;
        const stateStr = String(raw?.phase ?? 'Disconnected');

        let color: string;
        let text: string;
        switch (stateStr) {
          case 'Connected': {
            color = 'success';
            text = $t('ui.connectionState.connected');
            break;
          }
          case 'Connecting': {
            color = 'processing';
            text = $t('ui.connectionState.connecting');
            break;
          }
          case 'Initializing': {
            color = 'processing';
            text = $t('ui.connectionState.initializing');
            break;
          }
          case 'Disconnected': {
            color = 'default';
            text = $t('ui.connectionState.disconnected');
            break;
          }
          case 'Failed': {
            color = 'error';
            text = $t('ui.connectionState.failed');
            break;
          }
          case 'Reconnecting': {
            color = 'warning';
            text = $t('ui.connectionState.reconnecting');
            break;
          }
          default: {
            color = 'default';
            text = stateStr;
          }
        }

        return h(Tag, { color }, { default: () => text });
      },
    });

    vxeUI.renderer.add('CellSwitch', {
      renderTableDefault({ attrs, props }, { column, row }) {
        const loadingKey = `__loading_${column.field}`;
        const finallyProps = {
          checkedChildren: $t('common.enabled'),
          checkedValue: 1,
          unCheckedChildren: $t('common.disabled'),
          unCheckedValue: 0,
          ...props,
          checked: row[column.field],
          loading: row[loadingKey] ?? false,
          'onUpdate:checked': onChange,
        };
        async function onChange(newVal: any) {
          row[loadingKey] = true;
          try {
            const result = await attrs?.beforeChange?.(newVal, row);
            if (result !== false) {
              row[column.field] = newVal;
            }
          } finally {
            row[loadingKey] = false;
          }
        }
        return h(Switch, finallyProps);
      },
    });

    /**
     * 注册表格的操作按钮渲染器
     */
    vxeUI.renderer.add('CellOperation', {
      renderTableDefault({ attrs, options, props }, { column, row }) {
        const defaultProps = { size: 'small', type: 'link', ...props };
        let align = 'end';
        switch (column.align) {
          case 'center': {
            align = 'center';
            break;
          }
          case 'left': {
            align = 'start';
            break;
          }
          default: {
            align = 'center';
            break;
          }
        }
        const operations: Array<Recordable<any>> = (
          options || ['edit', 'delete']
        )
          .map((opt) => {
            return isString(opt)
              ? {
                code: opt,
                text: $te(`common.${opt}`) ? $t(`common.${opt}`) : opt,
                ...defaultProps,
              }
              : { ...defaultProps, ...opt };
          })
          .map((opt) => {
            const optBtn: Recordable<any> = {};
            Object.keys(opt).forEach((key) => {
              optBtn[key] = isFunction(opt[key]) ? opt[key](row) : opt[key];
            });
            return optBtn;
          })
          .filter((opt) => opt.show !== false);

        function renderBtn(opt: Recordable<any>, listen = true) {
          const iconVNode = opt.icon
            ? h(IconifyIcon, { class: 'size-5', icon: opt.icon })
            : null;

          // Render button content: icon and optional text
          const buttonContent = opt.text
            ? [iconVNode, h('span', {}, opt.text)]
            : [iconVNode];

          const baseButton = h(
            Button,
            {
              ...props,
              ...objectOmit(opt, ['tooltip', 'dropdown', 'text']),
              icon: undefined,
              onClick: listen
                ? () =>
                  attrs?.onClick?.({
                    code: opt.code,
                    row,
                  })
                : undefined,
            },
            { default: () => buttonContent },
          );

          // Build Tooltip-wrapped trigger when tooltip is provided
          const tooltip = (opt as Recordable<any>).tooltip;
          let triggerNode = baseButton;
          if (tooltip) {
            const tooltipProps = isString(tooltip)
              ? { title: tooltip }
              : tooltip;
            triggerNode = h(Tooltip, tooltipProps, {
              default: () => baseButton,
            });
          }

          // When dropdown is configured, Dropdown should be the outermost wrapper
          const dropdown = (opt as Recordable<any>).dropdown;
          if (dropdown) {
            // Transform icon strings to VNodes for menu items
            const menuItems = (dropdown.items ?? []).map((item: any) => {
              if (item.icon && isString(item.icon)) {
                return {
                  ...item,
                  icon: () => h(IconifyIcon, { icon: item.icon }),
                };
              }
              return item;
            });

            // Create menu using overlay slot for better compatibility
            const menuNode = h(Menu, {
              items: menuItems,
              onClick: (info: any) => {
                attrs?.onClick?.({
                  code: opt.code,
                  row,
                  extra: { menuKey: info?.key, menuInfo: info },
                });
              },
            });

            return h(
              Dropdown,
              {
                trigger: ['click'],
              },
              {
                default: () => triggerNode,
                overlay: () => menuNode,
              },
            );
          }

          return triggerNode;
        }

        const btns = operations.map((opt) => renderBtn(opt, !opt?.dropdown));
        return h(
          'div',
          {
            class: 'flex table-operations',
            style: { justifyContent: align },
          },
          btns,
        );
      },
    });

    // 这里可以自行扩展 vxe-table 的全局配置，比如自定义格式化
    // vxeUI.formats.add
  },
  useVbenForm,
});

export const useVbenVxeGrid = <T extends Record<string, any>>(
  ...rest: Parameters<typeof useGrid<T, ComponentType>>
) => useGrid<T, ComponentType>(...rest);

export type OnActionClickParams<T = Recordable<any>> = {
  code: string;
  extra?: Recordable<any>;
  row: T;
};
export type OnActionClickFn<T = Recordable<any>> = (
  params: OnActionClickParams<T>,
) => void;
export type * from '@vben/plugins/vxe-table';
