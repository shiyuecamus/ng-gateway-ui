import type { VueWrapper } from '@vue/test-utils';
import type { Slots } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuotaAlarms from '#/views/maintenance/resource-quotas/modules/quota-alarms.vue';

const api = vi.hoisted(() => ({
  state: vi.fn(),
  rules: vi.fn(),
  update: vi.fn(),
  act: vi.fn(),
  alarmAudit: vi.fn(),
  ruleAudit: vi.fn(),
}));

vi.mock('#/api/core/resource-alarms', () => ({
  getResourceAlarms: api.state,
  getResourceAlarmRules: api.rules,
  updateResourceAlarmRule: api.update,
  recordResourceAlarmAction: api.act,
  getResourceAlarmEvents: api.alarmAudit,
  getResourceAlarmRuleEvents: api.ruleAudit,
}));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = (_: unknown, { slots }: { slots: Slots }) =>
    h('div', [slots.title?.(), slots.default?.()]);
  return {
    Alert: (props: { message: string }, { slots }: { slots: Slots }) =>
      h('div', [h('p', props.message), slots.action?.()]),
    Button: (props: { disabled?: boolean }, { slots }: { slots: Slots }) =>
      h('button', { disabled: props.disabled }, slots.default?.()),
    Card: (props: { title?: string }, { slots }: { slots: Slots }) =>
      h('div', [props.title, slots.title?.(), slots.default?.()]),
    Descriptions: content,
    DescriptionsItem: (
      props: { label?: string },
      { slots }: { slots: Slots },
    ) => h('div', [h('span', props.label), slots.default?.()]),
    Empty: content,
    Form: content,
    FormItem: content,
    InputNumber: content,
    Modal: defineComponent({
      props: {
        open: Boolean,
        okText: { type: String, default: '' },
        okButtonProps: { type: Object, default: () => ({}) },
      },
      emits: ['ok'],
      setup(props, { emit, slots }) {
        return () =>
          props.open
            ? h('section', { role: 'dialog' }, [
                slots.default?.(),
                props.okText
                  ? h(
                      'button',
                      {
                        disabled: props.okButtonProps?.disabled,
                        onClick: () => emit('ok'),
                      },
                      props.okText,
                    )
                  : null,
              ])
            : null;
      },
    }),
    Segmented: content,
    Select: content,
    Skeleton: content,
    Switch: content,
    Tag: content,
    Textarea: (
      props: { disabled?: boolean; value: string },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h('textarea', {
        disabled: props.disabled,
        value: props.value,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLTextAreaElement).value),
      }),
    Timeline: content,
    TimelineItem: content,
    TypographyText: content,
  };
});

const prefix = 'page.maintenance.resourceQuotas.alarms.';
const rule = {
  id: 1,
  resource: 'extension_store',
  revision: '2',
  metric: 'pending_operations',
  maximumThreshold: 1000,
  thresholdUnit: 'per_mille',
  severity: 'warning',
  enabled: true,
  highThreshold: 800,
  clearThreshold: 700,
  fireAfterMs: '30000',
  recoverAfterMs: '60000',
};
const firing = {
  id: '12345678-1234-4234-8234-123456789012',
  phase: 'FIRING',
  ruleId: 1,
  ruleRevision: '2',
  openedAt: '2026-11-18T00:00:00Z',
  ownerId: '12345678-1234-4234-8234-123456789013',
  recovery: null,
  silencedUntil: null,
  recoveredWithSuccessfulHandoffs: null,
};
const health = {
  current: true,
  persistenceUnavailable: false,
  historySaturated: false,
  sourceAvailable: true,
  sampledAt: '2026-11-18T00:00:01Z',
};

function button(wrapper: VueWrapper, key: string) {
  const item = wrapper
    .findAll('button')
    .find((element) => element.text() === prefix + key);
  if (!item) throw new Error(`Missing alarm action ${key}`);
  return item;
}

