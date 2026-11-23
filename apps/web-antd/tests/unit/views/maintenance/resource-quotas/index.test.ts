import type { VueWrapper } from '@vue/test-utils';
import type { Slots } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import ResourceQuotas from '#/views/maintenance/resource-quotas/index.vue';
import QuotaPolicyTable from '#/views/maintenance/resource-quotas/modules/quota-policy-table.vue';
import QuotaResourceDirectory from '#/views/maintenance/resource-quotas/modules/quota-resource-directory.vue';

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  byId: vi.fn(),
  byRequest: vi.fn(),
  preview: vi.fn(),
  submit: vi.fn(),
  usage: vi.fn(),
  resources: [
    'extension-store',
    'northward-events',
    'northward-event-queue',
    'northward-app-configuration',
    'southward-retained-state',
    'southward-configuration',
    'southward-materials',
    'ethernet-capture',
    'control-admission',
    'capability-admission',
    'native-libraries',
    'engineering-admission',
    'engineering-assets',
    'engineering-browse',
    'engineering-comparison',
    'engineering-mapping',
    'engineering-publication',
    'engineering-validator',
    'auth-admission',
    'login-admission',
    'session-admission',
    'authorization-policy',
    'websocket-admission',
    'websocket-traffic',
    'web-ui-preparation',
    'web-ui-response',
    'web-tls-pem',
    'web-tls-work',
    'web-template-transport',
    'web-template-workbook',
    'http-ingress',
  ],
}));

vi.mock('#/api/core/app', () => ({ fetchAppPage: vi.fn() }));
vi.mock('#/api/core/channel', () => ({ fetchChannelPage: vi.fn() }));
vi.mock('#/api/core/resource-alarms', () => ({
  getArchivedAppAlarmScopes: vi.fn(),
}));
vi.mock('#/api/core/resource-quota', () => ({
  getQuotaCatalog: api.catalog,
  getQuotaChange: api.byId,
  findQuotaChange: api.byRequest,
  getGatewayQuotaUsage: api.usage,
  getNorthwardAppQueueUsage: vi.fn(),
  quotaGroups: [{ key: 'gateway', resources: api.resources }],
  isQuotaResource: (value: unknown) =>
    typeof value === 'string' && api.resources.includes(value),
  previewQuotaChange: api.preview,
  submitQuotaChange: api.submit,
}));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { id: 1 } }),
}));
vi.mock('#/views/maintenance/resource-quotas/modules/quota-alarms.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@vben-core/shadcn-ui', async () => {
  const { h } = await import('vue');
  const content = (_: unknown, { slots }: { slots: Slots }) =>
    h('div', slots.default?.());
  return {
    Sheet: (props: { open: boolean }, { slots }: { slots: Slots }) =>
      props.open ? content(props, { slots }) : null,
    SheetContent: (_: unknown, { slots }: { slots: Slots }) =>
      h('section', { role: 'dialog' }, slots.default?.()),
    SheetDescription: content,
    SheetHeader: content,
    SheetTitle: content,
  };
});
vi.mock('@vben/common-ui', async () => {
  const { h } = await import('vue');
  return {
    Page: (_: unknown, { slots }: { slots: Slots }) =>
      h('main', [slots.title?.(), slots.extra?.(), slots.default?.()]),
  };
});
vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  const content = (_: unknown, { slots }: { slots: Slots }) =>
    h('div', [slots.title?.(), slots.default?.()]);
  const choices = (
    props: { options: { label: string; value: string }[]; value: string },
    { emit }: { emit: (event: string, value: string) => void },
  ) =>
    h(
      'div',
      props.options.map(({ label, value }) =>
        h(
          'button',
          {
            'aria-pressed': props.value === value,
            onClick: () => emit('update:value', value),
          },
          label,
        ),
      ),
    );
  return {
    Alert: (
      props: { description?: string; message: string },
      { slots }: { slots: Slots },
    ) => h('div', [props.message, props.description, slots.action?.()]),
    Button: (
      props: { 'aria-current'?: string; disabled?: boolean },
      { slots }: { slots: Slots },
    ) =>
      h(
        'button',
        { 'aria-current': props['aria-current'], disabled: props.disabled },
        slots.default?.(),
      ),
    Card: content,
    Collapse: content,
    CollapsePanel: content,
    Descriptions: content,
    DescriptionsItem: (
      props: { label?: string },
      { slots }: { slots: Slots },
    ) => h('div', [props.label, slots.default?.()]),
    Empty: (props: { description?: string }) => h('p', props.description),
    Form: content,
    FormItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', [slots.default?.(), slots.help?.()]),
    Input: (
      props: {
        'aria-describedby'?: string;
        'aria-label'?: string;
        id?: string;
        value: string;
      },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h('input', {
        'aria-describedby': props['aria-describedby'],
        'aria-label': props['aria-label'],
        id: props.id,
        value: props.value,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLInputElement).value),
      }),
    Pagination: content,
    Progress: content,
    RadioGroup: choices,
    Segmented: choices,
    Select: (
      props: {
        options?: {
          label: string;
          options?: { label: string; value: string }[];
          value?: string;
        }[];
      },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h(
        'div',
        props.options?.flatMap((option) =>
          (option.options ?? [option]).map(({ label, value }) =>
            value === undefined
              ? null
              : h(
                  'button',
                  {
                    'data-resource': value,
                    onClick: () => {
                      emit('update:value', value);
                      emit('change', value);
                    },
                  },
                  label,
                ),
          ),
        ),
      ),
    Skeleton: content,
    Spin: content,
    Statistic: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.formatter?.()),
    Steps: content,
    Table: content,
    TabPane: content,
    Tabs: content,
    Tag: content,
    TypographyText: content,
  };
});

const prefix = 'page.maintenance.resourceQuotas.';
const sourceHash = 'a'.repeat(64);
const ownerId = '12345678-1234-4234-8234-123456789012';
const firstField = {
  default: '128',
  desired: '7',
  effectMode: 'HOT_ADMISSION',
  envKey: null,
  fileValuePresent: true,
  key: 'max_pending',
  max: '4294967295',
  min: '1',
  persisted: '7',
  source: 'file',
  unit: 'count',
  writable: true,
};
const usage = {
  accepting: true,
  bytes: {
    available: '16776192',
    limit: '16777216',
    peak: '2048',
    used: '1024',
  },
  draining: false,
  lastRetirementAgeMs: null,
  lastSuccessfulHandoffAgeMs: null,
  maxRequestBytes: '256',
  maxResultBytes: '256',
  oldestOwnerAgeMs: null,
  ownerId,
  ownerUptimeMs: '1000',
  pending: { available: '7', limit: '7', peak: '2', used: '0' },
  policyRevision: '1',
  recentRefusals: [],
  refusalsEvicted: '0',
  refusalsTotal: '9007199254740993',
  sampledAt: '2026-11-18T00:00:00Z',
  successfulHandoffs: '0',
};

function button(wrapper: VueWrapper, key: string) {
  const target = wrapper
    .findAll('button')
    .find((entry) => entry.text() === prefix + key);
  if (!target) throw new Error(`Button not rendered: ${key}`);
  return target;
}

async function previewValue(wrapper: VueWrapper, value: string) {
  await button(wrapper, 'adjust').trigger('click');
  await wrapper.get('input').setValue(value);
  await button(wrapper, 'preview').trigger('click');
  await flushPromises();
}

