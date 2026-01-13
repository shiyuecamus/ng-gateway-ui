<script lang="ts" setup>
import type { ActionInfo, Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';

import { computed, nextTick, ref, watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { IconifyIcon } from '@vben/icons';

import { cloneDeep, set } from '@vben-core/shared/utils';

import { Card } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';

import { useActionParameterBasicFormSchema } from './schemas/form';

type ActionParameter = ActionInfo['inputs'][number];

defineOptions({ name: 'ActionParameterForm' });

const emit = defineEmits<{
  (
    event: 'submit',
    type: FormOpenType,
    index: null | number,
    value: ActionParameter,
  ): void;
}>();

const formType = ref<FormOpenType>(FormOpenType.CREATE);
const editingIndex = ref<null | number>(null);
const driverSchemasRef = ref<VbenFormSchema[]>([]);
const parameterRef = ref<ActionParameter | null>(null);

const hasDriverSchema = computed(() => driverSchemasRef.value.length > 0);

const [ParameterForm, parameterFormApi] = useVbenForm({
  schema: useActionParameterBasicFormSchema(),
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/4',
  },
});

const [DriverForm, driverFormApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  commonConfig: {
    labelClass: 'text-[14px] w-1/4',
  },
  wrapperClass: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-2',
});

watch(
  () => parameterRef.value,
  async (current) => {
    const baseValues = current
      ? {
          name: current.name,
          key: current.key,
          dataType: current.dataType,
          required: current.required ?? false,
          defaultValue: current.defaultValue,
          minValue: current.minValue,
          maxValue: current.maxValue,
        }
      : { required: false };
    await parameterFormApi.resetForm({ values: baseValues });
  },
  { immediate: true },
);

watch(
  [() => driverSchemasRef.value, () => parameterRef.value],
  async ([schemas, current]) => {
    const typedSchemas = schemas as VbenFormSchema[];
    driverFormApi.setState({ schema: typedSchemas });
    if (typedSchemas.length === 0) {
      await driverFormApi.resetForm({ values: {} });
      return;
    }
    const defaults = resolveDriverDefaultValues(typedSchemas);
    const currentConfig = current?.driverConfig
      ? cloneDeep(current.driverConfig as Recordable<any>)
      : {};
    await nextTick();
    await driverFormApi.resetForm({
      values: { ...defaults, ...currentConfig },
    });
  },
  { immediate: true },
);

const [ParameterDrawer, parameterDrawerApi] = useVbenDrawer({
  class: 'w-1/2',
  destroyOnClose: true,
  showConfirmButton: true,
  onCancel() {
    parameterDrawerApi.close();
  },
  onConfirm: async () => {
    await handleSubmit();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    await init();
  },
});

async function init() {
  const data = parameterDrawerApi.getData<{
    driverSchemas: VbenFormSchema[];
    index: null | number;
    parameter: ActionParameter | null;
    type: FormOpenType;
  }>();

  formType.value = data?.type ?? FormOpenType.CREATE;
  editingIndex.value = typeof data?.index === 'number' ? data.index : null;
  driverSchemasRef.value = data?.driverSchemas ?? [];
  parameterRef.value = data?.parameter ?? null;
}

async function handleSubmit() {
  const baseValues = (await parameterFormApi.validateAndSubmitForm()) as
    | Recordable<any>
    | undefined;
  if (!baseValues) {
    return;
  }

  let driverValues: Recordable<any> = {};
  if (hasDriverSchema.value) {
    const driverResult = await driverFormApi.validateAndSubmitForm();
    if (!driverResult) {
      return;
    }
    driverValues = driverResult;
  }

  emit('submit', formType.value, editingIndex.value, {
    ...baseValues,
    driverConfig: cloneDeep(driverValues ?? {}),
  } as ActionParameter);
}

function resolveDriverDefaultValues(
  schemas: VbenFormSchema[],
): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const item of schemas) {
    if (!item || !item.fieldName) continue;
    if (Reflect.has(item, 'defaultValue') && item.defaultValue !== undefined) {
      set(defaults, item.fieldName, (item as any).defaultValue);
    }
  }
  return defaults;
}
</script>

<template>
  <ParameterDrawer>
    <div class="space-y-4 p-4">
      <Card size="small">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-4" icon="mdi:information-outline" />
            {{ $t('page.southward.point.basic') }}
          </div>
        </template>
        <ParameterForm />
      </Card>
      <Card v-show="hasDriverSchema" size="small">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-4" icon="mdi:cog-outline" />
            {{ $t('page.southward.point.driver') }}
          </div>
        </template>
        <DriverForm v-if="hasDriverSchema" />
      </Card>
    </div>
  </ParameterDrawer>
</template>
