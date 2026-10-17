<script lang="ts" setup>
import type { IdType } from '@vben/types';

import type {
  InterrogationObservation,
  InterrogationRequest,
} from '#/api/core/iec104-interrogation';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  FormItem,
  RadioGroup,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  getInterrogationSources,
  interrogate,
} from '#/api/core/iec104-interrogation';

const key = 'page.southward.channel.interrogation';
const channelId = ref<IdType>(0);
const revision = ref('');
const stations = ref<{ ca: number; names: string[] }[]>([]);
const available = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const ca = ref<number>();
const kind = ref<InterrogationRequest['kind']>('general');
const qualifier = ref(20);
const observation = ref<InterrogationObservation | null>(null);
let generation = 0;
let active: AbortController | null = null;

const stationOptions = computed(() =>
  stations.value.map((station) => ({
    value: station.ca,
    label: `CA ${station.ca} · ${station.names[0] ?? ''}${
      station.names.length > 1
        ? $t(`${key}.otherDevices`, { count: station.names.length - 1 })
        : ''
    }`,
  })),
);
const qualifierOptions = computed(() => [
  {
    value: kind.value === 'general' ? 20 : 5,
    label: $t(`${key}.all`),
  },
  ...Array.from({ length: kind.value === 'general' ? 16 : 4 }, (_, index) => ({
    value: kind.value === 'general' ? index + 21 : index + 1,
    label: $t(`${key}.group`, { number: index + 1 }),
  })),
]);
watch([ca, qualifier], () => {
  observation.value = null;
  error.value = '';
});
watch(kind, (value) => {
  qualifier.value = value === 'general' ? 20 : 5;
  observation.value = null;
});

function reset() {
  generation += 1;
  active?.abort();
  active = null;
  loading.value = false;
  busy.value = false;
  available.value = false;
  stations.value = [];
  ca.value = undefined;
  revision.value = '';
  observation.value = null;
  error.value = '';
}
onBeforeUnmount(reset);
const [Modal, modalApi] = useVbenModal({
  class: 'w-[760px] max-w-[95vw]',
  destroyOnClose: true,
  footer: false,
  async onOpenChange(open) {
    if (open) await loadSources();
    else reset();
  },
});

async function loadSources() {
  reset();
  const current = generation;
  loading.value = true;
  await nextTick();
  if (current !== generation) return;
  channelId.value = modalApi.getData<{ channelId: IdType }>().channelId;
  const controller = new AbortController();
  active = controller;
  loading.value = true;
  try {
    const context = await getInterrogationSources(
      channelId.value,
      controller.signal,
    );
    if (current !== generation || controller.signal.aborted) return;
    available.value = context.available;
    revision.value = context.revision;
    stations.value = context.sources;
    ca.value = context.sources[0]?.ca;
  } catch {
    if (current === generation && !controller.signal.aborted)
      error.value = $t(`${key}.loadFailed`);
  } finally {
    if (current === generation) loading.value = false;
  }
}

async function execute() {
  if (
    !available.value ||
    ca.value === undefined ||
    busy.value ||
    !revision.value
  )
    return;
  const current = generation;
  active?.abort();
  const controller = new AbortController();
  active = controller;
  error.value = '';
  observation.value = null;
  busy.value = true;
  try {
    const result = await interrogate(
      channelId.value,
      revision.value,
      { kind: kind.value, ca: ca.value, qualifier: qualifier.value },
      controller.signal,
    );
    if (current === generation && !controller.signal.aborted)
      observation.value = result;
  } catch {
    if (current === generation && !controller.signal.aborted)
      error.value = $t(`${key}.failed`);
  } finally {
    if (current === generation) busy.value = false;
  }
}
</script>

<template>
  <Modal :title="$t(`${key}.title`)">
    <Spin :spinning="loading">
      <div class="space-y-4">
        <p class="text-muted-foreground">{{ $t(`${key}.intro`) }}</p>
        <Alert v-if="error" type="error" show-icon :message="error" />
        <Alert
          v-if="!loading && !available && !error"
          type="info"
          show-icon
          :message="$t(`${key}.unavailable`)"
        />
        <FormItem
          :label="$t(`${key}.station`)"
          html-for="iec104-interrogation-ca"
        >
          <Select
            id="iec104-interrogation-ca"
            v-model:value="ca"
            :options="stationOptions"
            :disabled="busy || !available"
            class="w-full"
            :placeholder="$t(`${key}.noSources`)"
          />
        </FormItem>
        <FormItem :label="$t(`${key}.kind`)">
          <RadioGroup
            v-model:value="kind"
            role="radiogroup"
            :aria-label="$t(`${key}.kind`)"
            :disabled="busy || !available"
            :options="[
              { label: $t(`${key}.general`), value: 'general' },
              { label: $t(`${key}.counter`), value: 'counter' },
            ]"
          />
        </FormItem>
        <FormItem
          :label="$t(`${key}.range`)"
          html-for="iec104-interrogation-range"
        >
          <Select
            id="iec104-interrogation-range"
            v-model:value="qualifier"
            :options="qualifierOptions"
            :disabled="busy || !available"
            class="w-full"
          />
        </FormItem>
        <Button
          type="primary"
          :loading="busy"
          :disabled="!available || ca === undefined"
          @click="execute"
        >
          {{ $t(`${key}.execute`) }}
        </Button>
        <Button :disabled="busy || loading" @click="loadSources">
          {{ $t(`${key}.refresh`) }}
        </Button>
        <section
          v-if="observation"
          class="space-y-3 rounded-md border p-4"
          :aria-label="$t(`${key}.result`)"
        >
          <Tag :color="observation.result === 'completed' ? 'green' : 'red'">
            {{ $t(`${key}.${observation.result}`) }}
          </Tag>
          <p class="text-muted-foreground">{{ $t(`${key}.observations`) }}</p>
          <Alert
            v-if="observation.association_dropped_asdus !== '0'"
            type="warning"
            show-icon
            :message="
              $t(`${key}.loss`, {
                count: observation.association_dropped_asdus,
              })
            "
          />
          <details>
            <summary class="cursor-pointer">{{ $t(`${key}.receipt`) }}</summary>
            <pre
              class="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs"
              v-text="JSON.stringify(observation, null, 2)"
            ></pre>
          </details>
        </section>
      </div>
    </Spin>
  </Modal>
</template>