describe('extension-store resource quotas', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    api.catalog.mockResolvedValue({
      canConfigure: true,
      fields: [firstField],
      sourceHash,
    });
    api.usage.mockResolvedValue({ extensionStore: usage });
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '7',
          desired: '4',
          effective: '7',
          effectMode: 'HOT_ADMISSION',
          key: 'max_pending',
        },
      ],
      projectedPendingAvailable: '4',
      projectedBytesAvailable: '1024',
      running: usage,
      wouldDrain: false,
    });
    api.byRequest.mockResolvedValue(null);
  });

  it('keeps decimal counters exact and hides the edit entry for a reader', async () => {
    api.catalog.mockResolvedValue({
      canConfigure: false,
      fields: [firstField],
      sourceHash,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    expect(wrapper.text()).toContain(`${prefix}readOnly`);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(
      wrapper
        .findAll('button')
        .some((item) => item.text() === `${prefix}adjust`),
    ).toBe(false);
    expect(wrapper.text()).toContain(
      new Intl.NumberFormat().format(9_007_199_254_740_993n),
    );
    expect(wrapper.text()).toContain('KiB');
    expect(wrapper.text()).toContain('MiB');
    expect(api.submit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('filters the desktop directory by resource id and marks the selected resource', async () => {
    const wrapper = mount(QuotaResourceDirectory, {
      props: { disabled: false, resource: 'extension-store', wide: true },
    });
    expect(wrapper.get('[aria-current="true"]').text()).toContain(
      `${prefix}extensionStore`,
    );
    const search = wrapper.get('input');
    await search.setValue('  ENGINEERING-VALIDATOR ');
    const [match] = wrapper.findAll('button');
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(match?.text()).toContain(`${prefix}engineeringValidator`);
    await match?.trigger('click');
    expect(wrapper.emitted('change')).toEqual([['engineering-validator']]);
    await wrapper.setProps({ resource: 'engineering-validator' });
    expect(wrapper.get('[aria-current="true"]').text()).toContain(
      `${prefix}engineeringValidator`,
    );
    await search.setValue('missing-resource');
    expect(wrapper.text()).toContain(`${prefix}resourceNoMatches`);
    await search.setValue('');
    expect(wrapper.get('[aria-current="true"]').text()).toContain(
      `${prefix}engineeringValidator`,
    );
    wrapper.unmount();
  });

  it('locates known policy differences and clears the comparison on a stale sample', async () => {
    api.catalog.mockResolvedValue({
      canConfigure: true,
      fields: [
        { ...firstField, desired: '8', persisted: '8' },
        { ...firstField, key: 'max_request_bytes', desired: '256' },
        { ...firstField, key: 'max_preflight', desired: '8' },
      ],
      sourceHash,
    });
    const wrapper = mount(ResourceQuotas, { attachTo: document.body });
    await flushPromises();
    const table = wrapper.getComponent(QuotaPolicyTable);
    const region = wrapper.get(
      `[tabindex="-1"][aria-label="${prefix}configuration"]`,
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(region.element, 'scrollIntoView', {
      value: scrollIntoView,
    });
    expect(table.props('comparisons')).toEqual(
      new Map([
        ['max_pending', 'different'],
        ['max_preflight', 'unconfirmed'],
      ]),
    );
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    const calls = api.usage.mock.calls.length;
    await button(wrapper, 'viewPolicyDifferences').trigger('click');
    expect(table.props('filter')).toBe('differences');
    expect(document.activeElement).toBe(region.element);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(api.usage).toHaveBeenCalledTimes(calls);
    api.usage.mockRejectedValueOnce(new Error('unreachable'));
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(table.props('comparisons')).toBeUndefined();
    expect(wrapper.text()).toContain('policyComparisonStale');
    expect(wrapper.text()).not.toContain('policyNoDifferences');
    await button(wrapper, 'policyAllFields').trigger('click');
    expect(table.props('filter')).toBe('all');
    wrapper.unmount();
  });

  it('identifies the field from the matching persisted restart and surfaces unrelated drift', async () => {
    const count = {
      ...firstField,
      desired: '3',
      effectMode: 'RESTART_PROCESS',
      key: 'configuration_max_pending',
      persisted: '3',
    };
    const backing = {
      ...count,
      desired: '16384',
      key: 'configuration_max_pending_bytes',
      persisted: '16384',
    };
    const persistedHash = 'b'.repeat(64);
    const requestId = '1'.repeat(32);
    const change = {
      edit: {
        expectedOwnerId: ownerId,
        expectedPolicyRevision: '1',
        expectedSourceHash: sourceHash,
        patch: { [count.key]: count.desired },
      },
      requestId,
    };
    const operation = {
      operationId: 'operation-1',
      pendingActivation: 'PROCESS_RESTART',
      phase: 'DESIRED_COMMITTED',
      sourceAfter: persistedHash,
    };
    localStorage.setItem(
      'ng-resource-quota-change:1',
      JSON.stringify({
        change,
        operationId: operation.operationId,
        resource: 'southward-configuration',
      }),
    );
    api.byId.mockResolvedValue(operation);
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'southward-configuration'
          ? [count, backing]
          : [firstField],
      sourceHash:
        resource === 'southward-configuration' ? persistedHash : sourceHash,
    }));
    api.usage.mockResolvedValue({
      extensionStore: usage,
      southwardConfiguration: {
        accepting: true,
        bytes: { available: '32768', limit: '32768', peak: '0', used: '0' },
        ownerId,
        pending: { available: '4', limit: '4', peak: '0', used: '0' },
        policyRevision: '1',
        refusedBytes: '0',
        refusedPayload: '0',
        refusedPending: '0',
        sampledAt: usage.sampledAt,
      },
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=southward-configuration]')
      .trigger('click');
    await flushPromises();
    const table = wrapper.getComponent(QuotaPolicyTable);
    expect(table.props('comparisons')).toEqual(
      new Map([
        [backing.key, 'different'],
        [count.key, 'restart-pending'],
      ]),
    );
    expect(wrapper.text()).toContain('sourceDrift');
    api.catalog.mockResolvedValueOnce({
      canConfigure: true,
      fields: [count, backing],
      sourceHash: 'c'.repeat(64),
    });
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(table.props('comparisons')).toEqual(
      new Map([
        [backing.key, 'different'],
        [count.key, 'different'],
      ]),
    );
    wrapper.unmount();
  });

  it('uses a reviewed edit and invalidates it when the operator goes back', async () => {
    const wrapper = mount(ResourceQuotas, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('input').exists()).toBe(false);
    await previewValue(wrapper, '0004');
    expect(api.preview).toHaveBeenCalledWith('extension-store', {
      expectedOwnerId: ownerId,
      expectedPolicyRevision: '1',
      expectedSourceHash: sourceHash,
      patch: { max_pending: '4' },
    });
    expect(button(wrapper, 'save').exists()).toBe(true);
    expect(document.activeElement?.textContent).toContain(
      `${prefix}reviewSummary`,
    );
    await button(wrapper, 'backToEdit').trigger('click');
    await flushPromises();
    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('0004');
    expect(document.activeElement).toBe(input.element);
    expect(input.attributes('aria-describedby')).toBe(
      'quota-edit-help-max_pending',
    );
    expect(wrapper.get('#quota-edit-help-max_pending').text()).toContain(
      `${prefix}fieldRange`,
    );
    await wrapper.get('input').setValue('5');
    expect(
      wrapper.findAll('button').some((item) => item.text() === `${prefix}save`),
    ).toBe(false);
    expect(api.submit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('restores the same request without claiming a persisted target has been applied', async () => {
    api.submit.mockRejectedValueOnce(new Error('response lost'));
    let wrapper = mount(ResourceQuotas);
    await flushPromises();
    await previewValue(wrapper, '4');
    await button(wrapper, 'save').trigger('click');
    await flushPromises();
    const originalRequest = api.submit.mock.calls[0]?.[1];
    expect(originalRequest).toBeDefined();
    wrapper.unmount();

    const pending = { operationId: 'operation-1', phase: 'DESIRED_COMMITTED' };
    api.byRequest.mockResolvedValue(pending);
    api.byId.mockResolvedValue(pending);
    api.submit.mockResolvedValue(pending);
    wrapper = mount(ResourceQuotas);
    await flushPromises();
    expect(api.byRequest).toHaveBeenCalledWith(
      'extension-store',
      originalRequest.requestId,
    );
    expect(wrapper.get('[role=status]').text()).toContain('DESIRED_COMMITTED');
    await button(wrapper, 'retry').trigger('click');
    await flushPromises();
    expect(api.submit).toHaveBeenLastCalledWith(
      'extension-store',
      originalRequest,
    );
    expect(wrapper.get('[role=status]').text()).toContain('DESIRED_COMMITTED');
    wrapper.unmount();
  });

  it('allows re-preview after a conflict is confirmed to have no journal row', async () => {
    api.submit.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await previewValue(wrapper, '4');
    await button(wrapper, 'save').trigger('click');
    await flushPromises();
    expect(api.byRequest).toHaveBeenCalledWith(
      'extension-store',
      api.submit.mock.calls[0]?.[1].requestId,
    );
    expect(wrapper.text()).toContain('rejectedRepreview');
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('4');
    expect(localStorage.length).toBe(0);
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('switches to the real event readings and recovers the original event request after reload', async () => {
    const current = {
      accepting: true,
      bytes: usage.bytes,
      draining: false,
      execution: { available: '0', limit: '4', peak: '4', used: '4' },
      maxEventBytes: '2048',
      maxJsonDepth: '16',
      ownerId,
      pending: { available: '56', limit: '64', peak: '8', used: '8' },
      policyRevision: '2',
      refusedBytes: '1',
      refusedEncoding: '2',
      refusedJsonWork: '0',
      refusedPending: '4',
      sampledAt: usage.sampledAt,
    };
    const field = { ...firstField, key: 'events_max_in_flight', desired: '4' };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      northwardEvents: current,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: [resource === 'northward-events' ? field : firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '4',
          desired: '2',
          effective: '4',
          effectMode: 'HOT_ADMISSION',
          key: field.key,
        },
      ],
      projectedExecutionAvailable: '0',
      projectedPendingAvailable: '56',
      projectedBytesAvailable: '16776192',
      running: current,
      wouldDrain: true,
    });
    api.submit.mockRejectedValueOnce(new Error('response lost'));
    let wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=northward-events]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('executionSlots');
    expect(wrapper.text()).toContain('executionBusy');
    expect(wrapper.text()).toContain('event_encoding');
    await previewValue(wrapper, '2');
    expect(api.preview).toHaveBeenCalledWith('northward-events', {
      expectedOwnerId: ownerId,
      expectedPolicyRevision: '2',
      expectedSourceHash: sourceHash,
      patch: { events_max_in_flight: '2' },
    });
    expect(wrapper.get('[role=dialog]').text()).toContain('wouldDrain');
    await button(wrapper, 'save').trigger('click');
    await flushPromises();
    const request = api.submit.mock.calls[0]?.[1];
    expect(request?.requestId).toBeDefined();
    expect(api.submit).toHaveBeenCalledWith('northward-events', request);
    wrapper.unmount();

    api.byRequest.mockResolvedValue({
      operationId: 'event-change',
      phase: 'DESIRED_COMMITTED',
    });
    wrapper = mount(ResourceQuotas);
    await flushPromises();
    expect(api.byRequest).toHaveBeenCalledWith(
      'northward-events',
      request.requestId,
    );
    expect(wrapper.text()).toContain('executionSlots');
    expect(wrapper.get('[role=status]').text()).toContain('DESIRED_COMMITTED');
    wrapper.unmount();
  });

  it('shows physical slots and preserves the saved receipt while runtime confirmation is pending', async () => {
    const mailbox = {
      acceptedEvents: '4',
      accepting: true,
      available: '3',
      executingEvents: '1',
      limit: '8',
      ownerId,
      policyRevision: '1',
      refusedDrain: '3',
      replacing: false,
      sampledAt: usage.sampledAt,
      used: '5',
    };
    const field = {
      ...firstField,
      key: 'queue_capacity',
      desired: '8',
      effectMode: 'HOT_AFTER_DRAIN',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      northwardEventQueue: mailbox,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: [resource === 'northward-event-queue' ? field : firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '8',
          desired: '4',
          effective: '8',
          effectMode: field.effectMode,
          key: field.key,
        },
      ],
      projectedPendingAvailable: '0',
      requiresQueueDrain: true,
      running: mailbox,
      wouldDrain: true,
    });
    api.submit.mockResolvedValue({
      operationId: 'physical-queue',
      phase: 'DESIRED_COMMITTED',
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=northward-event-queue]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('queueSlots');
    expect(wrapper.text()).toContain('event_queue_drain');
    await previewValue(wrapper, '4');
    const review = wrapper.get('[role=dialog]').text();
    expect(review).toContain('queueRequiresDrain');
    expect(review).toContain('HOT_AFTER_DRAIN');
    expect(review).not.toContain('units.bytes');
    await button(wrapper, 'save').trigger('click');
    await flushPromises();
    expect(api.submit).toHaveBeenCalledWith(
      'northward-event-queue',
      expect.objectContaining({
        edit: expect.objectContaining({ patch: { queue_capacity: '4' } }),
      }),
    );
    expect(wrapper.get('[role=status]').text()).toContain('DESIRED_COMMITTED');
    wrapper.unmount();
  });

  it('uses an explicit save-for-restart action and keeps the live limits until a boot receipt', async () => {
    const app = {
      accepting: true,
      maxRequestBytes: '8388608',
      ownerId,
      pending: { available: '8', limit: '8', peak: '0', used: '0' },
      policyRevision: '1',
      refusedPayload: '0',
      refusedPending: '0',
      sampledAt: usage.sampledAt,
    };
    const field = {
      ...firstField,
      desired: '8',
      effectMode: 'RESTART_PROCESS',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      northwardAppConfiguration: app,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: [resource === 'northward-app-configuration' ? field : firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '8',
          desired: '4',
          effective: '8',
          effectMode: 'RESTART_PROCESS',
          key: 'max_pending',
        },
      ],
      projectedPendingAvailable: '4',
      requiresProcessRestart: true,
      running: app,
      wouldDrain: false,
    });
    api.submit.mockResolvedValue({
      operationId: 'app-operation',
      phase: 'DESIRED_COMMITTED',
      pendingActivation: 'PROCESS_RESTART',
    });
    api.byId.mockResolvedValue({
      operationId: 'app-operation',
      phase: 'DESIRED_COMMITTED',
      pendingActivation: 'PROCESS_RESTART',
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=northward-app-configuration]')
      .trigger('click');
    await flushPromises();
    await previewValue(wrapper, '4');
    expect(wrapper.get('[role=dialog]').text()).toContain(
      'quotaPolicyNeedsRestart',
    );
    await button(wrapper, 'saveForRestart').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=status]').text()).toContain(
      'awaitingVerifiedBoot',
    );
    expect(wrapper.text()).toContain('pendingRestartLabel');
    expect(
      wrapper
        .findAll('button')
        .some((item) => item.text() === `${prefix}retry`),
    ).toBe(false);
    expect(api.submit).toHaveBeenCalledWith(
      'northward-app-configuration',
      expect.objectContaining({
        edit: expect.objectContaining({ patch: { max_pending: '4' } }),
      }),
    );
    api.byId.mockResolvedValue({
      operationId: 'app-operation',
      phase: 'APPLIED',
    });
    await button(wrapper, 'refreshStatus').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=status]').text()).toContain('APPLIED');
    wrapper.unmount();
  });

  it('shows the application queue directory only for the current delegated read permission', async () => {
    let allowed = false;
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: false,
      canReadApps: resource === 'northward-app-configuration' && allowed,
      fields: [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=northward-app-configuration]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('apps.title');

    allowed = true;
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('apps.title');

    allowed = false;
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('apps.title');
    wrapper.unmount();
  });

  it('shows actual retained and staging bytes and guards their parent constraint', async () => {
    const snapshot = {
      accepting: true,
      draining: false,
      maxSampleBytes: '1024',
      maxChannelBytes: '4096',
      ownerId,
      policyRevision: '1',
      refusedChannelReservations: '2',
      refusedGatewayReservations: '4',
      retained: {
        available: '3072',
        limit: '8192',
        peak: '6144',
        used: '5120',
      },
      sampledAt: usage.sampledAt,
      stagingLimitBytes: '1048576',
      stagingUsedBytes: '128',
    };
    const field = {
      ...firstField,
      key: 'ingress_max_state_bytes',
      desired: '8192',
      unit: 'bytes',
      persisted: '8192',
    };
    const channel = {
      ...field,
      key: 'ingress_max_channel_bytes',
      desired: '4096',
      persisted: '4096',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      southwardRetainedState: snapshot,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'southward-retained-state'
          ? [channel, field]
          : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '8192',
          desired: '4096',
          effective: '8192',
          effectMode: 'HOT_ADMISSION',
          key: field.key,
        },
        {
          configured: '4096',
          desired: '2048',
          effective: '4096',
          effectMode: 'HOT_ADMISSION',
          key: channel.key,
        },
      ],
      projectedBytesAvailable: '0',
      running: snapshot,
      wouldDrain: true,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=southward-retained-state]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('southwardRetainedBytes');
    expect(wrapper.text()).toContain('southwardStagingBytes');
    expect(wrapper.text()).toContain('southward_gateway_reservation');
    await button(wrapper, 'adjust').trigger('click');
    const input = wrapper.get(
      `input[aria-label="${prefix}fields.ingress_max_state_bytes"]`,
    );
    await input.setValue('2048');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('southwardChannelAtMostGateway');
    await input.setValue('4096');
    await wrapper
      .get(`input[aria-label="${prefix}fields.ingress_max_channel_bytes"]`)
      .setValue('2048');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    const review = wrapper.get('[role=dialog]').text();
    expect(review).toContain('channels.sharedProjection');
    expect(review).not.toContain('executionSlots');
    expect(review).toContain('wouldDrain');
    expect(review).toContain('channels.reductionTitle');
    expect(api.preview).toHaveBeenCalledWith(
      'southward-retained-state',
      expect.objectContaining({
        patch: {
          ingress_max_channel_bytes: '2048',
          ingress_max_state_bytes: '4096',
        },
      }),
    );
    wrapper.unmount();
  });

  it('shows the original Southward configuration count and serialized bytes with a saved-only restart state', async () => {
    const southward = {
      accepting: true,
      bytes: { available: '28672', limit: '32768', peak: '4096', used: '4096' },
      ownerId,
      pending: { available: '3', limit: '4', peak: '1', used: '1' },
      policyRevision: '1',
      refusedBytes: '2',
      refusedPayload: '1',
      refusedPending: '4',
      sampledAt: usage.sampledAt,
    };
    const count = {
      ...firstField,
      key: 'configuration_max_pending',
      desired: '4',
      effectMode: 'RESTART_PROCESS',
    };
    const bytes = {
      ...count,
      key: 'configuration_max_pending_bytes',
      desired: '32768',
      unit: 'bytes',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      southwardConfiguration: southward,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'southward-configuration' ? [count, bytes] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '4',
          desired: '2',
          effective: '4',
          effectMode: 'RESTART_PROCESS',
          key: count.key,
        },
      ],
      projectedPendingAvailable: '1',
      projectedBytesAvailable: '28672',
      requiresProcessRestart: true,
      running: southward,
      wouldDrain: false,
    });
    api.submit.mockResolvedValue({
      operationId: 'south-config-receipt',
      phase: 'DESIRED_COMMITTED',
      pendingActivation: 'PROCESS_RESTART',
    });
    api.byId.mockResolvedValue({
      operationId: 'south-config-receipt',
      phase: 'DESIRED_COMMITTED',
      pendingActivation: 'PROCESS_RESTART',
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=southward-configuration]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('southwardConfigurationOperations');
    expect(wrapper.text()).toContain('southwardConfigurationBytes');
    expect(wrapper.text()).toContain('southward_config_bytes');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.configuration_max_pending"]`)
      .setValue('2');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=dialog]').text()).toContain(
      'quotaPolicyNeedsRestart',
    );
    await button(wrapper, 'saveForRestart').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=status]').text()).toContain(
      'awaitingVerifiedBoot',
    );
    expect(api.submit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows material ownership and reviews a preparation deadline in milliseconds', async () => {
    const materials = {
      accepting: true,
      bytes: { available: '0', limit: '4096', peak: '4096', used: '4096' },
      compilations: { available: '3', limit: '4', peak: '2', used: '1' },
      ownerId,
      policyRevision: '1',
      prepareTimeoutMs: '4000',
      refusedBytes: '3',
      refusedCompilation: '1',
      refusedVerification: '2',
      sampledAt: usage.sampledAt,
    };
    const timeout = {
      ...firstField,
      desired: '4000',
      effectMode: 'RESTART_PROCESS',
      key: 'material_prepare_timeout_ms',
      max: '60000',
      min: '100',
      unit: 'milliseconds',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      southwardMaterials: materials,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'southward-materials' ? [timeout] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '4000',
          desired: '2000',
          effective: '4000',
          effectMode: 'RESTART_PROCESS',
          key: timeout.key,
        },
      ],
      projectedBytesAvailable: '0',
      projectedPendingAvailable: '3',
      requiresProcessRestart: true,
      running: materials,
      wouldDrain: false,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=southward-materials]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('southwardMaterialTasks');
    expect(wrapper.text()).toContain('southwardMaterialBytes');
    expect(wrapper.text()).toContain('southward_material_verify');
    expect(wrapper.text()).toContain('exhaustedLabel');

    await button(wrapper, 'adjust').trigger('click');
    const input = wrapper.get(
      `input[aria-label="${prefix}fields.material_prepare_timeout_ms"]`,
    );
    await input.setValue('99');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await input.setValue('2000');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    const review = wrapper.get('[role=dialog]').text();
    expect(review).toContain('units.milliseconds');
    expect(review).toContain('quotaPolicyNeedsRestart');
    expect(review).not.toContain('projectedHeadroom');
    expect(api.preview).toHaveBeenCalledWith(
      'southward-materials',
      expect.objectContaining({
        patch: { material_prepare_timeout_ms: '2000' },
      }),
    );
    wrapper.unmount();
  });

  it('distinguishes capture leases, their shared bytes, and contention by an existing interface owner', async () => {
    const capture = {
      accepting: true,
      bytes: { available: '8', limit: '64', peak: '64', used: '56' },
      captureBytes: '8',
      interfaces: { available: '1', limit: '2', peak: '2', used: '1' },
      ownerId,
      policyRevision: '1',
      refusedCaptureBytes: '0',
      refusedInterfaceCount: '0',
      refusedOccupiedInterface: '3',
      refusedRuntimeBytes: '1',
      runtimeBytes: '48',
      sampledAt: usage.sampledAt,
    };
    api.usage.mockResolvedValue({
      ethernetCapture: capture,
      extensionStore: usage,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'ethernet-capture'
          ? [
              {
                ...firstField,
                desired: '2',
                effectMode: 'RESTART_PROCESS',
                key: 'ethernet_capture_max_interfaces',
              },
            ]
          : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=ethernet-capture]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('captureInterfaces');
    expect(wrapper.text()).toContain('captureReservations');
    expect(wrapper.text()).toContain('captureNativeBytes');
    expect(wrapper.text()).toContain('captureRuntimeBytes');
    expect(wrapper.text()).toContain('capture_occupied');
    expect(wrapper.text()).toContain('capture_runtime_bytes');
    expect(wrapper.text()).toContain('acceptingLabel');
    expect(wrapper.text()).not.toContain('staleReadings');
    wrapper.unmount();
  });

  it('shows the shared writer status and restores editing after the pending change completes', async () => {
    const configuration = {
      canConfigure: true,
      fields: [firstField],
      sourceHash,
    };
    api.catalog.mockResolvedValueOnce({
      ...configuration,
      writerAvailability: 'CHANGE_PENDING',
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    expect(wrapper.text()).toContain('quotaWriterPending');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    api.catalog.mockResolvedValueOnce({
      ...configuration,
      writerAvailability: 'AVAILABLE',
    });
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('quotaWriterPending');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows separate control admission stages and checks the original per-request reserve', async () => {
    const original = {
      accepting: true,
      bytes: { available: '131072', limit: '131072', peak: '0', used: '0' },
      draining: false,
      maxRequestBytes: '65536',
      ownerId,
      pending: { available: '4', limit: '4', peak: '0', used: '0' },
      policyRevision: '1',
      preflight: { available: '0', limit: '2', peak: '2', used: '2' },
      preflightBytes: {
        available: '0',
        limit: '131072',
        peak: '131072',
        used: '131072',
      },
      refusedExecutionBytes: '0',
      refusedExecutionCount: '0',
      refusedPreflightBytes: '1',
      refusedPreflightCount: '2',
      sampledAt: usage.sampledAt,
    };
    const field = {
      ...firstField,
      desired: '131072',
      key: 'max_preflight_bytes',
      min: '1',
      max: '1048576',
      unit: 'bytes',
    };
    api.usage.mockResolvedValue({
      controlAdmission: original,
      extensionStore: usage,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'control-admission' ? [field] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '131072',
          desired: '65536',
          effective: '131072',
          effectMode: 'HOT_ADMISSION',
          key: field.key,
        },
      ],
      projectedBytesAvailable: '131072',
      projectedPendingAvailable: '4',
      projectedPreflightAvailable: '0',
      projectedPreflightBytesAvailable: '0',
      running: original,
      wouldDrain: true,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=control-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('controlPreflightLimited');
    expect(wrapper.text()).toContain('controlExecutionBytes');
    expect(wrapper.text()).toContain('control_preflight_count');
    await button(wrapper, 'adjust').trigger('click');
    const edit = wrapper.get(
      `input[aria-label="${prefix}fields.max_preflight_bytes"]`,
    );
    await edit.setValue('65535');
    expect(wrapper.text()).toContain('controlReservationFits');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await edit.setValue('65536');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    const preview = wrapper.get('[role=dialog]').text();
    expect(preview).toContain('controlPreflightBytes');
    expect(preview).toContain('controlExecutionBytes');
    expect(preview).toContain('wouldDrain');
    expect(preview.indexOf('wouldDrain')).toBeLessThan(
      preview.indexOf('controlPreflightBytes'),
    );
    expect(api.preview).toHaveBeenCalledWith(
      'control-admission',
      expect.objectContaining({ patch: { max_preflight_bytes: '65536' } }),
    );
    wrapper.unmount();
  });

  it('shows resident artifact reservations and validates a proposed loader budget', async () => {
    const libraries = {
      accepting: true,
      bytes: { available: '2048', limit: '8192', peak: '6144', used: '6144' },
      images: { available: '0', limit: '1', peak: '1', used: '1' },
      loads: { available: '1', limit: '1', peak: '1', used: '0' },
      maxImageBytes: '6144',
      ownerId,
      policyRevision: '1',
      refusedCount: '3',
      refusedImageBytes: '0',
      refusedLoads: '2',
      refusedTotalBytes: '1',
      sampledAt: usage.sampledAt,
    };
    const total = {
      ...firstField,
      desired: '8192',
      effectMode: 'RESTART_PROCESS',
      key: 'max_total_bytes',
      max: '65536',
      min: '1',
      unit: 'bytes',
    };
    const file = { ...total, key: 'max_image_bytes', desired: '6144' };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      nativeLibraries: libraries,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'native-libraries' ? [total, file] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=native-libraries]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('nativeNewImagesLimited');
    expect(wrapper.text()).toContain('nativeArtifactBytes');
    expect(wrapper.text()).toContain('nativeLoaderJobs');
    expect(wrapper.text()).toContain('native_load_slots');
    expect(wrapper.text()).toContain('nativeProcessLifetime');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_total_bytes"]`)
      .setValue('4096');
    expect(wrapper.text()).toContain('nativeSingleAtMostTotal');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps graph reservations visible with an empty engineering cache', async () => {
    const engineering = {
      accepting: true,
      cacheEvictions: '2',
      cachedModels: { available: '4', limit: '4', peak: '1', used: '0' },
      jobs: { available: '1', limit: '2', peak: '2', used: '1' },
      maxModelBytes: '4096',
      modelBytes: {
        available: '61440',
        limit: '65536',
        peak: '8192',
        used: '4096',
      },
      ownerId,
      policyRevision: '1',
      refusedJobs: '0',
      refusedModelEnvelope: '0',
      refusedModelPool: '1',
      sampledAt: usage.sampledAt,
    };
    const pool = {
      ...firstField,
      desired: '65536',
      effectMode: 'RESTART_PROCESS',
      key: 'model_pool_bytes',
      max: '131072',
      min: '1',
      unit: 'bytes',
    };
    const model = { ...pool, key: 'max_model_bytes', desired: '4096' };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      engineeringAdmission: engineering,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'engineering-admission' ? [pool, model] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=engineering-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringCachedModels');
    expect(wrapper.text()).toContain('engineeringModelBytes');
    expect(wrapper.text()).toContain('engineeringCacheEvictions');
    expect(wrapper.text()).toContain('engineering_model_pool');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.model_pool_bytes"]`)
      .setValue('2048');
    expect(wrapper.text()).toContain('engineeringSingleAtMostPool');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('shows the original page limits, retained output occupancy and page-only refusals', async () => {
    const engineering = {
      accepting: true,
      cacheEvictions: '0',
      cachedModels: { available: '4', limit: '4', peak: '0', used: '0' },
      jobs: { available: '2', limit: '2', peak: '0', used: '0' },
      maxBrowseBytes: '4096',
      maxModelBytes: '4096',
      maxPreviewPage: '2',
      modelBytes: { available: '65536', limit: '65536', peak: '0', used: '0' },
      ownerId,
      pageOutputBytes: {
        available: '3692',
        limit: '8192',
        peak: '8000',
        used: '4500',
      },
      policyRevision: '1',
      refusedJobs: '0',
      refusedModelEnvelope: '0',
      refusedModelPool: '7',
      refusedPageItems: '7',
      refusedPageOutputBytes: '3',
      sampledAt: usage.sampledAt,
    };
    const pageItems = {
      ...firstField,
      desired: '2',
      effectMode: 'RESTART_PROCESS',
      key: 'max_preview_page',
      max: '256',
      persisted: '2',
    };
    const pageBytes = {
      ...pageItems,
      desired: '4096',
      key: 'max_browse_bytes',
      max: '1048576',
      min: '4096',
      persisted: '4096',
      unit: 'bytes',
    };
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'engineering-browse'
          ? [pageItems, pageBytes]
          : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringAdmission: engineering,
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=engineering-browse]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringBrowseLimits');
    expect(wrapper.text()).toContain('engineeringBrowseOutputFull');
    expect(wrapper.text()).toContain('engineering_page_output_bytes');
    expect(wrapper.text()).toContain('engineering_page_items');
    expect(wrapper.get('.quota-metric--refusals [title="10"]').text()).toBe(
      '10',
    );
    expect(wrapper.text()).not.toContain('engineering_model_pool');
    expect(wrapper.get('.quota-metric--bytes').text()).toContain(
      'engineeringBrowseOutput',
    );
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    api.usage.mockResolvedValueOnce({
      engineeringAdmission: { ...engineering, pageOutputBytes: undefined },
      extensionStore: usage,
    });
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('staleReadings');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('shows mapping output and publication snapshots with independent pressure', async () => {
    const engineering = {
      accepting: true,
      cachedModels: { available: '4', limit: '4', peak: '0', used: '0' },
      jobs: { available: '2', limit: '2', peak: '0', used: '0' },
      mappingOutputBytes: {
        available: '32768',
        limit: '32768',
        peak: '16384',
        used: '0',
      },
      maxMappingBytes: '16384',
      maxMappingPoints: '5',
      modelBytes: { available: '65536', limit: '65536', peak: '0', used: '0' },
      ownerId,
      policyRevision: '1',
      publicationSnapshotBytes: {
        available: '12768',
        limit: '32768',
        peak: '23000',
        used: '20000',
      },
      refusedMappingItems: '2',
      refusedMappingOutput: '1',
      refusedPublicationSnapshot: '4',
      sampledAt: usage.sampledAt,
    };
    const points = {
      ...firstField,
      desired: '5',
      effectMode: 'RESTART_PROCESS',
      key: 'max_mapping_points',
      max: '65536',
      persisted: '5',
    };
    const bytes = {
      ...points,
      desired: '16384',
      key: 'max_mapping_bytes',
      max: '67108864',
      min: '4096',
      persisted: '16384',
      unit: 'bytes',
    };
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'engineering-mapping' ? [points, bytes] : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringAdmission: engineering,
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=engineering-mapping]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringPublicationSnapshotFull');
    expect(wrapper.text()).not.toContain('engineeringMappingOutputFull');
    expect(wrapper.get('.quota-metric--bytes').text()).toContain(
      'engineeringMappingOutput',
    );
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'engineeringPublicationSnapshot',
    );
    expect(wrapper.text()).toContain('engineering_mapping_items');
    expect(wrapper.text()).toContain('engineering_mapping_output');
    expect(wrapper.text()).toContain('engineering_publication_snapshot');
    expect(wrapper.get('.quota-metric--refusals [title="7"]').text()).toBe('7');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses each installed comparison bound for editing and keeps page refusals separate', async () => {
    const engineering = {
      accepting: true,
      cachedModels: { available: '4', limit: '4', peak: '0', used: '0' },
      jobs: { available: '2', limit: '2', peak: '0', used: '0' },
      maxComparisonBytes: '8192',
      maxComparisonItems: '5000',
      maxComparisonWork: '400',
      modelBytes: { available: '65536', limit: '65536', peak: '0', used: '0' },
      ownerId,
      policyRevision: '1',
      refusedComparisonDescriptors: '1',
      refusedComparisonScratch: '2',
      refusedComparisonWork: '4',
      refusedPageItems: '9',
      sampledAt: usage.sampledAt,
    };
    const fields = [
      {
        ...firstField,
        desired: '5000',
        effectMode: 'RESTART_PROCESS',
        key: 'max_comparison_items',
        max: '1000000',
        persisted: '5000',
      },
      {
        ...firstField,
        desired: '8192',
        effectMode: 'RESTART_PROCESS',
        key: 'max_comparison_bytes',
        max: '67108864',
        min: '4096',
        persisted: '8192',
        unit: 'bytes',
      },
      {
        ...firstField,
        desired: '400',
        effectMode: 'RESTART_PROCESS',
        key: 'max_comparison_work',
        max: '67108864',
        persisted: '400',
        unit: 'work',
      },
    ];
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'engineering-comparison' ? fields : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringAdmission: engineering,
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=engineering-comparison]')
      .trigger('click');
    await flushPromises();
    const limits = wrapper.get('.quota-metric--response-observations');
    expect(limits.text()).toContain('engineeringComparisonLimits');
    expect(limits.text()).toContain('fields.max_comparison_work');
    expect(limits.text()).toContain('units.work');
    expect(wrapper.text()).toContain('engineering_comparison_descriptors');
    expect(wrapper.text()).toContain('engineering_comparison_scratch');
    expect(wrapper.text()).toContain('engineering_comparison_work');
    expect(wrapper.text()).not.toContain('engineering_page_items');
    expect(wrapper.get('.quota-metric--refusals [title="7"]').text()).toBe('7');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_comparison_items"]`)
      .setValue('5001');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_comparison_bytes"]`)
      .setValue('9000');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_comparison_work"]`)
      .setValue('401');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(api.preview).toHaveBeenLastCalledWith(
      'engineering-comparison',
      expect.objectContaining({
        patch: {
          max_comparison_bytes: '9000',
          max_comparison_items: '5001',
          max_comparison_work: '401',
        },
      }),
    );
    wrapper.unmount();
  });

  it('shows actual retained publication charges and disables edits when storage readings are unavailable', async () => {
    const publication = {
      accepting: true,
      maxPublicationBytes: '4096',
      maxPublications: '1',
      ownerId,
      policyRevision: '1',
      refusedPublicationBytes: '2',
      refusedPublicationCount: '3',
      sampledAt: usage.sampledAt,
      storage: {
        sampledAt: usage.sampledAt,
        usedBytes: '8192',
        usedCount: '2',
      },
    };
    const fields = [
      {
        ...firstField,
        desired: '1',
        effectMode: 'RESTART_PROCESS',
        key: 'max_publications',
        max: '1000000',
        persisted: '1',
      },
      {
        ...firstField,
        desired: '4096',
        effectMode: 'RESTART_PROCESS',
        key: 'max_publication_bytes',
        max: '9223372036854775807',
        min: '4096',
        persisted: '4096',
        unit: 'bytes',
      },
    ];
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'engineering-publication' ? fields : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringPublication: publication,
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=engineering-publication]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringPublicationAdmissionFull');
    expect(wrapper.get('.quota-metric--pending').text()).toContain('200%');
    expect(wrapper.get('.quota-metric--bytes').text()).toContain('200%');
    expect(wrapper.text()).toContain('engineering_publication_count');
    expect(wrapper.text()).toContain('engineering_publication_bytes');
    expect(wrapper.get('.quota-metric--refusals [title="5"]').text()).toBe('5');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();

    api.usage.mockResolvedValue({
      engineeringPublication: { ...publication, storage: null },
      extensionStore: usage,
    });
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringPublicationStorageUnknown');
    expect(wrapper.get('.quota-metric--pending').text()).toContain('unknown');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps validator limits repairable after a failed startup probe', async () => {
    const heap = {
      ...firstField,
      desired: '8192',
      effectMode: 'RESTART_PROCESS',
      key: 'validator_heap_bytes',
      max: '2147483647',
      persisted: '8192',
      unit: 'bytes',
    };
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'engineering-validator' ? [heap] : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringValidator: {
        accepting: true,
        maxDiagnosticBytes: '16384',
        ownerId,
        policyRevision: '1',
        refusedValidatorDeadlines: '0',
        refusedValidatorDiagnostics: '0',
        refusedValidatorHeap: '1',
        refusedValidatorNativeMemory: '0',
        requestTimeoutMs: '15000',
        sampledAt: usage.sampledAt,
        validatorAddressSpaceBytes: null,
        validatorHeapBytes: '8192',
        validatorReady: false,
        validatorTimeoutMs: '8000',
      },
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=engineering-validator]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('engineeringValidatorUnavailable');
    expect(wrapper.text()).toContain('validator_heap');
    expect(wrapper.text()).toContain(
      'engineeringValidatorAddressSpacePlatform',
    );
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    await previewValue(wrapper, '134217728');
    expect(api.preview).toHaveBeenCalledWith(
      'engineering-validator',
      expect.objectContaining({
        expectedOwnerId: ownerId,
        expectedSourceHash: sourceHash,
        patch: { validator_heap_bytes: '134217728' },
      }),
    );
    wrapper.unmount();
  });

  it('keeps durable assets visible above lowered limits and preserves unknown usage', async () => {
    const engineering = {
      accepting: true,
      assetStoreAvailable: true,
      cachedModels: { available: '4', limit: '4', peak: '0', used: '0' },
      jobs: { available: '2', limit: '2', peak: '0', used: '0' },
      maxAssetBytes: '8',
      maxAssets: '1',
      maxInputBytes: '8',
      modelBytes: { available: '65536', limit: '65536', peak: '0', used: '0' },
      ownerId,
      policyRevision: '1',
      refusedAssetBytes: '0',
      refusedAssetCount: '1',
      refusedAssetFileSize: '2',
      sampledAt: usage.sampledAt,
      storedAssetBytes: { available: '0', limit: '8', peak: '25', used: '25' },
      storedAssets: { available: '0', limit: '1', peak: '2', used: '2' },
    };
    const count = {
      ...firstField,
      desired: '1',
      effectMode: 'RESTART_PROCESS',
      key: 'max_assets',
      persisted: '1',
    };
    const bytes = {
      ...count,
      desired: '8',
      key: 'max_asset_bytes',
      max: '9223372036854775807',
      persisted: '8',
      unit: 'bytes',
    };
    const input = { ...bytes, key: 'max_input_bytes', max: '67108864' };
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'engineering-assets'
          ? [count, bytes, input]
          : [firstField],
      sourceHash,
    }));
    api.usage.mockResolvedValue({
      engineeringAdmission: engineering,
      extensionStore: usage,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=engineering-assets]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('engineeringAssetAdmissionFull');
    expect(wrapper.text()).toContain('engineering_asset_file_size');
    expect(wrapper.text()).toContain('engineering_asset_count');
    expect(wrapper.get('.quota-metric--refusals [title="3"]').text()).toBe('3');
    expect(wrapper.get('.quota-metric--bytes').text()).toContain('25');
    expect(wrapper.get('.quota-metric--pending').text()).toContain(
      'engineeringAssetCount',
    );
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_input_bytes"]`)
      .setValue('9');
    expect(wrapper.text()).toContain('engineeringAssetFileMustFit');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();

    api.usage.mockResolvedValue({
      engineeringAdmission: {
        ...engineering,
        assetStoreAvailable: false,
        storedAssetBytes: null,
        storedAssets: null,
      },
      extensionStore: usage,
    });
    const unavailable = mount(ResourceQuotas);
    await flushPromises();
    await unavailable
      .get('[data-resource=engineering-assets]')
      .trigger('click');
    await flushPromises();
    expect(unavailable.text()).toContain('engineeringAssetStoreUnavailable');
    expect(unavailable.get('.quota-metric--pending').text()).toContain(
      'unknown',
    );
    expect(button(unavailable, 'adjust').attributes('disabled')).toBeDefined();
    unavailable.unmount();
  });

  it('shows authentication tasks independently of password workers', async () => {
    const auth = {
      accepting: true,
      crypto: { available: '0', limit: '2', peak: '2', used: '2' },
      ownerId,
      policyRevision: '1',
      refusedCryptoWaits: '4',
      refusedRequests: '1',
      requests: { available: '2', limit: '4', peak: '3', used: '2' },
      requestTimeoutMs: '5000',
      sampledAt: usage.sampledAt,
    };
    const pending = {
      ...firstField,
      desired: '4',
      effectMode: 'RESTART_PROCESS',
      min: '1',
      max: '65536',
    };
    const workers = { ...pending, key: 'max_crypto_workers', desired: '2' };
    api.usage.mockResolvedValue({ authAdmission: auth, extensionStore: null });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'auth-admission' ? [pending, workers] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    expect(wrapper.text()).toContain('staleReadings');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-resource=auth-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('staleReadings');
    expect(wrapper.text()).toContain('authRequests');
    expect(wrapper.text()).toContain('authCrypto');
    expect(wrapper.text()).toContain('authCryptoBusy');
    expect(wrapper.text()).toContain('auth_crypto_deadline');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_pending"]`)
      .setValue('1');
    expect(wrapper.text()).toContain('authCryptoAtMostPending');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('shows verified UI content and retained backing as independent observations', async () => {
    const webUiPreparation = {
      accepting: true,
      contentBytes: {
        available: '10240',
        limit: '20480',
        peak: '10240',
        used: '10240',
      },
      deepestPath: '2',
      files: { available: '3', limit: '5', peak: '2', used: '2' },
      largestAssetBytes: '8192',
      largestPathBytes: '12',
      manifestBytes: '365',
      maxAssetBytes: '10240',
      maxDepth: '32',
      maxManifestBytes: '1024',
      maxPathBytes: '128',
      maxWorkBytes: '65536',
      nativeWorkerBytes: '4194304',
      ownerId,
      policyRevision: '1',
      preparationElapsedMs: '33',
      preparationRetainedPeak: '10485760',
      preparationWorkBytes: '43008',
      prepareTimeoutMs: '5000',
      refusedRetainedReservations: '1',
      retainedBytes: {
        available: '17825792',
        limit: '20971520',
        peak: '10485760',
        used: '3145728',
      },
      sampledAt: usage.sampledAt,
      sourceMode: 'filesystem',
      treeId: 'd'.repeat(64),
    };
    const asset = {
      ...firstField,
      key: 'max_asset_bytes',
      desired: '10240',
      effectMode: 'RESTART_PROCESS',
      unit: 'bytes',
    };
    const content = { ...asset, key: 'max_content_bytes', desired: '20480' };
    api.usage.mockResolvedValue({ extensionStore: usage, webUiPreparation });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'web-ui-preparation' ? [asset, content] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=web-ui-preparation]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--bytes').text()).toContain(
      'webUiContentBytes',
    );
    expect(wrapper.get('.quota-metric--ui-retained').text()).toContain(
      'webUiRetainedBytes',
    );
    expect(wrapper.text()).toContain('webUiModes.filesystem');
    expect(wrapper.text()).toContain('webUiManifestBytes');
    expect(wrapper.text()).toContain('reasons.web_ui_workspace');
    await button(wrapper, 'adjust').trigger('click');
    const assetField = wrapper.get(
      `input[aria-label="${prefix}fields.${asset.key}"]`,
    );
    await assetField.setValue('24576');
    expect(wrapper.text()).toContain('webUiAssetAtMostContent');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await assetField.setValue('8191');
    expect(wrapper.text()).toContain('webUiTreeMustFit');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('shows original UI response peaks and guards a lowering below the known asset path', async () => {
    const webUiResponse = {
      accepting: true,
      maxConditionalHeaderBytes: '128',
      maxRangeHeaderBytes: '64',
      maxRanges: '4',
      maxRequestPathBytes: '128',
      maxResponseMetadataBytes: '4096',
      minAssetRequestPathBytes: '72',
      ownerId,
      peakAssemblyMs: '2',
      peakConditionalBytes: '61',
      peakMultipartMetadataBytes: '563',
      peakPathBytes: '72',
      peakRangeHeaderBytes: '21',
      peakRanges: '2',
      policyRevision: '1',
      refusedConditionalHeaders: '0',
      refusedDeadline: '1',
      refusedMultipartMetadata: '2',
      refusedPath: '0',
      refusedRangeHeader: '0',
      refusedRanges: '1',
      requestTimeoutMs: '500',
      sampledAt: usage.sampledAt,
    };
    const path = {
      ...firstField,
      key: 'max_request_path_bytes',
      desired: '128',
      effectMode: 'RESTART_PROCESS',
      unit: 'bytes',
    };
    api.usage.mockResolvedValue({ extensionStore: usage, webUiResponse });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'web-ui-response' ? [path] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=web-ui-response]').trigger('click');
    await flushPromises();
    const observations = wrapper.get('.quota-metric--response-observations');
    expect(observations.text()).toContain('webUiResponsePeakMultipart');
    expect(observations.text()).toContain('563');
    expect(observations.text()).toContain('webUiResponseAssetPath');
    expect(observations.find('[role=progressbar]').exists()).toBe(false);
    expect(wrapper.get('.quota-metric--refusals').text()).toContain('4');
    expect(wrapper.text()).toContain('reasons.web_ui_response_metadata');
    await button(wrapper, 'adjust').trigger('click');
    const input = wrapper.get(
      `input[aria-label="${prefix}fields.${path.key}"]`,
    );
    await input.setValue('71');
    expect(wrapper.text()).toContain('webUiResponsePathMustFit');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await input.setValue('72');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses current TLS input dimensions and independently rejects under-sized identity backing', async () => {
    const footprint = {
      encodedBytes: '1412',
      derBlockBytes: '512',
      derTotalBytes: '976',
      certificates: '2',
    };
    const owner = {
      accepting: true,
      ownerId,
      policyRevision: '1',
      sampledAt: usage.sampledAt,
    };
    const webTls = {
      pem: {
        ...owner,
        footprint,
        peak: { ...footprint, encodedBytes: '1600' },
        maxCertificates: '4',
        maxDerBlockBytes: '1024',
        maxDerTotalBytes: '2048',
        maxEncodedBytes: '4096',
        mode: 'provided',
        refusedEncoded: '1',
        refusedDecoded: '0',
        refusedBlockPolicy: '0',
      },
      work: {
        ...owner,
        identityBytes: '4194304',
        maxWorkBytes: '16777216',
        signerBytes: '16384',
        effectiveSignerBytes: '32768',
        retainedControlBytes: '24',
        workBacking: {
          used: '65536',
          limit: '16908288',
          peak: '16842752',
          available: '16842752',
        },
        retainedBacking: {
          used: '33529856',
          limit: '33554432',
          peak: '33554432',
          available: '24576',
        },
        refusedWork: '0',
        refusedIdentity: '0',
        refusedSigner: '2',
      },
    };
    const restart = { ...firstField, effectMode: 'RESTART_PROCESS' };
    const certificate = { ...restart, key: 'max_certificates', desired: '4' };
    const identity = {
      ...restart,
      key: 'identity_bytes',
      desired: '4194304',
      unit: 'bytes',
    };
    const retained = {
      ...identity,
      key: 'max_retained_bytes',
      desired: '33554432',
    };
    const fields: Record<string, (typeof firstField)[]> = {
      'web-tls-pem': [certificate],
      'web-tls-work': [identity, retained],
    };
    api.usage.mockResolvedValue({ extensionStore: usage, webTls });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: fields[resource] ?? [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=web-tls-pem]').trigger('click');
    await flushPromises();
    const inputs = wrapper.get('.quota-metric--response-observations');
    expect(inputs.text()).toContain('webTlsModes.provided');
    expect(inputs.text()).toContain('1,412');
    expect(inputs.text()).toContain('1,600');
    expect(inputs.find('[role=progressbar]').exists()).toBe(false);
    expect(wrapper.text()).toContain('reasons.web_tls_pem_encoded');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.max_certificates"]`)
      .setValue('1');
    expect(wrapper.text()).toContain('webTlsMaterialMustFit');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await button(wrapper, 'closeEditor').trigger('click');

    await wrapper.get('[data-resource=web-tls-work]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--tls-work').text()).toContain(
      'webTlsWorkerBacking',
    );
    expect(wrapper.get('.quota-metric--tls-retained').text()).toContain(
      'webTlsRetainedBacking',
    );
    expect(wrapper.text()).toContain('reasons.web_tls_signer');
    expect(wrapper.text()).toContain('webTlsSignerAtCapacity');
    await button(wrapper, 'adjust').trigger('click');
    const pool = wrapper.get(
      `input[aria-label="${prefix}webTlsRetainedLimit"]`,
    );
    await pool.setValue('7340032');
    expect(wrapper.text()).toContain('webTlsRetainedMustFitTwo');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await pool.setValue('8388608');
    expect(wrapper.text()).toContain('webTlsRetainedMustFitTwo');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await pool.setValue('8388631');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await pool.setValue('8388632');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows original template jobs, file bounds, and startup reservation constraints', async () => {
    const webTemplateTransport = {
      accepting: true,
      capacityBytes: '4096',
      capacityCeiling: '8192',
      capacityFloor: '2048',
      jobs: { available: '1', limit: '2', peak: '2', used: '1' },
      maxExportBytes: '128',
      maxUploadBytes: '3072',
      ownerId,
      peakExportBytes: '0',
      peakUploadBytes: '1536',
      policyRevision: '1',
      refusedDeadline: '0',
      refusedExportBytes: '2',
      refusedJobs: '0',
      refusedReservations: '0',
      refusedUploadBytes: '1',
      timeoutMs: '30000',
      sampledAt: usage.sampledAt,
    };
    const capacity = {
      ...firstField,
      key: 'capacity_bytes',
      desired: '4096',
      effectMode: 'RESTART_PROCESS',
      unit: 'bytes',
    };
    const output = { ...capacity, key: 'max_export_bytes', desired: '128' };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      webTemplateTransport,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'web-template-transport'
          ? [capacity, output]
          : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper
      .get('[data-resource=web-template-transport]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'webTemplateJobs',
    );
    const files = wrapper.get('.quota-metric--response-observations');
    expect(files.text()).toContain('1,536');
    expect(files.text()).toContain('webTemplateNoCompletedFile');
    expect(files.text()).toContain('webTemplatePerJobScope');
    expect(wrapper.text()).toContain('reasons.web_template_export_bytes');
    await button(wrapper, 'adjust').trigger('click');
    const reserve = wrapper.get(
      `input[aria-label="${prefix}fields.capacity_bytes"]`,
    );
    await reserve.setValue('1000');
    expect(wrapper.text()).toContain('webTemplateReservationFloor');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await reserve.setValue('8193');
    expect(wrapper.text()).toContain('webTemplateReservationCeiling');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await reserve.setValue('3072');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps grouped workbook edits in one preview and surfaces an error in another group', async () => {
    const restart = { ...firstField, effectMode: 'RESTART_PROCESS' };
    const fields = [
      { ...restart, key: 'max_entries', desired: '32' },
      { ...restart, key: 'max_cell_bytes', desired: '1024' },
      { ...restart, key: 'max_cell_data_bytes', desired: '2048' },
      { ...restart, key: 'max_errors', desired: '20' },
    ];
    const webTemplateWorkbook = {
      accepting: true,
      limits: fields.map(({ key, desired }) => ({ key, limit: desired })),
      ownerId,
      parsedWorkbooks: '0',
      peakParsedDataRow: null,
      peakUploadedBytes: '0',
      policyRevision: '1',
      refusedUploadBytes: '0',
      refusedWorkbookResources: '1',
      sampledAt: usage.sampledAt,
    };
    api.usage.mockResolvedValue({ extensionStore: usage, webTemplateWorkbook });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'web-template-workbook' ? fields : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=web-template-workbook]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('webWorkbookDecoderObservations');
    expect(wrapper.text()).toContain('webTemplateNoCompletedFile');
    expect(wrapper.text()).toContain('reasons.web_workbook_decoder');
    await button(wrapper, 'adjust').trigger('click');
    const dialog = wrapper.get('[role=dialog]');
    await dialog
      .get(`input[aria-label="${prefix}fields.max_entries"]`)
      .setValue('128');
    await dialog.get('[data-resource=worksheet]').trigger('click');
    await dialog
      .get(`input[aria-label="${prefix}fields.max_cell_bytes"]`)
      .setValue('4096');
    expect(wrapper.text()).toContain('webWorkbookCellMustFit');
    await dialog.get('[data-resource=validation]').trigger('click');
    expect(wrapper.text()).toContain('workbookHiddenInvalid');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await dialog.get('[data-resource=worksheet]').trigger('click');
    await dialog
      .get(`input[aria-label="${prefix}fields.max_cell_bytes"]`)
      .setValue('1536');
    await dialog.get('[data-resource=archive]').trigger('click');
    expect(
      dialog.get<HTMLInputElement>(
        `input[aria-label="${prefix}fields.max_entries"]`,
      ).element.value,
    ).toBe('128');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    await button(wrapper, 'preview').trigger('click');
    expect(api.preview).toHaveBeenLastCalledWith(
      'web-template-workbook',
      expect.objectContaining({
        patch: { max_entries: '128', max_cell_bytes: '1536' },
      }),
    );
    wrapper.unmount();
  });

  it('shows retained capability slots and backing and keeps the repair action available', async () => {
    const capabilityAdmission = {
      accepting: true,
      observations: { available: '0', limit: '1', peak: '1', used: '1' },
      backing: {
        available: '4193352',
        limit: '4194304',
        peak: '1049528',
        used: '952',
      },
      ownerId,
      policyRevision: '1',
      refusedBacking: '0',
      refusedEnvelope: '2',
      refusedResponse: '0',
      refusedSlots: '1',
      sampledAt: usage.sampledAt,
    };
    const slots = {
      ...firstField,
      desired: '1',
      effectMode: 'RESTART_PROCESS',
    };
    const capacity = {
      ...slots,
      key: 'max_pending_bytes',
      desired: '4194304',
      unit: 'bytes',
    };
    api.usage.mockResolvedValue({ extensionStore: usage, capabilityAdmission });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'capability-admission' ? [slots, capacity] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=capability-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('capabilitySlotsFull');
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'capabilitySlotsScope',
    );
    expect(wrapper.get('.quota-metric--bytes').text()).toContain(
      'capabilityBackingScope',
    );
    expect(wrapper.get('.quota-metric--bytes').text()).toContain('<0.1%');
    expect(wrapper.get('.quota-metric--refusals').text()).toContain('3');
    expect(wrapper.text()).toContain('reasons.capability_envelope');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}capabilitySlotsLimit"]`)
      .setValue('2');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows live ACK waits separately from original WebSocket message and byte peaks', async () => {
    const websocketTraffic = {
      accepting: true,
      ackTimeoutMs: '500',
      activeAcknowledgements: {
        available: '3',
        limit: '4',
        peak: '2',
        used: '1',
      },
      maxBatchBytes: '4096',
      maxFrameBytes: '2048',
      maxSnapshotEntries: '8',
      maxSubscriptions: '5',
      messagesPerSecond: '8',
      ownerId,
      peakEncodedBatchBytes: '3600',
      peakEncodedFrameBytes: '512',
      peakMessagesPerSecond: '5',
      peakSnapshotEntries: '3',
      peakSubscriptions: '2',
      policyRevision: '1',
      refusedAckDeadlines: '1',
      refusedEncodedBatches: '3',
      refusedEncodedFrames: '0',
      refusedIncomingFrames: '0',
      refusedMessageRate: '0',
      refusedOutputDeadlines: '0',
      refusedSnapshotEntries: '0',
      refusedSubscriptions: '0',
      sampledAt: usage.sampledAt,
    };
    const frame = {
      ...firstField,
      key: 'max_ws_frame_bytes',
      desired: '2048',
      effectMode: 'RESTART_PROCESS',
      unit: 'bytes',
    };
    const batch = { ...frame, key: 'max_ws_batch_bytes', desired: '4096' };
    api.usage.mockResolvedValue({ extensionStore: usage, websocketTraffic });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'websocket-traffic' ? [frame, batch] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=websocket-traffic]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'websocketAwaitingAck',
    );
    expect(wrapper.text()).toContain('websocketPeakEncodedBatch');
    expect(wrapper.text()).toContain('reasons.websocket_ack_deadline');
    expect(wrapper.text()).toContain('reasons.websocket_encoded_batches');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.${batch.key}"]`)
      .setValue('1024');
    expect(wrapper.text()).toContain('websocketFrameAtMostBatch');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps WebSocket tickets and connection slots independent and validates the original parent cap', async () => {
    const websocketAdmission = {
      accepting: true,
      connections: { available: '0', limit: '4', peak: '4', used: '4' },
      maxConnectionsPerSession: '2',
      maxTickets: '8',
      maxTicketsPerSession: '3',
      ownerId,
      policyRevision: '1',
      refusedSessionConnections: '1',
      refusedSessionTickets: '2',
      refusedTotalConnections: '3',
      refusedTotalTickets: '4',
      sampledAt: usage.sampledAt,
      ticketTtlMs: '5000',
      tickets: null,
    };
    const total = {
      ...firstField,
      key: 'max_ws_connections',
      desired: '4',
      effectMode: 'RESTART_PROCESS',
    };
    const perSession = {
      ...total,
      key: 'max_ws_connections_per_session',
      desired: '2',
    };
    api.usage.mockResolvedValue({ extensionStore: usage, websocketAdmission });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'websocket-admission' ? [total, perSession] : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=websocket-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--pending').text()).toContain('unknown');
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'websocketConnectionScope',
    );
    expect(wrapper.text()).toContain('websocketConnectionsFull');
    expect(wrapper.text()).toContain('reasons.websocket_session_connections');
    expect(wrapper.text()).toContain('reasons.websocket_session_tickets');
    await button(wrapper, 'adjust').trigger('click');
    await wrapper
      .get(`input[aria-label="${prefix}fields.${total.key}"]`)
      .setValue('1');
    expect(wrapper.text()).toContain('websocketSessionConnectionsAtMostTotal');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('validates the committed authorization graph before reviewing its restart limits', async () => {
    const authorizationPolicy = {
      accepting: true,
      entries: { available: '13', limit: '20', peak: '8', used: '7' },
      inputBytes: { available: '512', limit: '1024', peak: '640', used: '512' },
      ownerId,
      policyRevision: '4',
      refusedGraphLoad: '0',
      refusedGraphWrite: '1',
      refusedInput: '0',
      sampledAt: usage.sampledAt,
    };
    const entries = {
      ...firstField,
      key: 'max_policy_entries',
      desired: '20',
      effectMode: 'RESTART_PROCESS',
    };
    const bytes = {
      ...entries,
      key: 'max_policy_bytes',
      desired: '1024',
      unit: 'bytes',
    };
    api.usage.mockResolvedValue({ extensionStore: usage, authorizationPolicy });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'authorization-policy' ? [entries, bytes] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '20',
          desired: '7',
          effective: '20',
          effectMode: entries.effectMode,
          key: entries.key,
        },
      ],
      requiresProcessRestart: true,
      running: authorizationPolicy,
      wouldDrain: false,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=authorization-policy]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('authorizationEntryScope');
    expect(wrapper.text()).toContain('reasons.authorization_graph_write');
    await button(wrapper, 'adjust').trigger('click');
    const field = wrapper.get(
      `input[aria-label="${prefix}fields.${entries.key}"]`,
    );
    await field.setValue('6');
    expect(wrapper.text()).toContain('authorizationGraphMustFit');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await field.setValue('7');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=dialog]').text()).toContain(
      'authorizationRestartDetail',
    );
    expect(api.preview).toHaveBeenCalledWith('authorization-policy', {
      expectedOwnerId: ownerId,
      expectedPolicyRevision: '4',
      expectedSourceHash: sourceHash,
      patch: { max_policy_entries: '7' },
    });
    wrapper.unmount();
  });

  it('keeps unavailable session counts distinct and warns that issued sessions survive policy restart', async () => {
    const sessionAdmission = {
      accepting: true,
      activeSessions: null,
      maxSessions: '4',
      maxSessionsPerUser: '2',
      ownerId,
      policyRevision: '1',
      refusedLeaseBacking: '0',
      refusedLeaseSlots: '0',
      refusedTotalSlots: '3',
      refusedUserSlots: '2',
      sampledAt: usage.sampledAt,
      sessionLeases: { available: '4', limit: '4', peak: '0', used: '0' },
    };
    const total = {
      ...firstField,
      key: 'max_sessions',
      desired: '4',
      effectMode: 'RESTART_PROCESS',
    };
    const perUser = { ...total, key: 'max_sessions_per_user', desired: '2' };
    api.usage.mockResolvedValue({ extensionStore: usage, sessionAdmission });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'session-admission' ? [total, perUser] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '4',
          desired: '3',
          effective: '4',
          effectMode: total.effectMode,
          key: total.key,
        },
      ],
      requiresProcessRestart: true,
      running: sessionAdmission,
      wouldDrain: false,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=session-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.quota-metric--pending').text()).toContain(
      'sessionCountUnavailable',
    );
    expect(wrapper.get('.quota-metric--execution').text()).toContain(
      'sessionLeaseScope',
    );
    expect(wrapper.text()).toContain('reasons.session_user_slots');
    expect(wrapper.text()).toContain('reasons.session_total_slots');
    await button(wrapper, 'adjust').trigger('click');
    const field = wrapper.get(
      `input[aria-label="${prefix}fields.${total.key}"]`,
    );
    await field.setValue('1');
    expect(wrapper.text()).toContain('sessionUserAtMostTotal');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await field.setValue('3');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role=dialog]').text()).toContain(
      'sessionRestartDetail',
    );
    expect(api.preview).toHaveBeenCalledWith('session-admission', {
      expectedOwnerId: ownerId,
      expectedPolicyRevision: '1',
      expectedSourceHash: sourceHash,
      patch: { max_sessions: '3' },
    });
    wrapper.unmount();
  });

  it('distinguishes token replenishment from retained account slots', async () => {
    const loginAdmission = {
      accepting: true,
      accountRefillMs: '4000',
      accounts: { available: '1', limit: '8', peak: '8', used: '7' },
      accountTokenCapacity: '3',
      globalRefillMs: '1000',
      globalTokenCapacity: '5',
      globalTokensAvailable: '0',
      ownerId,
      policyRevision: '1',
      refusedAccountSlots: '1',
      refusedAccountTokens: '2',
      refusedGlobalTokens: '3',
      sampledAt: usage.sampledAt,
    };
    api.usage.mockResolvedValue({ extensionStore: usage, loginAdmission });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields:
        resource === 'login-admission'
          ? [
              {
                ...firstField,
                key: 'login_burst',
                desired: '5',
                effectMode: 'RESTART_PROCESS',
              },
            ]
          : [firstField],
      sourceHash,
    }));
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=login-admission]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('loginGlobalTokensEmpty');
    expect(wrapper.text()).toContain('loginGlobalTokens');
    expect(wrapper.text()).toContain('loginRefillCadence');
    expect(wrapper.text()).toContain('loginAccountSlots');
    expect(wrapper.text()).toContain('login_account_slots');
    expect(wrapper.text()).toContain('login_account_tokens');
    expect(wrapper.text()).toContain('login_global_tokens');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('presents HTTP capacities, refusal reasons, and restart-only fields independently', async () => {
    const httpIngress = {
      accepting: true,
      jsonBodyTimeoutMs: '6000',
      managementJsonBytes: '4096',
      nativeWork: { available: '0', limit: '2', peak: '2', used: '2' },
      ownerId,
      policyRevision: '1',
      refusedArrivalBacking: '0',
      refusedJsonBytes: '3',
      refusedJsonCapacity: '0',
      refusedJsonDeadline: '6',
      refusedNativeSlots: '0',
      refusedRequestSlots: '0',
      requests: { available: '7', limit: '8', peak: '3', used: '1' },
      sampledAt: usage.sampledAt,
    };
    const body = {
      ...firstField,
      desired: '4096',
      effectMode: 'RESTART_PROCESS',
      key: 'management_json_bytes',
      max: '1048576',
      min: '1024',
      persisted: '4096',
      unit: 'bytes',
    };

    const quotaManagement = {
      ...httpIngress,
      ownerId: '62b92dde-39c9-4f0e-92d0-0825b43018af',
      requests: { available: '1', limit: '2', peak: '2', used: '1' },
      nativeWork: { available: '1', limit: '1', peak: '1', used: '0' },
      backing: {
        available: '20929584',
        limit: '20971520',
        peak: '16818944',
        used: '41936',
      },
      refusedJsonBytes: '0',
      refusedJsonDeadline: '0',
      refusedSourceBacking: '2',
    };
    api.usage.mockResolvedValue({
      extensionStore: usage,
      httpIngress,
      quotaManagement,
    });
    api.catalog.mockImplementation(async (resource: string) => ({
      canConfigure: true,
      fields: resource === 'http-ingress' ? [body] : [firstField],
      sourceHash,
    }));
    api.preview.mockResolvedValue({
      delta: [
        {
          configured: '4096',
          desired: '2048',
          effective: '4096',
          effectMode: body.effectMode,
          key: body.key,
        },
      ],
      requiresProcessRestart: true,
      running: httpIngress,
      wouldDrain: false,
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=http-ingress]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('httpRequestSample');
    expect(wrapper.text()).toContain('httpNativeSlotsBusy');
    expect(wrapper.text()).toContain('httpRefusalsScope');
    expect(wrapper.text()).toContain('quotaManagementScope');
    expect(wrapper.text()).toContain('quotaManagementRefusedSource');
    expect(wrapper.text()).toContain('20,971,520');
    expect(wrapper.text()).toContain('reasons.http_json_bytes');
    expect(wrapper.text()).toContain('reasons.http_json_deadline');
    await button(wrapper, 'adjust').trigger('click');
    const field = wrapper.get(
      `input[aria-label="${prefix}fields.${body.key}"]`,
    );
    await field.setValue('1023');
    expect(button(wrapper, 'preview').attributes('disabled')).toBeDefined();
    await field.setValue('2048');
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(api.preview).toHaveBeenCalledWith('http-ingress', {
      expectedOwnerId: ownerId,
      expectedPolicyRevision: '1',
      expectedSourceHash: sourceHash,
      patch: { management_json_bytes: '2048' },
    });
    expect(wrapper.get('[role=dialog]').text()).toContain(
      'quotaPolicyNeedsRestart',
    );
    expect(wrapper.get('[role=dialog]').text()).not.toContain(
      'projectedHeadroom',
    );
    wrapper.unmount();
  });

  it('keeps a single quota read in flight and coalesces superseded scopes', async () => {
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.catalog.mockImplementationOnce(async () => {
      await first;
      return { canConfigure: true, fields: [firstField], sourceHash };
    });
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    await wrapper.get('[data-resource=auth-admission]').trigger('click');
    await wrapper.get('[data-resource=http-ingress]').trigger('click');
    expect(api.catalog).toHaveBeenCalledTimes(1);
    expect(api.usage).not.toHaveBeenCalled();
    release?.();
    await flushPromises();
    expect(api.catalog.mock.calls).toEqual([
      ['extension-store'],
      ['http-ingress'],
    ]);
    expect(api.usage).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('keeps and labels the last sample during an outage and prevents a new edit', async () => {
    const wrapper = mount(ResourceQuotas);
    await flushPromises();
    api.usage.mockRejectedValueOnce(new Error('unreachable'));
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('staleReadings');
    expect(wrapper.text()).toContain(
      new Intl.NumberFormat().format(9_007_199_254_740_993n),
    );
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeDefined();
    await button(wrapper, 'refresh').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('staleReadings');
    expect(button(wrapper, 'adjust').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
