<script lang="ts" setup>
import type { ActionInfo } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickParams } from '#/adapter/vxe-table';

import { watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import { Button, Card, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

import ActionParameterForm from './action-parameter-form.vue';
import { useActionParameterColumns } from './schemas/table-columns';

type ActionParameter = ActionInfo['inputs'][number];

defineOptions({ name: 'ActionParameterManager' });

const props = defineProps<{
  driverSchemas: VbenFormSchema[];
  parameters: ActionParameter[];
}>();

const emit = defineEmits<{
  (event: 'update:parameters', value: ActionParameter[]): void;
}>();

const [ParameterDrawer, parameterDrawerApi] = useVbenDrawer({
  connectedComponent: ActionParameterForm,
});

function findParameterIndex(target: ActionParameter) {
  if (!target) return -1;

  if (target.key) {
    const byKey = props.parameters.findIndex(({ key }) => key === target.key);
    if (byKey !== -1) return byKey;
  }

  if (target.name) {
    const byName = props.parameters.findIndex(
      ({ name }) => name === target.name,
    );
    if (byName !== -1) return byName;
  }

  return props.parameters.indexOf(target);
}

function handleParameterActionClick({
  code,
  row,
}: OnActionClickParams<ActionParameter>) {
  switch (code) {
    case 'delete': {
      removeParameter(row);
      break;
    }
    case 'edit': {
      const index = findParameterIndex(row);
      if (index !== -1) {
        openParameterDrawer(index);
      }
      break;
    }
    default: {
      break;
    }
  }
}

const [ParameterGrid, parameterGridApi] = useVbenVxeGrid<ActionParameter>({
  showSearchForm: false,
  gridOptions: {
    columns: useActionParameterColumns(handleParameterActionClick),
    data: [],
    height: '450vh',
    rowConfig: {
      keyField: 'key',
    },
    pagerConfig: {
      enabled: false,
    },
  },
});

watch(
  () => props.parameters,
  (rows) => {
    parameterGridApi.setGridOptions({ data: rows });
  },
  { immediate: true, deep: true },
);

function openParameterDrawer(index?: number) {
  const editingIndex = typeof index === 'number' ? index : null;
  const type = editingIndex === null ? FormOpenType.CREATE : FormOpenType.EDIT;

  const parameter =
    editingIndex === null ? null : (props.parameters[editingIndex] ?? null);

  const title =
    type === FormOpenType.CREATE
      ? $t('common.createWithName', {
          name: $t('page.southward.action.parameter.title'),
        })
      : $t('common.editWithName', {
          name: parameter?.name ?? '',
        });

  parameterDrawerApi
    .setData({
      driverSchemas: props.driverSchemas,
      index: editingIndex,
      parameter,
      type,
    })
    .setState({ title })
    .open();
}

function removeParameter(row: ActionParameter) {
  const index = findParameterIndex(row);
  if (index === -1) return;

  const next = [...props.parameters];
  const removed = next.splice(index, 1);
  emit('update:parameters', next);
  if (removed.length > 0) {
    message.success($t('common.action.deleteSuccess'));
  }
}

function handleParameterSubmit(
  type: FormOpenType,
  index: null | number,
  value: ActionParameter,
) {
  const next = [...props.parameters];
  if (type === FormOpenType.EDIT && index !== null && index >= 0) {
    if (index < next.length) {
      next.splice(index, 1, value);
    } else {
      next.push(value);
    }
    message.success($t('common.action.updateSuccess'));
  } else {
    next.push(value);
    message.success($t('common.action.createSuccess'));
  }

  emit('update:parameters', next);
  parameterDrawerApi.close();
}
</script>

<template>
  <Card size="small">
    <template #title>
      <div class="flex items-center gap-2">
        <IconifyIcon class="size-4" icon="mdi:list-box-outline" />
        {{ $t('page.southward.action.parameter.title') }}
      </div>
    </template>
    <template #extra>
      <Button size="small" type="primary" @click="openParameterDrawer()">
        {{ $t('common.create') }}
      </Button>
    </template>
    <ParameterGrid />
  </Card>

  <ParameterDrawer @submit="handleParameterSubmit" />
</template>
