import type { Slots } from 'vue';

import type { ChannelRetainedStateUsage } from '#/api/core/resource-quota';

import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QuotaChannelState from '#/views/maintenance/resource-quotas/modules/quota-channel-state.vue';

const api = vi.hoisted(() => ({ list: vi.fn(), usage: vi.fn() }));

vi.mock('#/api/core/channel', () => ({ fetchChannelPage: api.list }));
vi.mock('#/api/core/resource-quota', () => ({
  getChannelRetainedStateUsage: api.usage,
}));
vi.mock('@vben/locales', () => ({
  $t: (key: string, values?: { value?: string }) =>
    values?.value ? `${values.value} B` : key,
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const card = (_: unknown, { slots }: { slots: Slots }) =>
    h('div', [slots.title?.(), slots.default?.()]);
  const content = (_: unknown, { slots }: { slots: Slots }) =>
    h('div', slots.default?.());
  return {
    Alert: (props: { message: string }) => h('p', props.message),
    Button: (props: { loading?: boolean }, { slots }: { slots: Slots }) =>
      h('button', { disabled: props.loading }, slots.default?.()),
    Card: card,
    Descriptions: content,
    DescriptionsItem: content,
    Empty: (props: { description: string }) => h('p', props.description),
    Pagination: content,
    Progress: content,
    Select: defineComponent({
      props: {
        options: { type: Array, required: true },
        value: { type: String, default: '' },
      },
      emits: ['change', 'search'],
      setup(props, { emit }) {
        return () =>
          h(
            'select',
            {
              value: props.value,
              onChange: (event: Event) =>
                emit('change', (event.target as HTMLSelectElement).value),
            },
            [
              h('option', { value: '' }),
              ...(props.options as { label: string; value: string }[]).map(
                ({ label, value }) => h('option', { value }, label),
              ),
            ],
          );
      },
    }),
    Spin: content,
    Tag: content,
    TypographyText: content,
  };
});

const reading = (
  channelId: number,
  used: string,
): ChannelRetainedStateUsage => ({
  accepting: true,
  channelId,
  configurationEpoch: '8',
  configurationRevision: '1',
  draining: false,
  ownerId: '61d55fb4-f399-4a06-a915-a926d34a702a',
  policyRevision: '2',
  refusedChannel: '0',
  refusedGateway: '0',
  retained: { available: '100', limit: '10000', peak: used, used },
  sampledAt: '2026-11-18T00:00:00.000Z',
});

describe('retained quota by channel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.list.mockReset().mockResolvedValue({
      records: [
        { id: 1, name: 'Feeder A' },
        { id: 2, name: 'Feeder B' },
        { configuration: { state: 'disabled' }, id: 3, name: 'Disabled C' },
      ],
      pages: 1,
      total: 3,
    });
    api.usage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts the previous request and preserves the newly selected channel', async () => {
    let finishOld!: (value: ChannelRetainedStateUsage) => void;
    api.usage
      .mockReturnValueOnce(
        new Promise<ChannelRetainedStateUsage>((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(reading(2, '4096'));

    const page = mount(QuotaChannelState, { props: { active: true } });
    await vi.advanceTimersByTimeAsync(300);
    await page.get('select').setValue('1');
    await page.get('select').setValue('2');
    await flushPromises();
    expect(api.usage.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
    expect(api.usage.mock.calls[0]?.[1].aborted).toBe(true);
    expect(page.text()).toContain(`${new Intl.NumberFormat().format(4096)} B`);

    finishOld(reading(1, '1337'));
    await flushPromises();
    expect(page.text()).toContain(`${new Intl.NumberFormat().format(4096)} B`);
    expect(page.text()).not.toContain(
      `${new Intl.NumberFormat().format(1337)} B`,
    );
    page.unmount();
  });

  it('reports a confirmed disabled scope or an unknown sample without a fake zero', async () => {
    api.usage.mockResolvedValue(null);
    const page = mount(QuotaChannelState, { props: { active: true } });
    await vi.advanceTimersByTimeAsync(300);
    await page.get('select').setValue('3');
    await flushPromises();
    expect(page.text()).toContain('channels.disabled');
    expect(page.text()).not.toContain('0 B');

    await page.get('select').setValue('2');
    await flushPromises();
    expect(page.text()).toContain('channels.unavailable');
    expect(page.text()).not.toContain('0 B');
    page.unmount();
  });
});
