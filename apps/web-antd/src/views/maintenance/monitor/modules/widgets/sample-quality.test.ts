import type { MonitorRow } from '@vben/types';

import { flushPromises, mount } from '@vue/test-utils';

import { Tag } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';

import SampleQuality from './sample-quality.vue';

vi.mock('@vben/locales', () => ({
  $t: (key: string, values?: Record<string, unknown>) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock('@vben/icons', () =>
  Object.fromEntries(
    ['ChevronDown', 'CircleCheckBig', 'Info', 'InspectionPanel', 'X'].map(
      (name) => [name, { template: '<span />' }],
    ),
  ),
);

function row(): MonitorRow & {
  timeFacts: NonNullable<MonitorRow['timeFacts']>;
} {
  return {
    id: '1-telemetry-status',
    deviceId: 1,
    deviceName: 'PlantDomain',
    key: 'status',
    value: true,
    sourceQuality: 'good',
    sourceMode: 'normal',
    freshness: 'current',
    sourceType: 'telemetry',
    stateChangedAt: '2023-11-15T06:13:20Z',
    timeFacts: {
      accuracy: 10,
      clockFailure: false,
      clockNotSynchronized: false,
      leapSecondsKnown: true,
      raw: { protocol: 'iec61850.timeQuality', bytes: [138], bitLen: 8 },
      substituted: null,
      summerTime: null,
      validity: 'unknown',
    },
  };
}

const options = {
  global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
  attachTo: document.body,
};

describe('sample quality evidence', () => {
  it('keeps missing time flags distinct from explicit false and true', async () => {
    const wrapper = mount(SampleQuality, {
      ...options,
      props: { row: row(), open: true },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true),
    );
    const facts = wrapper.findAll('dl > div');
    for (const [key, text, color] of [
      ['clockFailure', 'no', 'success'],
      ['unsynchronized', 'no', 'success'],
      ['summerTime', 'unknown', 'default'],
      ['substituted', 'unknown', 'default'],
      ['leapSecondsKnown', 'yes', 'cyan'],
    ]) {
      const fact = facts.find((item) =>
        item.get('dt').text().endsWith(`.${key}`),
      );
      expect(fact?.get('dd').text()).toMatch(
        new RegExp(String.raw`\.${text}$`),
      );
      expect(fact?.getComponent(Tag).props('color')).toBe(color);
    }
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      'iec61850.timeQuality',
    );
    expect(wrapper.get('code').text()).toBe('8a');
    wrapper.unmount();
  });

  it('shows adverse flags and test sources without turning them into healthy evidence', async () => {
    const sample = row();
    sample.sourceQuality = 'invalid';
    sample.sourceMode = 'test';
    sample.timeFacts = {
      ...sample.timeFacts,
      clockFailure: true,
      clockNotSynchronized: true,
      substituted: true,
    };
    const wrapper = mount(SampleQuality, {
      ...options,
      props: { row: sample, open: true },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true),
    );
    const tags = wrapper.findAllComponents(Tag);
    expect(
      tags.filter((tag) => tag.props('color') === 'error').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      tags.filter((tag) => tag.props('color') === 'warning').length,
    ).toBeGreaterThanOrEqual(3);
    expect(wrapper.get('.quality-trigger').text()).toContain('sourceMode.test');
    expect(wrapper.find(String.raw`.border-red-500\/20`).exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders absent time evidence as unknown and retains a zero accuracy code', async () => {
    const sample: MonitorRow = row();
    sample.timeFacts = null;
    const wrapper = mount(SampleQuality, {
      ...options,
      props: { row: sample, open: true },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true),
    );
    expect(
      wrapper
        .findAll('dl dd')
        .every((item) => item.text().endsWith('.unknown')),
    ).toBe(true);
    expect(wrapper.findAll('code')).toHaveLength(0);
    await wrapper.setProps({
      row: { ...row(), timeFacts: { ...row().timeFacts, accuracy: 0 } },
    });
    expect(wrapper.findAll('dl dd').at(-1)?.text()).toBe('0');
    wrapper.unmount();
  });

  it('closes with Escape and restores focus to the named trigger', async () => {
    const wrapper = mount(SampleQuality, {
      ...options,
      attachTo: document.body,
      props: { row: row(), open: true },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true),
    );
    const trigger = wrapper.get('.quality-trigger');
    expect(trigger.attributes('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(trigger.attributes('aria-controls')).toBe(
      wrapper.get('[role="dialog"]').attributes('id'),
    );
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    await wrapper.setProps({ open: false });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(trigger.element),
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
