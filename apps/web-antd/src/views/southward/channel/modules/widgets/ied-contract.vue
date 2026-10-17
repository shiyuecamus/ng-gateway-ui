<script setup lang="ts">
import type {
  DocumentRole,
  EngineeringStatus,
  IedContract,
  StandardPart,
} from '#/api/core/engineering';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  CollapsePanel,
  Empty,
  FormItem,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  TypographyText,
  Upload,
} from 'ant-design-vue';

import {
  getEngineeringAsset,
  getEngineeringStatus,
  uploadSupportingDocument,
} from '#/api/core/engineering';
import EvidenceDigest from '#/shared/components/evidence-digest.vue';

import { describeFailure } from './engineering-evidence';

const props = defineProps<{
  disabled: boolean;
  domains: string[];
  initial: IedContract;
}>();
const emit = defineEmits<{ changed: [] }>();
const key = 'page.southward.channel.engineering.contract';
const partKeys: StandardPart[] = [
  'scl6',
  'semantics71',
  'acsi72',
  'dataClasses73',
  'logicalNodes74',
  'mapping81',
];
const roleKeys: DocumentRole[] = [
  'pics',
  'pixit',
  'mics',
  'tics',
  'vendorDocumentation',
  'standardReference',
];
const identity = reactive({ manufacturer: '', model: '', firmware: '' });
const documents = ref<IedContract['documents']>([]);
type SubstitutionDraft = Omit<
  IedContract['substitution'][number],
  'support'
> & { support: IedContract['substitution'][number]['support'] | undefined };
const substitution = ref<SubstitutionDraft[]>([]);
const picsOptions = computed(() =>
  documents.value
    .filter((document) => document.roles.includes('pics'))
    .map((document) => ({ value: document.digest, label: document.label })),
);
const scopeCount = computed(() =>
  substitution.value.reduce((count, claim) => count + claim.objects.length, 0),
);
const staleSubstitution = computed(() =>
  substitution.value.some(
    (claim) =>
      claim.source &&
      !picsOptions.value.some((source) => source.value === claim.source),
  ),
);
function addSubstitution() {
  if (props.disabled || busy.value || substitution.value.length >= 32) return;
  substitution.value.push({
    support: undefined,
    source: '',
    locator: '',
    objects: [],
  });
}
function addScope(index: number) {
  const declaration = substitution.value[index];
  if (!declaration || props.disabled || busy.value || scopeCount.value >= 256)
    return;
  declaration.objects.push({ domain: '', logicalNode: '', path: [] });
}

const parts = ref<
  {
    amendment: null | number;
    declared: boolean;
    major: null | number;
    part: StandardPart;
    publication: string;
    sources: string[];
  }[]
>([]);
const status = ref<EngineeringStatus | null>(null);
const error = ref('');
const busy = ref(false);
const existing = ref('');
const sourceOptions = computed(() =>
  documents.value.map((item) => ({
    label: `${item.label} · ${item.digest.slice(0, 12)}`,
    value: item.digest,
  })),
);
const roleOptions = computed(() =>
  roleKeys.map((value) => ({ value, label: $t(`${key}.roles.${value}`) })),
);
let alive = true;
let generation = 0;
let request: AbortController | null = null;
const readiness = new AbortController();