describe('resource alarm console', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.rules.mockResolvedValue([rule]);
    api.state.mockResolvedValue({
      alarms: [firing],
      health,
      canAudit: false,
      canManage: true,
    });
  });

  it('shows terminal archived incidents and reads their original scoped audit', async () => {
    const scope = { appId: 41, resource: 'northward_app_queue' } as const;
    api.state.mockResolvedValue({
      alarms: [{ ...firing, phase: 'RECOVERED' }],
      health: { ...health, current: false, sourceAvailable: false },
      canAudit: true,
      canManage: true,
    });
    api.alarmAudit.mockResolvedValue([
      {
        sequence: '4',
        recordedAtMs: '1795123200000',
        event: { kind: 'observation', phase: 'RECOVERED' },
      },
    ]);
    const wrapper = mount(QuotaAlarms, { props: { archived: true, scope } });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain(`${prefix}appArchiveTitle`);
    expect(text).toContain(`${prefix}phase.RECOVERED`);
    expect(text).not.toContain(`${prefix}appSampleUnavailable`);
    expect(text).not.toContain(`${prefix}editRule`);
    await button(wrapper, 'audit').trigger('click');
    await flushPromises();
    expect(api.alarmAudit).toHaveBeenCalledWith(firing.id, scope);
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      `${prefix}phase.RECOVERED`,
    );
    wrapper.unmount();
  });

  it('shows durable pressure to readers while keeping management and audit independent', async () => {
    api.state.mockResolvedValue({
      alarms: [firing],
      health,
      canAudit: false,
      canManage: false,
    });
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'extension_store' } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain(`${prefix}phase.FIRING`);
    expect(wrapper.findAll('button')).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps an issued silence expiry on retry after an uncertain response', async () => {
    api.act.mockRejectedValueOnce(new Error('connection interrupted'));
    api.act.mockResolvedValue(firing);
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'extension_store' } },
    });
    await flushPromises();
    await button(wrapper, 'silence').trigger('click');
    await wrapper
      .get('textarea')
      .setValue('Investigate the live actor backlog');
    await button(wrapper, 'confirmAction').trigger('click');
    await flushPromises();
    const first = api.act.mock.calls[0]?.[1];
    expect(first?.acknowledge).toBe(false);
    expect(first?.silenceUntil).toMatch(/Z$/);
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    await button(wrapper, 'retryAction').trigger('click');
    await flushPromises();
    expect(api.act).toHaveBeenLastCalledWith(firing.id, first, {
      resource: 'extension_store',
    });
    expect(wrapper.text()).toContain(`${prefix}phase.FIRING`);
    wrapper.unmount();
  });

  it('displays each dimension using the threshold unit from its actual descriptor', async () => {
    api.rules.mockResolvedValue([
      rule,
      {
        ...rule,
        id: 5,
        metric: 'refusals_per_second',
        thresholdUnit: 'per_second',
        maximumThreshold: 100_000,
        highThreshold: 5,
        clearThreshold: 1,
      },
      {
        ...rule,
        id: 6,
        metric: 'owner_progress_age',
        thresholdUnit: 'milliseconds',
        maximumThreshold: 300_000,
        highThreshold: 2000,
        clearThreshold: 1000,
      },
    ]);
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'extension_store' } },
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('80%');
    expect(text).toContain(`5 ${prefix}unit.per_second`);
    expect(text).toContain(
      `${new Intl.NumberFormat().format(2000n)} ${prefix}unit.milliseconds`,
    );
    wrapper.unmount();
  });

  it('preserves the management resource and shows its live low-pressure window', async () => {
    api.rules.mockResolvedValue([
      {
        ...rule,
        id: 10,
        metric: 'source_backing_refusals_per_second',
        thresholdUnit: 'per_second',
        resource: 'quota_management',
        highThreshold: 5,
        clearThreshold: 1,
      },
    ]);
    api.state.mockResolvedValue({
      alarms: [
        {
          ...firing,
          ruleId: 10,
          recovery: {
            startedAtUptimeMs: '2500',
            successfulHandoffsAtStart: '48',
          },
        },
      ],
      canAudit: false,
      canManage: true,
      health,
    });
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'quota_management' } },
    });
    await flushPromises();
    expect(api.state).toHaveBeenCalledWith({ resource: 'quota_management' });
    expect(api.rules).toHaveBeenCalledWith({ resource: 'quota_management' });
    expect(wrapper.text()).toContain(`${prefix}observingRecovery`);
    expect(wrapper.text()).toContain(`${prefix}recoveryBaseline`);
    expect(wrapper.text()).toContain('48');
    api.act.mockResolvedValue(firing);
    await button(wrapper, 'acknowledge').trigger('click');
    await wrapper.get('textarea').setValue('Verify original managed reads');
    await button(wrapper, 'confirmAction').trigger('click');
    await flushPromises();
    expect(api.act).toHaveBeenCalledWith(
      firing.id,
      {
        acknowledge: true,
        reason: 'Verify original managed reads',
        silenceUntil: null,
      },
      { resource: 'quota_management' },
    );
    wrapper.unmount();
  });

  it('prevents submitting an obsolete edit and reloads the new revision on request', async () => {
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'extension_store' } },
    });
    await flushPromises();
    await button(wrapper, 'editRule').trigger('click');
    api.rules.mockResolvedValue([{ ...rule, revision: '3' }]);
    await wrapper.vm.refresh();
    await flushPromises();
    expect(button(wrapper, 'saveRule').attributes('disabled')).toBeDefined();
    await button(wrapper, 'loadLatestRule').trigger('click');
    expect(button(wrapper, 'saveRule').attributes('disabled')).toBeUndefined();
    api.update.mockResolvedValue({ ...rule, revision: '3' });
    await button(wrapper, 'saveRule').trigger('click');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith(
      { resource: 'extension_store' },
      expect.objectContaining({ expectedRevision: '3' }),
    );
    wrapper.unmount();
  });

  it('identifies acknowledgement and timed silence as distinct audited actions', async () => {
    api.state.mockResolvedValue({
      alarms: [firing],
      canAudit: true,
      canManage: false,
      health,
    });
    const expiresAt = '2026-11-18T00:15:00Z';
    api.alarmAudit.mockResolvedValue([
      {
        sequence: '1',
        recordedAtMs: '1794960000000',
        event: {
          acknowledged: true,
          actorId: 1,
          kind: 'operator',
          phase: 'ACKNOWLEDGED',
          reason: 'Check the source owner',
        },
      },
      {
        sequence: '2',
        recordedAtMs: '1794960002000',
        event: {
          acknowledged: false,
          actorId: 1,
          kind: 'operator',
          phase: 'ACKNOWLEDGED',
          reason: 'Wait for the low-pressure window',
          silencedUntil: expiresAt,
        },
      },
    ]);
    const wrapper = mount(QuotaAlarms, {
      props: { scope: { resource: 'quota_management' } },
    });
    await flushPromises();
    await button(wrapper, 'audit').trigger('click');
    await flushPromises();
    const text = wrapper.get('[role="dialog"]').text();
    expect(text).toContain(`${prefix}acknowledge`);
    expect(text).toContain(`${prefix}silence`);
    expect(text).toContain(`${prefix}silencedUntil`);
    expect(text).toContain(new Date(expiresAt).toLocaleString());
    expect(text).toContain('Wait for the low-pressure window');
    expect(api.alarmAudit).toHaveBeenCalledWith(firing.id, {
      resource: 'quota_management',
    });
    wrapper.unmount();
  });
});
