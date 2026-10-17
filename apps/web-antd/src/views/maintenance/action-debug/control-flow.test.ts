import type { VueWrapper } from '@vue/test-utils';
import type { Slots } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import ActionDebug from './index.vue';
import { prepareControlIntent } from './modules/intent';

const api = vi.hoisted(() => ({
  channels: vi.fn(),
  devices: vi.fn(),
  actions: vi.fn(),
  capabilities: vi.fn(),
  status: vi.fn(),
  find: vi.fn(),
  debug: vi.fn(),
  submit: undefined as
    | ((values: Record<string, unknown>) => Promise<void>)
    | undefined,
}));

vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { id: 1 } }),
}));
vi.mock('@vben/hooks', () => ({
  useRequestHandler: () => ({
    handleRequest: async (
      request: () => Promise<unknown>,
      success?: (data: unknown) => void,
    ) => {
      try {
        const response = await request();
        success?.(response);
        return response;
      } catch {
        return undefined;
      }
    },
  }),
}));
vi.mock('@vben/common-ui', async () => {
  const { h } = await import('vue');
  return {
    Page: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    JsonViewer: (props: { value: unknown }) =>
      h('pre', JSON.stringify(props.value)),
  };
});
vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  return {
    Alert: (props: { message: string }) => h('p', props.message),
    Button: (props: { disabled?: boolean }, { slots }: { slots: Slots }) =>
      h('button', { disabled: props.disabled }, slots.default?.()),
    Card: (_: unknown, { slots }: { slots: Slots }) =>
      h('div', slots.default?.()),
    Input: (
      props: { disabled?: boolean; placeholder?: string; value: string },
      { emit }: { emit: (event: string, value: string) => void },
    ) =>
      h('input', {
        ...props,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLInputElement).value),
      }),
    Select: (
      props: {
        disabled?: boolean;
        options: { label: string; value: number | string }[];
        value?: number | string;
      },
      { emit }: { emit: (event: string, value?: number | string) => void },
    ) =>
      h(
        'select',
        {
          value: props.value,
          disabled: props.disabled,
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;
            emit(
              'update:value',
              props.options.find((entry) => String(entry.value) === value)
                ?.value,
            );
          },
        },
        props.options.map((entry) =>
          h('option', { value: entry.value }, entry.label),
        ),
      ),
  };
});
vi.mock('#/adapter/form', async () => {
  const { h } = await import('vue');
  return {
    useVbenForm: (options: { handleSubmit: typeof api.submit }) => {
      api.submit = options.handleSubmit;
      return [
        (props: { disabled?: boolean }) =>
          h(
            'button',
            { 'data-test': 'form-submit', disabled: props.disabled },
            'submit',
          ),
        { setState: vi.fn(), setValues: vi.fn() },
      ];
    },
  };
});
vi.mock('#/api', () => ({
  fetchChannelList: api.channels,
  getSubDevicesById: api.devices,
}));
vi.mock('#/api/core', () => ({
  debugAction: api.debug,
  fetchActionsByDevice: api.actions,
}));
vi.mock('#/api/core/control', () => ({
  findControlOperation: api.find,
  getControlCapabilities: api.capabilities,
  getControlServiceStatus: api.status,
}));
vi.mock('./modules/authority.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('./modules/history.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('./modules/operation.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: { operationId: String },
      setup: (props: { operationId?: string }) => () =>
        h('div', { 'data-test': 'operation' }, props.operationId),
    },
  };
});
vi.mock('./modules/schemas', () => ({
  buildActionDebugInitialValues: () => ({}),
  buildActionDebugSchema: () => [],
}));

function requiredButton(page: VueWrapper, text: string) {
  const button = page.findAll('button').find((item) => item.text() === text);
  if (!button) throw new Error(`Missing control button: ${text}`);
  return button;
}

function requiredSelect(page: VueWrapper, index: number) {
  const select = page.findAll('select').at(index);
  if (!select) throw new Error(`Missing selector: ${index}`);
  return select;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('control page identity and selection ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    api.channels.mockResolvedValue(
      [1, 2].map((id) => ({
        id,
        name: `channel-${id}`,
        configuration: {
          state: 'active',
          desiredRevision: '7',
          appliedRevision: '7',
        },
      })),
    );
    api.capabilities.mockResolvedValue({
      canExecuteAction: true,
      canEngineer: false,
      canReconcile: false,
    });
    api.status.mockResolvedValue({ available: true });
    api.find.mockResolvedValue(null);
  });

  it('discards a late channel-A device list after the operator selects channel B', async () => {
    const first = deferred<unknown[]>();
    const second = deferred<unknown[]>();
    api.devices.mockImplementation((id) =>
      id === 1 ? first.promise : second.promise,
    );
    const page = mount(ActionDebug);
    await flushPromises();
    await requiredSelect(page, 0).setValue('1');
    await requiredSelect(page, 0).setValue('2');
    second.resolve([{ id: 22, channelId: 2, deviceName: 'B-device' }]);
    await flushPromises();
    first.resolve([{ id: 11, channelId: 1, deviceName: 'A-device' }]);
    await flushPromises();
    expect(requiredSelect(page, 1).text()).toBe('B-device');
    page.unmount();
  });

  it('recovers a saved identity while offline without dispatching or depending on the current form', async () => {
    const intent = prepareControlIntent('user:1', 'action:removed', {
      params: { value: true },
      expectedConfigurationRevision: '7',
    });
    api.channels.mockResolvedValue([]);
    api.status.mockResolvedValue({ available: false, fault: 'offline' });
    api.find.mockResolvedValue({
      operation: { operationId: 'original-operation' },
    });
    const page = mount(ActionDebug);
    await flushPromises();
    await requiredSelect(page, 3).setValue(intent.idempotencyKey);
    await requiredButton(page, 'page.control.recoverIntent').trigger('click');
    await flushPromises();
    expect(api.find).toHaveBeenCalledWith(intent.idempotencyKey);
    expect(api.debug).not.toHaveBeenCalled();
    expect(page.get('[data-test="operation"]').text()).toBe(
      'original-operation',
    );
    page.unmount();
  });

  it('freezes the submitted body after a lost response and retries the original identity', async () => {
    api.devices.mockResolvedValue([
      { id: 11, channelId: 1, deviceName: 'device' },
    ]);
    api.actions.mockResolvedValue([{ id: 101, deviceId: 11, name: 'action' }]);
    api.debug.mockRejectedValueOnce(new Error('lost response'));
    const page = mount(ActionDebug);
    await flushPromises();
    await requiredSelect(page, 0).setValue('1');
    await flushPromises();
    await requiredSelect(page, 1).setValue('11');
    await flushPromises();
    await requiredSelect(page, 2).setValue('101');
    await flushPromises();
    await api.submit?.({ value: '9007199254740993', timeoutMs: 5000 });
    await flushPromises();
    expect(
      page.get('[data-test="form-submit"]').attributes('disabled'),
    ).toBeDefined();
    const original = api.debug.mock.calls.at(0)?.[1];
    expect(original).toBeDefined();
    api.find.mockResolvedValue({
      operation: { operationId: 'already-registered' },
    });
    await requiredButton(page, 'page.control.retryOriginalIntent').trigger(
      'click',
    );
    await flushPromises();
    expect(api.find).toHaveBeenLastCalledWith(original.idempotencyKey);
    expect(original.params.value).toBe('9007199254740993');
    expect(api.debug).toHaveBeenCalledTimes(1);
    expect(page.get('[data-test="operation"]').text()).toBe(
      'already-registered',
    );
    page.unmount();
  });
});
