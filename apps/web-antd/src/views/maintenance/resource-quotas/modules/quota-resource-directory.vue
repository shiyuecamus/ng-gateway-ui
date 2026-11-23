<script setup lang="ts">
import type { QuotaResource } from '#/api/core/resource-quota';

import { computed, ref, useId, watch } from 'vue';

import { Check, Search } from '@vben/icons';

import {
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Empty,
  Input,
  Select,
} from 'ant-design-vue';

import { isQuotaResource, quotaGroups } from '#/api/core/resource-quota';

import { quotaGroupAppearance, quotaText, resourceName } from './presentation';

const props = defineProps<{
  disabled: boolean;
  resource: QuotaResource;
  wide: boolean;
}>();
const emit = defineEmits<{ change: [resource: QuotaResource] }>();
const pickerId = useId();
const directoryHeadingId = useId();
const search = ref('');
const expandedGroups = ref<string[]>([]);
const expandedMatches = ref<string[]>([]);

const groups = computed(() =>
  quotaGroups.map(({ key, resources }) => ({
    ...quotaGroupAppearance[key],
    key,
    label: quotaText(`resourceGroups.${key}`),
    options: resources.map((value) => ({ label: resourceName(value), value })),
  })),
);
const query = computed(() => search.value.trim());
const matchedGroups = computed(() =>
  groups.value
    .map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        filterResource(query.value, option),
      ),
    }))
    .filter(({ options }) => options.length > 0),
);
const shownGroups = computed(() =>
  query.value ? matchedGroups.value : groups.value,
);
const expanded = computed({
  get: () => (query.value ? expandedMatches.value : expandedGroups.value),
  set: (keys: string[]) => {
    if (query.value) expandedMatches.value = keys;
    else expandedGroups.value = keys;
  },
});

function filterResource(
  input: string,
  option?: { label?: unknown; value?: null | number | string },
) {
  const needle = input.trim().toLocaleLowerCase();
  return (
    String(option?.label ?? '')
      .toLocaleLowerCase()
      .includes(needle) || String(option?.value ?? '').includes(needle)
  );
}

function select(value: unknown) {
  if (!props.disabled && isQuotaResource(value)) emit('change', value);
}

function selectOnlyMatch() {
  if (!query.value || matchedGroups.value.length !== 1) return;
  const options = matchedGroups.value[0]?.options;
  if (options?.length === 1) select(options[0]?.value);
}

function toggleGroupWithSpace(event: KeyboardEvent) {
  const header = event.target;
  // Ant Design's Collapse header handles Enter and exposes the button role.
  if (
    !(header instanceof HTMLElement) ||
    !header.matches('.ant-collapse-header[role="button"]')
  )
    return;
  event.preventDefault();
  if (!event.repeat) header.click();
}

watch(matchedGroups, (groups) => {
  if (query.value) expandedMatches.value = groups.map(({ key }) => key);
});
watch(
  () => props.resource,
  (resource) => {
    const group = groups.value.find(({ options }) =>
      options.some(({ value }) => value === resource),
    );
    if (group && !expandedGroups.value.includes(group.key)) {
      expandedGroups.value = [...expandedGroups.value, group.key];
    }
  },
  { immediate: true },
);
</script>

