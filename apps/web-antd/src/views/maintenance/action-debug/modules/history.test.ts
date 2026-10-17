import type { Slots } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import History from './history.vue';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('#/api/core/control', () => ({ listControlOperations: api.list }));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Form: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    FormItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Card: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Descriptions: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    DescriptionsItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Empty: (props: { description: string }) => h('p', props.description),
    DatePicker: (
      props: { value: string },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h('input', {
        value: props.value,
        onChange: (event: Event) =>
          emit('update:value', (event.target as HTMLInputElement).value),
      }),
    Checkbox: (
      props: { checked: boolean },
      { emit }: { emit: (event: string, value: boolean) => void },
    ) =>
      h('input', {
        type: 'checkbox',
        checked: props.checked,
        onChange: (event: Event) =>
          emit('update:checked', (event.target as HTMLInputElement).checked),
      }),
    List: defineComponent({
      props: { dataSource: { type: Array, required: true } },
      setup(props, { slots }) {
        return () =>
          h(
            'ol',
            props.dataSource.map((item) => slots.renderItem?.({ item })),
          );
      },
    }),
    ListItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('li', slots.default?.()),
    recordSequence: '1',
    Alert: (props: { message: string }) => h('p', props.message),
    Button: (
      props: { disabled?: boolean; loading?: boolean },
      { slots }: { slots: Slots },
    ) =>
      h(
        'button',
        { disabled: props.disabled || props.loading },
        slots.default?.(),
      ),
    Select: (
      props: {
        options: { label: string; value: string }[];
        value: string;
      },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h(
        'select',
        {
          value: props.value,
          onChange: (event: Event) =>
            emit('update:value', (event.target as HTMLSelectElement).value),
        },
        props.options.map((option) =>
          h('option', { value: option.value }, option.label),
        ),
      ),
    Tag: (props: { color?: string }, { slots }: { slots: Slots }) =>
      h('span', { title: props.color }, slots.default?.()),
  };
});

function entry(operationId: string) {
  return {
    authorityId: '9ae19bf8-5672-4c0a-84db-45b7b2187cce',
    channelId: 1,
    createdAt: '2026-09-23T07:00:00.123456789+00:00',
    deviceId: 2,
    operationId,
    principal: 'user:1',
    scope: 'http:point-write',
    state: 'indeterminate',
    updatedAt: '2026-09-23T07:00:01+00:00',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('control history pagination ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops the old page and cursor when the filter changes', async () => {
    api.list
      .mockResolvedValueOnce({
        items: [entry('original-operation')],
        nextCursor: {
          sequence: '1',
        },
      })
      .mockResolvedValueOnce({
        items: [entry('new-filter')],
        nextCursor: null,
      });
    const view = mount(History, {
      props: { canReadAll: false, principal: 'user:1' },
    });
    await flushPromises();
    expect(view.text()).toContain('original-operation');
    const status = view.findAll('select').at(1);
    if (!status) throw new Error('Status selector is absent');
    await status.setValue('all');
    expect(view.text()).not.toContain('original-operation');
    const search = view
      .findAll('button')
      .find((button) => button.text() === 'page.control.history.search');
    if (!search) throw new Error('History search is absent');
    await search.trigger('click');
    await flushPromises();
    expect(view.text()).toContain('new-filter');
    expect(api.list).toHaveBeenLastCalledWith({ audience: 'mine', limit: 25 });
    view.unmount();
  });

  it('ignores an old operator response after the authenticated principal changes', async () => {
    const oldPage = deferred<{
      items: ReturnType<typeof entry>[];
      nextCursor: null;
    }>();
    api.list.mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce({
      items: [entry('new-operator')],
      nextCursor: null,
    });
    const view = mount(History, {
      props: { canReadAll: false, principal: 'user:1' },
    });
    await view.setProps({ principal: 'user:2' });
    await flushPromises();
    oldPage.resolve({ items: [entry('old-operator')], nextCursor: null });
    await flushPromises();
    expect(view.text()).toContain('new-operator');
    expect(view.text()).not.toContain('old-operator');
    view.unmount();
  });
});
