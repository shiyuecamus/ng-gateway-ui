import type { Slots } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Operation from './operation.vue';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  reconcile: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('#/api/core/control', () => ({
  cancelControl: api.cancel,
  getControlOperation: api.get,
  reconcileControl: api.reconcile,
  isControlPending: () => false,
}));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/common-ui', async () => {
  const { h } = await import('vue');
  return {
    JsonViewer: (props: { value: unknown }) =>
      h('pre', JSON.stringify(props.value)),
  };
});
vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  const Input = (
    props: { placeholder?: string; value: string },
    {
      emit,
      attrs,
    }: {
      attrs: Record<string, unknown>;
      emit: (event: string, value: string) => void;
    },
  ) =>
    h('input', {
      ...attrs,
      value: props.value,
      placeholder: props.placeholder,
      onInput: (event: Event) =>
        emit('update:value', (event.target as HTMLInputElement).value),
    });
  Input.TextArea = Input;
  return {
    Input,
    Form: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    FormItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Card: (
      _: unknown,
      { slots, attrs }: { attrs: Record<string, unknown>; slots: Slots },
    ) => h('div', attrs, slots.default?.()),
    Descriptions: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    DescriptionsItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Empty: (props: { description: string }) => h('p', props.description),
    Timeline: (_: unknown, { slots }: { slots: Slots }) =>
      h('ol', slots.default?.()),
    TimelineItem: (_: unknown, { slots }: { slots: Slots }) =>
      h('li', slots.default?.()),
    Alert: (props: { message: string }) => h('p', props.message),
    Tag: (_: unknown, { slots }: { slots: Slots }) =>
      h('span', slots.default?.()),
    Button: (props: { disabled?: boolean }, { slots }: { slots: Slots }) =>
      h('button', { disabled: props.disabled }, slots.default?.()),
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
  };
});

function details(id: string) {
  return {
    canCancel: false,
    operation: {
      cancellation: null,
      operationId: id,
      state: 'indeterminate',
      fingerprint: `fingerprint-${id}`,
      channelId: id,
      deviceId: id,
      configurationRevision: '4',
      binding: {
        authorityId: `physical-${id}`,
        footprints: [{ kind: 'object', key: `target-${id}` }],
      },
      targetSnapshot: { name: `original-${id}` },
      clientRequest: { value: 7 },
    },
    events: [],
    currentObservation: { value: 7, freshness: 'current' },
  };
}

