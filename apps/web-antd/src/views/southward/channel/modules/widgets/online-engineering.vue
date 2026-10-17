<script setup lang="ts">
import type { IdType } from '@vben/types';

import type {
  CapabilityInventory,
  MmsName,
  MmsObservation,
  MmsOperation,
  MmsType,
} from '#/api/core/capability';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  Input,
  List,
  ListItem,
  Select,
  Tag,
} from 'ant-design-vue';

import {
  getChannelCapabilities,
  mmsCapabilityId,
  observeMms,
} from '#/api/core/capability';
import { captureEngineeringSnapshot } from '#/api/core/engineering';

defineOptions({ name: 'Iec61850OnlineEngineeringModal' });
const emit = defineEmits<{ captured: [digest: string] }>();
const key = 'page.southward.channel.onlineEngineering';
const channelId = ref<IdType>(0);
const registry = ref<CapabilityInventory | null>(null);
const domains = ref<string[]>([]);
const domainCursor = ref<null | string>(null);
const moreDomains = ref(false);
const domain = ref<string>();
const domainOpen = ref(false);
const directoryOpen = ref(false);
const itemOpen = ref(false);
const directoryClass = ref<'dataSets' | 'variables'>('variables');
const names = ref<string[]>([]);
const item = ref<string>();
const cursor = ref<null | string>(null);
const more = ref(false);
const offset = ref(0);
const result = ref<MmsObservation | null>(null);
const namedReferences = computed(() => {
  const observed = result.value?.result;
  if (observed?.kind !== 'variableType' && observed?.kind !== 'namedType')
    return { items: [] as MmsName[], truncated: false };
  const names = new Map<string, MmsName>();
  const pending: MmsType[] = [observed.specification];
  let visited = 0;
  let truncated = false;
  while (pending.length > 0 && visited < 65_536) {
    const specification = pending.pop();
    visited += 1;
    switch (specification?.kind) {
      case 'array': {
        pending.push(specification.element);
        break;
      }
      case 'named': {
        names.set(JSON.stringify(specification.name), specification.name);
        break;
      }
      case 'structure': {
        if (pending.length + specification.components.length > 65_536) {
          truncated = true;
          pending.length = 0;
          break;
        }
        for (const component of specification.components)
          pending.push(component.specification);
        break;
      }
    }
  }
  return {
    items: [...names.values()],
    truncated: truncated || pending.length > 0,
  };
});
const loading = ref(false);
const error = ref('');
const epoch = ref<null | string>(null);
let generation = 0;
let active: AbortController | null = null;
const page = computed(() =>
  names.value.slice(offset.value, offset.value + 100),
);
const canRead = computed(
  () =>
    item.value &&
    /^[^$]+\$(?:ST|MX|SP|SV|CF|DC|EX|SR|OR|BL)\$.+/.test(item.value),
);
const canReadReport = computed(
  () => item.value && /^[^$]+\$(?:RP|BR)\$[^$]+$/.test(item.value),
);
// A newly selected target must never be shown with the previous target's reply.
watch([domain, directoryClass, item], () => {
  result.value = null;
});
const resultText = computed(() => JSON.stringify(result.value, null, 2));
const previewText = computed(() => resultText.value.slice(0, 128 * 1024));
function available(operation: MmsOperation) {
  return (
    registry.value?.definitions.some(
      (definition) => definition.id === mmsCapabilityId(operation),
    ) ?? false
  );
}
function reset() {
  generation += 1;
  active?.abort();
  active = null;
  registry.value = null;
  domains.value = [];
  domainCursor.value = null;
  moreDomains.value = false;
  domain.value = undefined;
  names.value = [];
  item.value = undefined;
  cursor.value = null;
  more.value = false;
  offset.value = 0;
  result.value = null;
  epoch.value = null;
  loading.value = false;
  domainOpen.value = false;
  directoryOpen.value = false;
  itemOpen.value = false;
  error.value = '';
}
async function operation(work: (signal: AbortSignal) => Promise<void>) {
  domainOpen.value = false;
  directoryOpen.value = false;
  itemOpen.value = false;
  const ownGeneration = generation;
  const controller = new AbortController();
  active?.abort();
  active = controller;
  loading.value = true;
  error.value = '';
  try {
    await work(controller.signal);
  } catch (error_) {
    if (
      ownGeneration === generation &&
      active === controller &&
      !controller.signal.aborted
    ) {
      error.value =
        error_ instanceof Error ? error_.message : $t(`${key}.failed`);
    }
  } finally {
    if (ownGeneration === generation && active === controller) {
      active = null;
      loading.value = false;
    }
  }
}
async function query(
  operation: MmsOperation,
  request: Record<string, unknown>,
  signal: AbortSignal,
) {
  const revision = registry.value?.configurationRevision;
  if (!revision || !available(operation))
    throw new Error($t(`${key}.unavailable`));
  const ownGeneration = generation;
  const observed = await observeMms(
    channelId.value,
    revision,
    operation,
    request,
    signal,
  );
  if (ownGeneration !== generation || signal.aborted)
    throw new Error($t(`${key}.changed`));
  const observedEpoch = `${observed.config_epoch}:${observed.session_epoch}`;
  if (epoch.value && epoch.value !== observedEpoch) {
    domains.value = [];
    domain.value = undefined;
    names.value = [];
    item.value = undefined;
    result.value = null;
    throw new Error($t(`${key}.changed`));
  }
  epoch.value = observedEpoch;
  result.value = observed;
  if (
    observed.result.kind === 'serviceError' ||
    observed.result.kind === 'reject'
  )
    throw new Error($t(`${key}.remoteRejected`));
  return observed;
}
async function start() {
  reset();
  await operation(async (signal) => {
    const ownGeneration = generation;
    const loaded = await getChannelCapabilities(channelId.value, signal);
    if (ownGeneration !== generation || signal.aborted) return;
    registry.value = loaded;
    await domainPage(signal);
  });
}
async function domainPage(signal: AbortSignal) {
  const observed = await query(
    'directory',
    { class: 'domains', continue_after: domainCursor.value },
    signal,
  );
  if (observed.result.kind !== 'directory')
    throw new Error($t(`${key}.failed`));
  if (domains.value.length + observed.result.names.length > 4096)
    throw new Error($t(`${key}.directoryLimit`));
  domains.value.push(...observed.result.names);
  domainCursor.value = observed.result.continue_after;
  moreDomains.value = observed.result.more_follows;
}
async function nextDomains() {
  await operation(domainPage);
}
async function directory(next = false) {
  if (!domain.value) return;
  const request = {
    class: directoryClass.value,
    domain: domain.value,
    continue_after: next ? cursor.value : null,
  };
  names.value = [];
  item.value = undefined;
  offset.value = 0;
  more.value = false;
  result.value = null;
  await operation(async (signal) => {
    const observed = await query('directory', request, signal);
    if (observed.result.kind !== 'directory')
      throw new Error($t(`${key}.failed`));
    names.value = observed.result.names;
    cursor.value = observed.result.continue_after;
    more.value = observed.result.more_follows;
  });
}
async function inspect(operationName: MmsOperation) {
  if (!domain.value || !item.value) return;
  const reference = { domain: domain.value, item: item.value };
  result.value = null;
  await operation(async (signal) => {
    await query(
      operationName,
      operationName === 'passive-read' ? { variables: [reference] } : reference,
      signal,
    );
  });
}
async function capture() {
  const selected = domain.value;
  const revision = registry.value?.configurationRevision;
  if (!selected || !revision) return;
  const current = generation;
  await operation(async (signal) => {
    const source = await captureEngineeringSnapshot(
      {
        channelId: Number(channelId.value),
        configurationRevision: revision,
        domains: [selected],
      },
      signal,
    );
    if (current !== generation || signal.aborted) return;
    emit('captured', source.digest);
    modalApi.close();
  });
}
function download() {
  if (!result.value) return;
  const url = URL.createObjectURL(
    new Blob([resultText.value], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `iec61850-observation-${channelId.value}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
async function inspectNamedType(name: MmsName) {
  await operation(async (signal) => {
    await query('named-type', { ...name }, signal);
  });
}
const [Modal, modalApi] = useVbenModal({
  class: 'w-[960px] max-w-[95vw]',
  destroyOnClose: true,
  footer: false,
  onCancel() {
    modalApi.close();
  },
  async onOpenChange(open) {
    reset();
    if (!open) return;
    const ownGeneration = generation;
    await nextTick();
    if (ownGeneration !== generation) return;
    channelId.value = modalApi.getData<{ channelId: IdType }>().channelId;
    await start();
  },
});
onBeforeUnmount(reset);
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <div class="flex flex-col gap-4">
      <Alert :message="$t(`${key}.instructions`)" type="info" show-icon />
      <Alert v-if="error" :message="error" type="error" show-icon />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Button :loading="loading" @click="start">
          {{ $t(`${key}.refresh`) }}
        </Button>
        <Tag v-if="registry" color="blue">
          {{
            $t(`${key}.revision`, { revision: registry.configurationRevision })
          }}
        </Tag>
      </div>
      <Descriptions
        v-if="epoch"
        :column="{ xs: 1, md: 2 }"
        bordered
        size="small"
      >
        <DescriptionsItem :label="$t(`${key}.association`)">
          <Tag color="geekblue">{{ epoch }}</Tag>
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.metadata`)">
          <Tag color="orange">{{ $t(`${key}.unknown`) }}</Tag>
        </DescriptionsItem>
      </Descriptions>
      <Alert
        v-if="moreDomains"
        :message="$t(`${key}.domainsIncomplete`)"
        type="info"
      />
      <Button v-if="moreDomains" :disabled="loading" @click="nextDomains">
        <template #default>{{ $t(`${key}.continueDomains`) }}</template>
      </Button>
      <Card size="small" :title="$t(`${key}.browseTitle`)">
        <Form layout="vertical">
          <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormItem :label="$t(`${key}.domain`)" html-for="iec-online-domain">
              <Select
                id="iec-online-domain"
                :aria-label="$t(`${key}.domain`)"
                v-model:value="domain"
                :disabled="loading"
                :open="domainOpen"
                :options="domains.map((name) => ({ value: name, label: name }))"
                @change="directory(false)"
                @dropdown-visible-change="domainOpen = $event"
              />
            </FormItem>
            <FormItem
              :label="$t(`${key}.directory`)"
              html-for="iec-online-directory"
            >
              <Select
                id="iec-online-directory"
                :aria-label="$t(`${key}.directory`)"
                v-model:value="directoryClass"
                :disabled="loading || !domain"
                :open="directoryOpen"
                :options="[
                  { value: 'variables', label: $t(`${key}.variables`) },
                  { value: 'dataSets', label: $t(`${key}.dataSets`) },
                ]"
                @change="directory(false)"
                @dropdown-visible-change="directoryOpen = $event"
              />
            </FormItem>
          </div>
          <FormItem :label="$t(`${key}.item`)" html-for="iec-online-item">
            <Select
              id="iec-online-item"
              :aria-label="$t(`${key}.item`)"
              v-model:value="item"
              :disabled="loading || !domain"
              :open="itemOpen"
              show-search
              :options="page.map((name) => ({ value: name, label: name }))"
              @dropdown-visible-change="itemOpen = $event"
            />
          </FormItem>
        </Form>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="offset > 0"
            :disabled="loading"
            @click="
              offset -= 100;
              item = undefined;
            "
          >
            {{ $t(`${key}.previous`) }}
          </Button>
          <Button
            v-if="offset + 100 < names.length"
            :disabled="loading"
            @click="
              offset += 100;
              item = undefined;
            "
          >
            {{ $t(`${key}.next`) }}
          </Button>
          <Button v-if="more" :disabled="loading" @click="directory(true)">
            {{ $t(`${key}.continue`) }}
          </Button>
          <Button
            v-if="directoryClass === 'variables'"
            :disabled="loading || !item || !available('variable-type')"
            @click="inspect('variable-type')"
          >
            {{ $t(`${key}.type`) }}
          </Button>
          <Button
            v-else
            :disabled="loading || !item || !available('data-set-members')"
            @click="inspect('data-set-members')"
          >
            {{ $t(`${key}.members`) }}
          </Button>
          <Button
            v-if="directoryClass === 'variables'"
            :disabled="loading || !canRead || !available('passive-read')"
            @click="inspect('passive-read')"
          >
            {{ $t(`${key}.read`) }}
          </Button>
          <Button
            v-if="directoryClass === 'variables' && canReadReport"
            :disabled="loading || !available('report-control-read')"
            @click="inspect('report-control-read')"
          >
            {{ $t(`${key}.reportRead`) }}
          </Button>
        </div>
        <Alert
          v-if="canReadReport"
          class="mt-4"
          type="info"
          show-icon
          :message="$t(`${key}.reportObservationHint`)"
        />
      </Card>
      <Button
        type="primary"
        :loading="loading"
        :disabled="
          loading ||
          !domain ||
          !available('directory') ||
          !available('variable-type')
        "
        @click="capture"
      >
        {{ $t(`${key}.capture`) }}
      </Button>
      <Card
        v-if="result"
        role="region"
        :aria-label="$t(`${key}.result`)"
        :title="$t(`${key}.result`)"
        class="min-w-0"
      >
        <template #extra>
          <Button size="small" @click="download">
            {{ $t(`${key}.download`) }}
          </Button>
        </template>
        <div class="mb-4 flex flex-wrap gap-2">
          <Tag color="purple">{{ result.result.kind }}</Tag>
          <Tag v-if="result.result.kind === 'dataSetMembers'" color="blue">
            {{
              $t(`${key}.memberCount`, { count: result.result.members.length })
            }}
          </Tag>
          <Tag v-if="result.result.kind === 'directory'" color="cyan">
            {{ $t(`${key}.nameCount`, { count: result.result.names.length }) }}
          </Tag>
        </div>
        <List
          v-if="namedReferences.items.length > 0"
          :header="$t(`${key}.namedTypes`)"
          :data-source="namedReferences.items"
          class="mb-4"
          size="small"
          bordered
        >
          <template #renderItem="{ item: name }">
            <ListItem>
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <Tag color="cyan">{{ name.kind }}</Tag>
                <code class="break-all text-xs">{{
                  name.kind === 'domain'
                    ? `${name.domain}/${name.item}`
                    : name.item
                }}</code>
                <Button
                  size="small"
                  :disabled="loading || !available('named-type')"
                  @click="inspectNamedType(name)"
                >
                  {{ $t(`${key}.readNamedType`) }}
                </Button>
              </div>
            </ListItem>
          </template>
        </List>
        <Alert
          v-if="namedReferences.truncated"
          type="warning"
          show-icon
          class="mb-4"
          :message="$t(`${key}.namedReferencesTruncated`)"
        />
        <Alert
          v-if="resultText.length > previewText.length"
          :message="$t(`${key}.truncated`)"
          type="info"
        />
        <Collapse :default-active-key="['raw']" :bordered="false">
          <CollapsePanel key="raw" :header="$t(`${key}.rawResult`)">
            <Input.TextArea
              :value="previewText"
              :aria-label="$t(`${key}.rawResult`)"
              readonly
              :auto-size="{ minRows: 10, maxRows: 16 }"
              class="font-mono text-xs"
            />
          </CollapsePanel>
        </Collapse>
      </Card>
      <Empty v-else-if="!loading" :description="$t(`${key}.empty`)" />
    </div>
  </Modal>
</template>
