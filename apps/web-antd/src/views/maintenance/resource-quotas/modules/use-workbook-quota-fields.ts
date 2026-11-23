import type {
  QuotaDescriptor,
  QuotaField,
  QuotaResource,
  WorkbookQuotaField,
} from '#/api/core/resource-quota';

import { computed, ref } from 'vue';

import { quotaText } from './presentation';

const groups = ['archive', 'worksheet', 'structures', 'validation'] as const;
type WorkbookGroup = (typeof groups)[number];

const fieldGroups: Partial<Record<QuotaField, WorkbookGroup>> = {
  max_file_bytes: 'archive',
  max_entries: 'archive',
  max_expanded_bytes: 'archive',
  max_entry_bytes: 'archive',
  max_compression_ratio: 'archive',
  max_sheets: 'worksheet',
  max_rows: 'worksheet',
  max_columns: 'worksheet',
  max_cells: 'worksheet',
  max_cell_bytes: 'worksheet',
  max_cell_data_bytes: 'worksheet',
  max_shared_strings: 'structures',
  max_shared_string_bytes: 'structures',
  max_styles: 'structures',
  max_style_bytes: 'structures',
  max_xml_nodes: 'structures',
  max_xml_depth: 'structures',
  max_xml_token_bytes: 'structures',
  max_mapped_bytes: 'validation',
  max_validation_work: 'validation',
  max_errors: 'validation',
  max_error_bytes: 'validation',
} satisfies Record<WorkbookQuotaField, WorkbookGroup>;

/** Filter the original workbook catalog while keeping edits owned by the full form. */
export function useWorkbookQuotaFields(
  resource: () => QuotaResource,
  fields: () => QuotaDescriptor[],
) {
  const selected = ref<WorkbookGroup>();
  const options = computed(() => {
    if (resource() !== 'web-template-workbook') return [];
    const available = new Set(fields().map((field) => fieldGroups[field.key]));
    return groups
      .filter((group) => available.has(group))
      .map((group) => ({
        label: quotaText(`workbookGroups.${group}`),
        value: group,
      }));
  });
  const group = computed({
    get: () =>
      options.value.find(({ value }) => value === selected.value)?.value ??
      options.value[0]?.value,
    set: (value: undefined | WorkbookGroup) => {
      selected.value = value;
    },
  });
  const visibleFields = computed(() => {
    const current = group.value;
    return current === undefined
      ? fields()
      : fields().filter((field) => fieldGroups[field.key] === current);
  });

  function reveal(key: QuotaField) {
    group.value = fieldGroups[key];
  }

  return { group, options, reveal, visibleFields };
}
