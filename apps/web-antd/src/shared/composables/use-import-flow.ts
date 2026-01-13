import type { CommitResult, ImportPreview } from '@vben/types';

import { h, ref } from 'vue';

import {
  Descriptions,
  List,
  message,
  Modal,
  Tag,
  Typography,
} from 'ant-design-vue';

import { $t } from '#/locales';

type ImportFlowOptions = {
  /** Allow commit even when preview has errors; defaults to true */
  allowCommitWithErrors?: boolean;
  /** Callback executed after successful commit */
  onDone?: () => Promise<void> | void;
  /** Title displayed in the preview modal */
  title: string;
};

type UseImportFlowParams = {
  /** Request function that commits the import */
  commitRequest: (file: File) => Promise<CommitResult>;
  /** Request function that returns a preview summary */
  previewRequest: (file: File) => Promise<ImportPreview>;
};

/**
 * useImportFlow encapsulates the two-step import process: preview and commit.
 * It renders a confirmation modal with a preview summary and errors.
 */
export function useImportFlow({
  previewRequest,
  commitRequest,
}: UseImportFlowParams) {
  const loading = ref(false);

  function renderPreviewContent(preview: ImportPreview) {
    const statsNode = h(
      Descriptions,
      { column: 2, size: 'middle', bordered: true },
      {
        default: () => [
          h(
            Descriptions.Item,
            { label: $t('import.preview.total') },
            {
              default: () =>
                h(Tag, { color: 'blue' }, () => `${preview.totalRows}`),
            },
          ),
          h(
            Descriptions.Item,
            { label: $t('import.preview.valid') },
            {
              default: () =>
                h(Tag, { color: 'green' }, () => `${preview.valid}`),
            },
          ),
          h(
            Descriptions.Item,
            { label: $t('import.preview.invalid') },
            {
              default: () =>
                h(Tag, { color: 'red' }, () => `${preview.invalid}`),
            },
          ),
          h(
            Descriptions.Item,
            { label: $t('import.preview.warn') },
            {
              default: () => h(Tag, { color: 'gold' }, () => `${preview.warn}`),
            },
          ),
        ],
      },
    );

    const errorsNode =
      preview.errors && preview.errors.length > 0
        ? h(
            List,
            {
              bordered: true,
              size: 'small',
              dataSource: preview.errors,
              style: 'margin-top:8px; max-height:240px; overflow:auto;',
            },
            {
              renderItem: ({ item }: { item: any }) =>
                h(
                  List.Item,
                  {},
                  {
                    default: () =>
                      h(
                        Typography.Text,
                        { type: 'danger' },
                        {
                          default: () =>
                            `${$t('import.preview.errorRow')}: ${item.row}，${$t('import.preview.errorField')}: ${item.field}，${$t('import.preview.errorMessage')}: ${item.message}`,
                        },
                      ),
                  },
                ),
            },
          )
        : null;

    return h('div', {}, [statsNode, errorsNode]);
  }

  async function runImport(file: File, opts: ImportFlowOptions) {
    loading.value = true;
    try {
      const preview = await previewRequest(file);
      const allowCommit =
        opts.allowCommitWithErrors === undefined
          ? true
          : !!opts.allowCommitWithErrors;
      const canCommit = preview.valid > 0 && allowCommit;

      return await new Promise<void>((resolve, reject) => {
        const modal = Modal.confirm({
          title: opts.title,
          width: '70%',
          type: 'info',
          content: renderPreviewContent(preview),
          okText: $t('import.actions.commit'),
          cancelText: $t('import.actions.cancel'),
          okButtonProps: { disabled: !canCommit },
          async onOk() {
            try {
              const res = await commitRequest(file);
              message.success(
                $t('import.message.success', [
                  res.inserted,
                  res.valid,
                  res.totalRows,
                  res.invalid,
                  res.warn,
                ]),
              );
              await opts.onDone?.();
              resolve();
            } catch (error: any) {
              message.error(
                error?.message || $t('import.message.commitFailed'),
              );
              reject(error);
            } finally {
              modal.destroy();
            }
          },
          onCancel() {
            resolve();
          },
        });
      });
    } finally {
      loading.value = false;
    }
  }

  return { loading, runImport };
}