watch(
  () => props.initial,
  (initial) => {
    generation += 1;
    request?.abort();
    request = null;
    busy.value = false;
    error.value = '';
    existing.value = '';
    Object.assign(identity, {
      manufacturer: initial.manufacturer ?? '',
      model: initial.model ?? '',
      firmware: initial.firmware ?? '',
    });
    documents.value = initial.documents.map((item) => ({
      ...item,
      roles: [...item.roles],
    }));
    substitution.value = initial.substitution.map((item) => ({
      ...item,
      objects: item.objects.map((object) => ({
        ...object,
        path: object.path.map((part) => ({
          ...part,
          indices: [...part.indices],
        })),
      })),
    }));
    parts.value = partKeys.map((part) => {
      const declaration = initial.parts.find((item) => item.part === part);
      return {
        part,
        declared: !!declaration,
        major: declaration?.edition.major ?? null,
        amendment: declaration?.edition.amendment ?? null,
        publication: declaration?.publication ?? '',
        sources: [...(declaration?.sources ?? [])],
      };
    });
  },
  { immediate: true },
);
watch([identity, documents, parts, substitution], () => emit('changed'), {
  deep: true,
});
onMounted(async () => {
  try {
    const value = await getEngineeringStatus(readiness.signal);
    if (alive) status.value = value;
  } catch (error_) {
    if (alive && !readiness.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  }
});
onBeforeUnmount(() => {
  alive = false;
  generation += 1;
  request?.abort();
  readiness.abort();
});
function popupContainer(trigger: HTMLElement) {
  return trigger.parentElement ?? trigger;
}
function remove(digest: string) {
  if (props.disabled || busy.value) return;
  documents.value = documents.value.filter((item) => item.digest !== digest);
  for (const declaration of parts.value)
    declaration.sources = declaration.sources.filter(
      (source) => source !== digest,
    );
}
async function attach(file: File | null) {
  if (props.disabled || busy.value || documents.value.length >= 32) return;
  if (
    file &&
    (!status.value?.documentImportAvailable ||
      file.size === 0 ||
      file.size > status.value.maxInputBytes)
  ) {
    error.value = $t(`${key}.fileBounds`);
    return;
  }
  const digest = existing.value.trim();
  if (!file && !/^[0-9a-f]{64}$/.test(digest)) {
    error.value = $t(`${key}.digestRequired`);
    return;
  }
  const controller = new AbortController();
  request = controller;
  const version = generation;
  busy.value = true;
  error.value = '';
  try {
    const info = file
      ? await uploadSupportingDocument(file, controller.signal)
      : await getEngineeringAsset(digest, controller.signal);
    if (
      !alive ||
      version !== generation ||
      request !== controller ||
      controller.signal.aborted
    )
      return;
    if (info.source.kind !== 'document')
      throw new Error($t(`${key}.sourceRole`));
    if (documents.value.some((item) => item.digest === info.digest))
      throw new Error($t(`${key}.duplicate`));
    documents.value.push({
      digest: info.digest,
      roles: [],
      label: file?.name ?? '',
      locator: null,
    });
    existing.value = '';
  } catch (error_) {
    if (alive && version === generation && !controller.signal.aborted)
      error.value = describeFailure(error_, $t(`${key}.failed`));
  } finally {
    if (alive && version === generation && request === controller) {
      busy.value = false;
      request = null;
    }
  }
}
async function selectFile(file: File) {
  await attach(file);
  return false;
}
function proposal(domains: string[]): IedContract {
  if (busy.value) throw new Error($t(`${key}.waitForDocument`));
  const sources = documents.value.map((item) => ({
    ...item,
    roles: [...item.roles],
    label: item.label.trim(),
    locator: item.locator?.trim() || null,
  }));
  if (sources.some((item) => !item.label || item.roles.length === 0))
    throw new Error($t(`${key}.documentRequired`));
  const declarations: IedContract['parts'] = [];
  for (const item of parts.value) {
    if (!item.declared) continue;
    if (
      item.major === null ||
      !Number.isInteger(item.major) ||
      item.major < 1 ||
      item.major > 99 ||
      item.amendment === null ||
      !Number.isInteger(item.amendment) ||
      item.amendment < 0 ||
      item.amendment > 99 ||
      !item.publication.trim() ||
      item.sources.length === 0
    )
      throw new Error(
        $t(`${key}.partRequired`, { part: $t(`${key}.parts.${item.part}`) }),
      );
    declarations.push({
      part: item.part,
      edition: { major: item.major, amendment: item.amendment },
      publication: item.publication.trim(),
      sources: [...item.sources],
    });
  }
  if (
    scopeCount.value > 256 ||
    substitution.value.some(
      (item) =>
        !item.support ||
        !item.source ||
        !item.locator.trim() ||
        item.objects.length === 0 ||
        !documents.value.some(
          (document) =>
            document.digest === item.source && document.roles.includes('pics'),
        ) ||
        item.objects.some(
          (object) =>
            !domains.includes(object.domain) ||
            !/^\w{1,255}$/.test(object.logicalNode) ||
            object.path.length === 0 ||
            object.path.length > 64 ||
            object.path.some(
              (part) =>
                !/^\w{1,255}$/.test(part.name) ||
                part.indices.length > 64 ||
                part.indices.some(
                  (index) =>
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index > 4_294_967_295,
                ),
            ),
        ),
    )
  )
    throw new Error($t(`${key}.substitutionRequired`));
  return {
    manufacturer: identity.manufacturer.trim() || null,
    model: identity.model.trim() || null,
    firmware: identity.firmware.trim() || null,
    domains: [...domains],
    documents: sources,
    parts: declarations,
    substitution: substitution.value.map((item) => ({
      ...item,
      support: item.support as IedContract['substitution'][number]['support'],
      locator: item.locator.trim(),
      objects: item.objects.map((object) => ({
        ...object,
        path: object.path.map((part) => ({
          ...part,
          indices: [...part.indices],
        })),
      })),
    })),
  };
}
defineExpose({ proposal });
</script>

<template>
  <div class="space-y-4" role="region" :aria-label="$t(`${key}.title`)">
    <Alert type="info" show-icon :message="$t(`${key}.declaredHint`)" />
    <Alert v-if="error" type="error" show-icon :message="error" />
    <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
      <FormItem
        v-for="field in ['manufacturer', 'model', 'firmware'] as const"
        :key="field"
        :label="$t(`${key}.${field}`)"
        :html-for="`ied-${field}`"
      >
        <Input
          v-model:value="identity[field]"
          :id="`ied-${field}`"
          :aria-label="$t(`${key}.${field}`)"
          :maxlength="256"
          :placeholder="$t(`${key}.unknown`)"
          :disabled="disabled"
        />
      </FormItem>
    </div>
    <TypographyText strong>{{ $t(`${key}.domains`) }}</TypographyText>
    <div class="flex flex-wrap gap-2">
      <Tag v-for="domain in domains" :key="domain">
        <span v-text="domain"></span>
      </Tag>
      <span v-if="domains.length === 0" v-text="$t(`${key}.noDomains`)"></span>
    </div>
    <Card :title="$t(`${key}.originals`)" size="small">
      <Space direction="vertical" :size="16" class="w-full">
        <Alert
          v-if="status && !status.documentImportAvailable"
          type="warning"
          :message="$t(`${key}.storeUnavailable`)"
          show-icon
        />
        <div class="flex flex-wrap gap-2">
          <Upload
            :file-list="[]"
            :max-count="1"
            :show-upload-list="false"
            :before-upload="selectFile"
            :disabled="
              disabled ||
              busy ||
              !status?.documentImportAvailable ||
              documents.length >= 32
            "
          >
            <Button
              :loading="busy"
              :disabled="
                disabled ||
                busy ||
                !status?.documentImportAvailable ||
                documents.length >= 32
              "
            >
              {{ $t(`${key}.upload`) }}
            </Button>
          </Upload>
          <Input
            v-model:value="existing"
            :aria-label="$t(`${key}.existingDigest`)"
            :placeholder="$t(`${key}.existingDigest`)"
            :maxlength="64"
            class="max-w-sm"
            :disabled="disabled || busy || documents.length >= 32"
          />
          <Button
            :disabled="disabled || busy || documents.length >= 32"
            @click="attach(null)"
          >
            {{ $t(`${key}.attach`) }}
          </Button>
        </div>
        <Card v-for="document in documents" :key="document.digest" size="small">
          <EvidenceDigest :value="document.digest" />
          <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormItem
              :label="$t(`${key}.label`)"
              :html-for="`ied-label-${document.digest}`"
            >
              <Input
                v-model:value="document.label"
                :id="`ied-label-${document.digest}`"
                :aria-label="$t(`${key}.label`)"
                :maxlength="256"
                :disabled="disabled || busy"
              />
            </FormItem>
            <FormItem
              :label="$t(`${key}.documentRoles`)"
              :html-for="`ied-roles-${document.digest}`"
            >
              <Select
                v-model:value="document.roles"
                :id="`ied-roles-${document.digest}`"
                :aria-label="$t(`${key}.documentRoles`)"
                mode="multiple"
                :options="roleOptions"
                :get-popup-container="popupContainer"
                :disabled="disabled || busy"
                @keydown.esc.stop
              />
            </FormItem>
          </div>
          <FormItem
            :label="$t(`${key}.locator`)"
            :html-for="`ied-locator-${document.digest}`"
          >
            <Input
              :value="document.locator ?? ''"
              @update:value="document.locator = $event || null"
              :id="`ied-locator-${document.digest}`"
              :aria-label="$t(`${key}.locator`)"
              :maxlength="256"
              :disabled="disabled || busy"
            />
          </FormItem>
          <Button
            danger
            :disabled="disabled || busy"
            @click="remove(document.digest)"
          >
            {{ $t(`${key}.remove`) }}
          </Button>
        </Card>
      </Space>
    </Card>
    <Collapse>
      <CollapsePanel
        v-for="declaration in parts"
        :key="declaration.part"
        :header="$t(`${key}.parts.${declaration.part}`)"
        role="group"
        :aria-label="$t(`${key}.parts.${declaration.part}`)"
      >
        <div class="flex flex-wrap items-center gap-3">
          <TypographyText strong>
            {{ $t(`${key}.parts.${declaration.part}`) }}
          </TypographyText>
          <Checkbox v-model:checked="declaration.declared" :disabled="disabled">
            {{ $t(`${key}.declared`) }}
          </Checkbox>
          <Tag v-if="!declaration.declared">{{ $t(`${key}.unknown`) }}</Tag>
        </div>
        <div
          v-if="declaration.declared"
          class="grid grid-cols-1 gap-x-4 sm:grid-cols-2"
        >
          <FormItem
            :label="$t(`${key}.major`)"
            :html-for="`ied-major-${declaration.part}`"
          >
            <InputNumber
              :value="declaration.major ?? undefined"
              @change="
                (value) =>
                  (declaration.major = typeof value === 'number' ? value : null)
              "
              :id="`ied-major-${declaration.part}`"
              :aria-label="$t(`${key}.major`)"
              :min="1"
              :max="99"
              :precision="0"
              class="!w-full"
              :disabled="disabled"
            />
          </FormItem>
          <FormItem
            :label="$t(`${key}.amendment`)"
            :html-for="`ied-amendment-${declaration.part}`"
          >
            <InputNumber
              :value="declaration.amendment ?? undefined"
              @change="
                (value) =>
                  (declaration.amendment =
                    typeof value === 'number' ? value : null)
              "
              :id="`ied-amendment-${declaration.part}`"
              :aria-label="$t(`${key}.amendment`)"
              :min="0"
              :max="99"
              :precision="0"
              class="!w-full"
              :disabled="disabled"
            />
          </FormItem>
          <FormItem
            :label="$t(`${key}.publication`)"
            :html-for="`ied-publication-${declaration.part}`"
          >
            <Input
              v-model:value="declaration.publication"
              :id="`ied-publication-${declaration.part}`"
              :aria-label="$t(`${key}.publication`)"
              :maxlength="256"
              :disabled="disabled"
            />
          </FormItem>
          <FormItem
            :label="$t(`${key}.sources`)"
            :html-for="`ied-sources-${declaration.part}`"
          >
            <Select
              v-model:value="declaration.sources"
              :id="`ied-sources-${declaration.part}`"
              :aria-label="$t(`${key}.sources`)"
              mode="multiple"
              :options="sourceOptions"
              :get-popup-container="popupContainer"
              :disabled="disabled"
              @keydown.esc.stop
            />
          </FormItem>
        </div>
      </CollapsePanel>
    </Collapse>
    <Card :title="$t(`${key}.substitutionTitle`)" size="small">
      <Alert
        type="info"
        show-icon
        class="mb-4"
        :message="$t(`${key}.substitutionHint`)"
      />
      <Alert
        v-if="staleSubstitution"
        type="warning"
        show-icon
        class="mb-4"
        :message="$t(`${key}.substitutionSourceInvalid`)"
      />
      <Empty
        v-if="substitution.length === 0"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="$t(`${key}.substitutionEmpty`)"
      />
      <Card
        v-for="(item, index) in substitution"
        :key="index"
        :title="$t(`${key}.substitutionStatement`, { number: index + 1 })"
        size="small"
        class="mb-4"
      >
        <template #extra>
          <Button
            danger
            :disabled="disabled || busy"
            @click="substitution.splice(index, 1)"
          >
            {{ $t(`${key}.remove`) }}
          </Button>
        </template>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <FormItem
            :label="$t(`${key}.substitutionSupport`)"
            :html-for="`pics-support-${index}`"
          >
            <Select
              v-model:value="item.support"
              :id="`pics-support-${index}`"
              :aria-label="$t(`${key}.substitutionSupport`)"
              :disabled="disabled || busy"
              :get-popup-container="popupContainer"
              @keydown.esc.stop
              :options="[
                {
                  value: 'supported',
                  label: $t(`${key}.substitutionSupported`),
                },
                {
                  value: 'unsupported',
                  label: $t(`${key}.substitutionUnsupported`),
                },
              ]"
            />
          </FormItem>
          <FormItem
            :label="$t(`${key}.substitutionSource`)"
            :html-for="`pics-source-${index}`"
          >
            <Select
              v-model:value="item.source"
              :id="`pics-source-${index}`"
              :aria-label="$t(`${key}.substitutionSource`)"
              :options="picsOptions"
              :get-popup-container="popupContainer"
              @keydown.esc.stop
              :disabled="disabled || busy"
            />
          </FormItem>
          <FormItem :label="$t(`${key}.locator`)" class="sm:col-span-2">
            <Input
              v-model:value="item.locator"
              :aria-label="$t(`${key}.locator`)"
              :maxlength="256"
              :disabled="disabled || busy"
            />
          </FormItem>
        </div>
        <Card
          v-for="(object, objectIndex) in item.objects"
          :key="objectIndex"
          :title="$t(`${key}.substitutionScope`, { number: objectIndex + 1 })"
          size="small"
          class="mb-3"
        >
          <div class="grid gap-x-4 sm:grid-cols-2">
            <FormItem
              :label="$t(`${key}.substitutionDomain`)"
              :html-for="`pics-domain-${index}-${objectIndex}`"
            >
              <Select
                v-model:value="object.domain"
                :id="`pics-domain-${index}-${objectIndex}`"
                :options="
                  domains.map((domain) => ({ value: domain, label: domain }))
                "
                :disabled="disabled || busy"
                :get-popup-container="popupContainer"
                @keydown.esc.stop
                :aria-label="$t(`${key}.substitutionDomain`)"
              />
            </FormItem>
            <FormItem :label="$t(`${key}.substitutionLn`)">
              <Input
                v-model:value="object.logicalNode"
                :disabled="disabled || busy"
                :aria-label="$t(`${key}.substitutionLn`)"
                :maxlength="255"
              />
            </FormItem>
          </div>
          <FormItem :label="$t(`${key}.substitutionPath`)">
            <Space direction="vertical" :size="8" class="w-full">
              <Card
                v-for="(component, pathIndex) in object.path"
                :key="pathIndex"
                size="small"
              >
                <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <FormItem
                    :label="$t(`${key}.substitutionObjectName`)"
                    class="!mb-0"
                  >
                    <Input
                      v-model:value="component.name"
                      :disabled="disabled || busy"
                      :aria-label="$t(`${key}.substitutionObjectName`)"
                      :maxlength="255"
                    />
                  </FormItem>
                  <Button
                    danger
                    class="self-end"
                    :disabled="disabled || busy"
                    @click="object.path.splice(pathIndex, 1)"
                  >
                    {{ $t(`${key}.remove`) }}
                  </Button>
                </div>
                <FormItem
                  :label="$t(`${key}.substitutionIndex`)"
                  class="!mb-0 mt-3"
                >
                  <Space wrap :size="8">
                    <InputNumber
                      v-for="(_, axisIndex) in component.indices"
                      :key="axisIndex"
                      v-model:value="component.indices[axisIndex]"
                      :min="0"
                      :max="4294967295"
                      :precision="0"
                      :disabled="disabled || busy"
                      :aria-label="
                        $t(`${key}.substitutionAxis`, { number: axisIndex + 1 })
                      "
                    />
                    <Button
                      :disabled="
                        disabled || busy || component.indices.length >= 64
                      "
                      @click="component.indices.push(0)"
                    >
                      {{ $t(`${key}.substitutionAddIndex`) }}
                    </Button>
                    <Button
                      v-if="component.indices.length > 0"
                      :disabled="disabled || busy"
                      @click="component.indices.pop()"
                    >
                      {{ $t(`${key}.substitutionRemoveIndex`) }}
                    </Button>
                  </Space>
                </FormItem>
              </Card>
              <Button
                :disabled="disabled || busy || object.path.length >= 64"
                @click="object.path.push({ name: '', indices: [] })"
              >
                {{ $t(`${key}.substitutionAddComponent`) }}
              </Button>
            </Space>
          </FormItem>
          <Button
            danger
            :disabled="disabled || busy"
            @click="item.objects.splice(objectIndex, 1)"
          >
            {{ $t(`${key}.substitutionRemoveScope`) }}
          </Button>
        </Card>
        <Button
          :disabled="disabled || busy || scopeCount >= 256"
          @click="addScope(index)"
        >
          {{ $t(`${key}.substitutionAddScope`) }}
        </Button>
      </Card>
      <Button
        :disabled="disabled || busy || substitution.length >= 32"
        @click="addSubstitution"
      >
        {{ $t(`${key}.substitutionAdd`) }}
      </Button>
    </Card>
  </div>
</template>