describe('unresolved operation verification ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    api.get.mockImplementation(async (id) => details(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('displays the frozen target and requires explicit confirmation of its fingerprint', async () => {
    const view = mount(Operation, {
      props: { operationId: 'A', canReconcile: true },
    });
    await flushPromises();
    expect(view.text()).toContain('original-A');
    expect(view.text()).toContain('physical-A');
    await view
      .get('input[placeholder="page.control.reason"]')
      .setValue('Independent field verification');
    await view
      .get('input[placeholder="page.control.evidence"]')
      .setValue('Work order 7, independently confirmed');
    const submit = view
      .findAll('button')
      .find((button) => button.text() === 'page.control.recordVerification');
    if (!submit) throw new Error('Verification button is absent');
    expect(submit.attributes('disabled')).toBeDefined();
    await view.get('input[type="checkbox"]').setValue(true);
    expect(submit.attributes('disabled')).toBeUndefined();
    api.reconcile.mockResolvedValue({});
    await submit.trigger('click');
    await flushPromises();
    expect(api.reconcile).toHaveBeenCalledWith(
      'A',
      'fingerprint-A',
      'Independent field verification',
      { operatorVerification: 'Work order 7, independently confirmed' },
    );
    view.unmount();
  });

  it('a delayed confirmation for A cannot reset or replace B after the displayed operation changes', async () => {
    let finish: (() => void) | undefined;
    api.reconcile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount(Operation, {
      props: { operationId: 'A', canReconcile: true },
    });
    await flushPromises();
    await view
      .get('input[placeholder="page.control.reason"]')
      .setValue('A verified');
    await view
      .get('input[placeholder="page.control.evidence"]')
      .setValue('Independent record A');
    await view.get('input[type="checkbox"]').setValue(true);
    const submit = view
      .findAll('button')
      .find((button) => button.text() === 'page.control.recordVerification');
    if (!submit) throw new Error('Verification button is absent');
    await submit.trigger('click');
    await view.setProps({ operationId: 'B' });
    await flushPromises();
    const calls = api.get.mock.calls.length;
    if (!finish) throw new Error('Verification request did not start');
    finish();
    await flushPromises();
    expect(api.get.mock.calls).toHaveLength(calls);
    expect(view.text()).toContain('original-B');
    expect(view.text()).not.toContain('original-A');
    expect(
      (view.get('input[type="checkbox"]').element as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (
        view.get('input[placeholder="page.control.reason"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('');
    expect(api.reconcile.mock.calls).toHaveLength(1);
    view.unmount();
  });

  it('labels the cancellation intent separately from the retained dispatch phase', async () => {
    api.get.mockResolvedValue({
      ...details('A'),
      operation: { ...details('A').operation, state: 'dispatching' },
      events: [
        {
          sequence: '1',
          state: 'dispatching',
          phase: 'select',
          reason: 'Durable Select authorization',
          cancellation: null,
          evidence: null,
          recordedAt: '2026-10-08T10:00:00Z',
        },
        {
          sequence: '2',
          state: 'dispatching',
          phase: 'select',
          reason: 'Original operator cancellation accepted',
          cancellation: {
            requestId: 'cancel-A',
            reason: 'Release original selection',
          },
          evidence: null,
          recordedAt: '2026-10-08T10:00:01Z',
        },
      ],
    });
    const view = mount(Operation, {
      props: { operationId: 'A', canReconcile: false },
    });
    await flushPromises();
    const events = view.findAll('li');
    expect(events).toHaveLength(2);
    expect(events[0]?.text()).toContain('page.control.states.dispatching');
    expect(events[0]?.text()).not.toContain('page.control.cancelRequest');
    expect(events[1]?.text()).toContain('page.control.cancelRequest');
    expect(events[1]?.text()).toContain('Release original selection');
    expect(events[1]?.text()).not.toContain('page.control.states.dispatching');
    view.unmount();
  });

  it('retains one reviewed cancellation identity through an uncertain HTTP response', async () => {
    // HTTP management exposes getRandomValues, but not the secure-context randomUUID API.
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    api.get.mockResolvedValue({
      ...details('A'),
      canCancel: true,
      operation: { ...details('A').operation, state: 'selected' },
    });
    api.cancel
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({});
    const view = mount(Operation, {
      props: { operationId: 'A', canReconcile: false },
    });
    await flushPromises();
    const card = view.find('[aria-label="page.control.cancelControl"]');
    expect(card.exists()).toBe(true);
    const reason = card.find('input[aria-label="page.control.cancelReason"]');
    await reason.setValue('Release this original selection');
    await card.find('input[type="checkbox"]').setValue(true);
    await card.find('button').trigger('click');
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledTimes(1);
    const first = api.cancel.mock.calls[0];
    expect(first?.slice(0, 2)).toEqual(['A', 'fingerprint-A']);
    expect(first?.[3]).toBe('Release this original selection');
    await card.find('button').trigger('click');
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledTimes(2);
    expect(api.cancel.mock.calls[1]?.slice(0, 4)).toEqual(first?.slice(0, 4));
    view.unmount();
  });

  it('rejects oversized UTF-8 reasons before freezing an identity and permits a valid correction', async () => {
    api.get.mockResolvedValue({
      ...details('A'),
      canCancel: true,
      operation: { ...details('A').operation, state: 'selected' },
    });
    api.cancel.mockResolvedValue({});
    const view = mount(Operation, {
      props: { operationId: 'A', canReconcile: false },
    });
    await flushPromises();
    const card = view.get('[aria-label="page.control.cancelControl"]');
    const reason = card.get('input[aria-label="page.control.cancelReason"]');
    await card.get('input[type="checkbox"]').setValue(true);
    await reason.setValue('中'.repeat(171));
    expect(card.get('button').attributes('disabled')).toBeDefined();
    await card.get('button').trigger('click');
    await flushPromises();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(reason.attributes('disabled')).toBeUndefined();
    await reason.setValue(`Invalid${String.fromCodePoint(127)}reason`);
    expect(card.get('button').attributes('disabled')).toBeDefined();
    await reason.setValue('中'.repeat(170));
    expect(card.get('button').attributes('disabled')).toBeUndefined();
    await card.get('button').trigger('click');
    await flushPromises();
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(api.cancel.mock.calls[0]?.[3]).toBe('中'.repeat(170));
    view.unmount();
  });
});