<template>
  <Card v-if="wide" class="quota-directory" size="small">
    <nav :aria-labelledby="directoryHeadingId">
      <div class="quota-directory__tools">
        <h2 :id="directoryHeadingId" class="m-0 text-sm font-semibold">
          {{ quotaText('resourceDirectory') }}
        </h2>
        <Input
          v-model:value="search"
          :aria-label="quotaText('resourceSearch')"
          :placeholder="quotaText('resourceSearch')"
          :disabled="disabled"
          allow-clear
          @press-enter="selectOnlyMatch"
          @keydown.esc.stop="search = ''"
        >
          <template #prefix>
            <Search :size="15" aria-hidden="true" />
          </template>
        </Input>
      </div>

      <div
        class="quota-directory__groups"
        @keydown.space="toggleGroupWithSpace"
      >
        <Empty
          v-if="shownGroups.length === 0"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="quotaText('resourceNoMatches')"
        />
        <Collapse v-else v-model:active-key="expanded" ghost>
          <CollapsePanel
            v-for="group in shownGroups"
            :key="group.key"
            :style="{ '--quota-directory-accent': group.accent }"
          >
            <template #header>
              <span class="quota-directory__family">
                <span class="quota-directory__icon" aria-hidden="true">
                  <component :is="group.icon" :size="15" />
                </span>
                {{ group.label }}
              </span>
            </template>
            <ul class="m-0 grid list-none gap-0.5 p-0">
              <li v-for="option in group.options" :key="option.value">
                <Button
                  :aria-current="option.value === resource ? 'true' : undefined"
                  :disabled="disabled"
                  class="quota-directory__item"
                  type="text"
                  @click="select(option.value)"
                >
                  <span class="min-w-0">{{ option.label }}</span>
                  <Check
                    v-if="option.value === resource"
                    :size="15"
                    class="shrink-0"
                    aria-hidden="true"
                  />
                </Button>
              </li>
            </ul>
          </CollapsePanel>
        </Collapse>
      </div>
    </nav>
  </Card>
  <div v-else class="grid min-w-0 gap-1.5">
    <label :for="pickerId" class="text-xs font-medium text-muted-foreground">
      {{ quotaText('resourceFamily') }}
    </label>
    <Select
      :id="pickerId"
      :disabled="disabled"
      :filter-option="filterResource"
      :not-found-content="quotaText('resourceNoMatches')"
      :options="groups"
      :value="resource"
      class="quota-resource-picker w-full"
      show-search
      size="large"
      @change="select"
    />
  </div>
</template>

<style scoped>
.quota-directory {
  border-radius: 14px;
}

.quota-directory :deep(.ant-card-body) {
  padding: 0;
}

.quota-directory__tools {
  display: grid;
  gap: 0.65rem;
  padding: 0.95rem 0.85rem 0.8rem;
  border-bottom: 1px solid hsl(var(--border));
}

.quota-directory__tools :deep(.ant-input-prefix) {
  margin-inline-end: 0.45rem;
  color: hsl(var(--muted-foreground));
}

.quota-directory__tools :deep(.ant-input::placeholder) {
  color: hsl(var(--muted-foreground));
  opacity: 1;
}

.quota-directory__groups {
  max-height: max(12rem, calc(100dvh - 17rem));
  padding: 0.35rem;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.quota-directory__groups :deep(.ant-collapse-header) {
  gap: 0.35rem;
  align-items: center;
  min-height: 42px;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
}

.quota-directory__groups :deep(.ant-collapse-header:hover) {
  background: hsl(var(--accent));
}

.quota-directory__groups :deep(.ant-collapse-content-box) {
  padding: 0 0.35rem 0.35rem 1.45rem;
}

.quota-directory__family {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  font-weight: 550;
  overflow-wrap: anywhere;
}

.quota-directory__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  color: color-mix(
    in srgb,
    var(--quota-directory-accent) 67%,
    hsl(var(--foreground))
  );
  background: color-mix(
    in srgb,
    var(--quota-directory-accent) 14%,
    hsl(var(--card))
  );
  border-radius: 6px;
}

.quota-directory__item {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: auto;
  min-height: 34px;
  padding: 0.3rem 0.5rem;
  text-align: start;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quota-directory__item[aria-current='true'] {
  font-weight: 600;
  color: color-mix(
    in srgb,
    var(--quota-directory-accent) 55%,
    hsl(var(--foreground))
  );
  background: color-mix(
    in srgb,
    var(--quota-directory-accent) 15%,
    hsl(var(--card))
  );
}

.quota-directory__item:focus-visible,
.quota-directory__groups :deep(.ant-collapse-header:focus-visible),
.quota-resource-picker:focus-within :deep(.ant-select-selector) {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}
</style>
