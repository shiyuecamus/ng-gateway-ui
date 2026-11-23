import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportFlow } from '#/shared/composables/use-import-flow';

type Confirmation = {
  okButtonProps: { disabled: boolean };
  onCancel: () => void;
  onOk: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  confirm: vi.fn<(options: Confirmation) => { destroy: () => void }>(),
  destroy: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('ant-design-vue', () => {
  const part = () => null;
  return {
    Descriptions: Object.assign(part, { Item: part }),
    List: Object.assign(() => null, { Item: part }),
    message: { error: mocks.error, success: mocks.success },
    Modal: { confirm: mocks.confirm },
    Tag: part,
    Typography: { Text: part },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockReturnValue({ destroy: mocks.destroy });
});

async function confirmation() {
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  const value = mocks.confirm.mock.calls[0]?.[0];
  if (!value) throw new Error('missing import confirmation');
  return value;
}

describe('complete workbook import', () => {
  it.each([
    { invalid: 1, totalRows: 2, valid: 1 },
    { invalid: 0, totalRows: 2, valid: 1 },
    { invalid: 0, totalRows: 0, valid: 0 },
  ])('disables committing an incomplete preview: %o', async (summary) => {
    const commitRequest = vi.fn();
    const flow = useImportFlow({
      commitRequest,
      previewRequest: vi.fn().mockResolvedValue({
        ...summary,
        errors: [],
        warn: 0,
      }),
    });
    const pending = flow.runImport(new File(['xlsx'], 'input.xlsx'), {
      title: 'Import',
    });
    const modal = await confirmation();
    expect(modal.okButtonProps.disabled).toBe(true);
    modal.onCancel();
    await pending;
    expect(commitRequest).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(flow.loading.value).toBe(false);
  });

  it('submits the same fully valid file and refreshes only after successful commit', async () => {
    const file = new File(['xlsx'], 'corrected.xlsx');
    const summary = { errors: [], invalid: 0, totalRows: 2, valid: 2, warn: 0 };
    const commitRequest = vi
      .fn()
      .mockResolvedValue({ ...summary, inserted: 2 });
    const onDone = vi.fn();
    const flow = useImportFlow({
      commitRequest,
      previewRequest: vi.fn().mockResolvedValue(summary),
    });
    const pending = flow.runImport(file, { onDone, title: 'Import' });
    const modal = await confirmation();
    expect(modal.okButtonProps.disabled).toBe(false);
    await modal.onOk();
    await pending;
    expect(commitRequest).toHaveBeenCalledExactlyOnceWith(file);
    expect(onDone).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('surfaces commit rejection without success or refresh', async () => {
    const flow = useImportFlow({
      commitRequest: vi.fn().mockRejectedValue(new Error('row 3 is invalid')),
      previewRequest: vi.fn().mockResolvedValue({
        errors: [],
        invalid: 0,
        totalRows: 2,
        valid: 2,
        warn: 0,
      }),
    });
    const onDone = vi.fn();
    const pending = flow.runImport(new File(['xlsx'], 'input.xlsx'), {
      onDone,
      title: 'Import',
    });
    const rejected = expect(pending).rejects.toThrow('row 3 is invalid');
    const modal = await confirmation();
    await modal.onOk();
    await rejected;
    expect(mocks.error).toHaveBeenCalledWith('row 3 is invalid');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(flow.loading.value).toBe(false);
  });
});
