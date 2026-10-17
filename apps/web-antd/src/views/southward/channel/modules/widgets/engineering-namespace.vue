<script setup lang="ts">
import type {
  NamespaceObject,
  NamespaceObservedState,
  NamespaceScope,
  NamespaceState,
} from '#/api/core/engineering';

import { computed } from 'vue';

import { JsonViewer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Card,
  Collapse,
  CollapsePanel,
  Descriptions,
  DescriptionsItem,
  Space,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import EvidenceDigest from '#/shared/components/evidence-digest.vue';

const props = defineProps<{
  declarations?: NamespaceScope['declarations'];
  evidence: Pick<
    NamespaceObject,
    'cdc' | 'data' | 'logicalDevice' | 'logicalNode' | 'observations'
  >;
}>();
const key = 'page.southward.channel.engineering.goose';
const levels = ['logicalDevice', 'logicalNode', 'data', 'cdc'] as const;
/** Keep the four evidence dimensions explicit while presenting summary before originals. */
const rows = computed(() =>
  levels.map((level) => ({
    level,
    declared: props.evidence[level],
    actual: props.evidence.observations[level],
    declaration: props.declarations?.[level],
  })),
);

/** Prefer the human-readable namespace; source identity belongs in the expandable originals. */
function declarationTitle(value: NamespaceState): string {
  if (value.status === 'definition') return value.name;
  if (value.value) return value.value.lexical;
  if (value.status === 'unknown')
    return $t(`${key}.namespaceReasons.${value.reason}`);
  return $t(`${key}.unknown`);
}

function observedTypeText(
  evidence: NamespaceObservedState['typeEvidence'],
): string {
  if (evidence.status !== 'present') return '';
  const definition = evidence.definition;
  const type =
    definition.kind === 'value'
      ? [
          definition.dataType.name,
          definition.dataType.widthBits === null
            ? ''
            : `${definition.dataType.widthBits} bit`,
          definition.dataType.wireLength === null
            ? ''
            : $t(
                `${key}.${definition.dataType.wireLength < 0 ? 'maximumLength' : 'fixedLength'}`,
                { count: Math.abs(definition.dataType.wireLength) },
              ),
        ]
          .filter(Boolean)
          .join(' / ')
      : $t(`page.southward.channel.engineering.kinds.${definition.kind}`);
  return (
    type +
    evidence.dimensions
      .map((axis) => `[${axis.count ?? $t(`${key}.unknown`)}]`)
      .join('')
  );
}

/** Unknown is a semantic state, not a failed operation; reserve red for conflicts. */
function stateColor(status: string) {
  if (status === 'conflict') return 'error';
  if (status === 'unknown') return 'warning';
  return 'success';
}
</script>

<template>
  <div class="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
    <Card
      v-for="row in rows"
      :key="row.level"
      :title="$t(`${key}.namespaceLevels.${row.level}`)"
      size="small"
      class="namespace-card min-w-0"
      :body-style="{ padding: '16px' }"
      :data-testid="`namespace-level-${row.level}`"
    >
      <template #extra>
        <Tag
          :color="stateColor(row.actual.effectiveNamespace.status)"
          class="!m-0"
        >
          {{
            $t(
              `${key}.namespaceSummaryStates.${row.actual.effectiveNamespace.status}`,
            )
          }}
        </Tag>
      </template>
      <Space direction="vertical" :size="16" class="w-full min-w-0">
        <Space direction="vertical" :size="4" class="w-full">
          <TypographyText class="break-words text-base font-medium">
            {{ declarationTitle(row.declared) }}
          </TypographyText>
          <TypographyText type="secondary" class="text-xs">
            {{ $t(`${key}.namespaceEffective`) }}
          </TypographyText>
          <Space
            v-if="row.actual.effectiveNamespace.status === 'known'"
            :size="8"
            wrap
          >
            <Tag color="blue" class="!m-0">
              {{
                $t(
                  `${key}.namespaceEffectiveStates.${row.actual.effectiveNamespace.origin.kind}`,
                )
              }}
            </Tag>
            <TypographyText type="secondary">
              {{
                $t(
                  `${key}.namespaceLevels.${row.actual.effectiveNamespace.origin.kind === 'definition' ? row.actual.effectiveNamespace.origin.observedLevel : row.actual.effectiveNamespace.origin.level}`,
                )
              }}
            </TypographyText>
          </Space>
          <TypographyText
            v-else-if="row.actual.effectiveNamespace.status === 'conflict'"
            type="danger"
          >
            {{
              $t(
                `${key}.namespaceBindingReasons.${row.actual.effectiveNamespace.reason}`,
              )
            }}
          </TypographyText>
          <TypographyText v-else type="secondary">
            {{
              $t(
                row.actual.effectiveNamespace.reason.kind === 'binding'
                  ? `${key}.namespaceBindingReasons.${row.actual.effectiveNamespace.reason.reason}`
                  : `${key}.namespaceEffectiveReasons.${row.actual.effectiveNamespace.reason.kind}`,
              )
            }}
          </TypographyText>
        </Space>

        <Descriptions
          layout="vertical"
          :column="{ xs: 1, sm: 2 }"
          size="small"
          class="namespace-facts"
        >
          <DescriptionsItem :label="$t(`${key}.namespaceType`)">
            <Space direction="vertical" :size="4">
              <TypographyText>
                {{
                  $t(
                    `${key}.namespaceTypeStates.${row.actual.typeEvidence.status}`,
                  )
                }}
              </TypographyText>
              <TypographyText
                v-if="row.actual.typeEvidence.status === 'present'"
                type="secondary"
                class="!block"
              >
                {{ observedTypeText(row.actual.typeEvidence) }}
              </TypographyText>
            </Space>
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.namespaceRead`)">
            {{
              $t(`${key}.namespaceReadStates.${row.actual.readEvidence.status}`)
            }}
            <TypographyText
              v-if="row.actual.readEvidence.status === 'failure'"
              type="danger"
            >
              {{ row.actual.readEvidence.code }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.namespaceSelection`)">
            {{ $t(`${key}.namespaceSelections.${row.actual.selection}`) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t(`${key}.namespaceNativeValue`)">
            <TypographyText
              v-if="row.actual.value?.kind === 'visibleString'"
              class="break-all"
            >
              {{ row.actual.value.value }}
            </TypographyText>
            <TypographyText v-else-if="!row.actual.value" type="secondary">
              {{ $t(`${key}.namespaceComparisonReasons.actualValueUnproven`) }}
            </TypographyText>
            <Collapse v-else :bordered="false" class="w-full">
              <CollapsePanel
                key="raw"
                :header="$t(`${key}.namespaceInspectRaw`)"
              >
                <JsonViewer
                  :value="row.actual.value"
                  copyable
                  boxed
                  :sort="false"
                />
              </CollapsePanel>
            </Collapse>
          </DescriptionsItem>
        </Descriptions>

        <Collapse :bordered="false" class="namespace-originals">
          <CollapsePanel
            key="originals"
            :header="$t(`${key}.namespaceEvidenceDetails`)"
          >
            <Descriptions :column="1" size="small">
              <DescriptionsItem
                v-if="row.declared.status === 'unknown'"
                :label="$t(`${key}.namespaceDeclarationState`)"
              >
                <TypographyText type="warning">
                  {{ $t(`${key}.namespaceReasons.${row.declared.reason}`) }}
                </TypographyText>
              </DescriptionsItem>
              <DescriptionsItem
                :label="$t(`${key}.namespaceDeclarationComparison`)"
              >
                <Space direction="vertical" :size="4">
                  <Tag
                    :color="stateColor(row.actual.declarationComparison.status)"
                    class="!m-0 self-start"
                  >
                    {{
                      $t(
                        `${key}.namespaceComparisonStates.${row.actual.declarationComparison.status}`,
                      )
                    }}
                  </Tag>
                  <TypographyText
                    v-if="row.actual.declarationComparison.status === 'unknown'"
                    type="secondary"
                  >
                    {{
                      $t(
                        `${key}.namespaceComparisonReasons.${row.actual.declarationComparison.reason}`,
                      )
                    }}
                  </TypographyText>
                </Space>
              </DescriptionsItem>
              <DescriptionsItem :label="$t(`${key}.namespaceActualBinding`)">
                <Space direction="vertical" :size="4">
                  <Tag
                    :color="stateColor(row.actual.namespaceReference.status)"
                    class="!m-0 self-start"
                  >
                    {{
                      $t(
                        `${key}.namespaceBindingStates.${row.actual.namespaceReference.status}`,
                      )
                    }}
                  </Tag>
                  <EvidenceDigest
                    v-if="row.actual.namespaceReference.status === 'matched'"
                    :value="row.actual.namespaceReference.digest"
                  />
                  <TypographyText v-else type="secondary">
                    {{
                      $t(
                        `${key}.namespaceBindingReasons.${row.actual.namespaceReference.reason}`,
                      )
                    }}
                  </TypographyText>
                </Space>
              </DescriptionsItem>
              <DescriptionsItem
                v-if="row.declared.status !== 'unknown'"
                :label="$t(`${key}.namespaceDeclaredOriginal`)"
              >
                <EvidenceDigest :value="row.declared.digest" />
                <TypographyText
                  v-if="row.declared.status === 'definition'"
                  type="secondary"
                  class="!block"
                >
                  {{
                    $t(`${key}.sourceOffset`, {
                      offset: row.declared.sourceOffset,
                    })
                  }}
                </TypographyText>
              </DescriptionsItem>
              <DescriptionsItem
                v-if="row.actual.effectiveNamespace.status === 'known'"
                :label="$t(`${key}.namespaceEffectiveOriginal`)"
              >
                <EvidenceDigest :value="row.actual.effectiveNamespace.digest" />
              </DescriptionsItem>
              <DescriptionsItem
                v-if="
                  row.actual.effectiveNamespace.status === 'known' &&
                  row.actual.effectiveNamespace.origin.kind === 'definition'
                "
                :label="$t(`${key}.namespaceDefinitionContext`)"
              >
                <EvidenceDigest
                  :value="row.actual.effectiveNamespace.origin.namespaceDigest"
                />
              </DescriptionsItem>
              <DescriptionsItem
                v-if="'value' in row.declared && row.declared.value"
                :label="$t(`${key}.namespaceDeclarationOrigin`)"
              >
                {{ $t(`${key}.namespaceOrigins.${row.declared.value.origin}`) }}
                · {{ $t(`${key}.namespaceLevels.${row.declared.value.level}`) }}
              </DescriptionsItem>
              <DescriptionsItem
                v-if="row.declaration?.resolution === 'settingGroupRequired'"
                :label="$t(`${key}.namespaceSettingGroups`)"
              >
                <Space direction="vertical" :size="8">
                  <TypographyText
                    v-for="(value, index) in row.declaration.values"
                    :key="index"
                    class="break-all"
                  >
                    {{
                      $t(`${key}.namespaceSettingGroup`, {
                        group:
                          value.settingGroup ?? $t(`${key}.namespaceUngrouped`),
                      })
                    }}: {{ value.lexical }} · {{ row.declaration.valueKind }}
                  </TypographyText>
                </Space>
              </DescriptionsItem>
            </Descriptions>
          </CollapsePanel>
        </Collapse>
      </Space>
    </Card>
  </div>
</template>

<style scoped>
.namespace-facts :deep(.ant-descriptions-item-label),
.namespace-originals :deep(.ant-descriptions-item-label) {
  white-space: normal;
}
.namespace-facts :deep(.ant-descriptions-item-content),
.namespace-originals :deep(.ant-descriptions-item-content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
.namespace-originals :deep(.ant-collapse-content-box) {
  padding-inline: 0 !important;
}
@media (max-width: 639px) {
  .namespace-card :deep(.ant-card-head-wrapper) {
    flex-wrap: wrap;
  }
  .namespace-card :deep(.ant-card-head-title) {
    flex-basis: 100%;
    white-space: normal;
    padding-bottom: 4px;
  }
  .namespace-card :deep(.ant-card-extra) {
    margin-inline-start: 0;
    padding-top: 0;
    padding-bottom: 12px;
  }
}
</style>
