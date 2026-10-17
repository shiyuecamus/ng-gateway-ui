<script setup lang="ts">
import type { NamespacePresence, NamespaceScope } from '#/api/core/engineering';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import {
  Alert,
  Descriptions,
  DescriptionsItem,
  TypographyText,
} from 'ant-design-vue';

import EvidenceDigest from '#/shared/components/evidence-digest.vue';

const props = defineProps<{
  controlModel?: NamespaceScope['controlModel'];
  presence: NamespacePresence;
  substitution?: NamespaceScope['substitution'];
}>();
const key = 'page.southward.channel.engineering.goose';
/** Missing context is explicitly distinguished from an established source violation. */
const severity = computed(() => {
  if (props.presence.status === 'violated') return 'error';
  if (props.presence.status === 'satisfied') return 'success';
  return 'warning';
});
</script>

<template>
  <Alert
    data-testid="namespace-scope-presence"
    :type="severity"
    show-icon
    :message="$t(`${key}.presenceStates.${presence.status}`)"
  >
    <template #description>
      <TypographyText type="secondary">
        {{ $t(`${key}.presenceDescriptions.${presence.status}`) }}
      </TypographyText>
      <Descriptions
        v-if="controlModel?.status === 'declared'"
        layout="vertical"
        :column="1"
        size="small"
        class="mt-3"
      >
        <DescriptionsItem :label="$t(`${key}.controlModelDeclared`)">
          {{ controlModel.value }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.controlModelObserved`)">
          <TypographyText
            :type="controlModel.conflict ? 'danger' : 'secondary'"
          >
            {{
              controlModel.observation.status === 'value'
                ? controlModel.observation.value
                : $t(
                    `${key}.controlModelStates.${controlModel.observation.status}`,
                  )
            }}
          </TypographyText>
        </DescriptionsItem>
        <DescriptionsItem
          v-if="controlModel.conflict"
          :label="$t(`${key}.controlModelRelationship`)"
        >
          <TypographyText type="danger">
            {{ $t(`${key}.controlModelConflict`) }}
          </TypographyText>
        </DescriptionsItem>
      </Descriptions>
      <Descriptions
        v-if="substitution?.status === 'declared'"
        :column="1"
        size="small"
        class="mt-3"
      >
        <DescriptionsItem
          :label="
            $t(
              'page.southward.channel.engineering.contract.substitutionSupport',
            )
          "
        >
          {{
            $t(
              `page.southward.channel.engineering.contract.${substitution.support === 'supported' ? 'substitutionSupported' : 'substitutionUnsupported'}`,
            )
          }}
        </DescriptionsItem>
        <DescriptionsItem
          :label="
            $t('page.southward.channel.engineering.contract.substitutionSource')
          "
        >
          <EvidenceDigest :value="substitution.source" />
        </DescriptionsItem>
        <DescriptionsItem
          :label="$t('page.southward.channel.engineering.contract.locator')"
        >
          {{ substitution.locator }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.substitutionObservedSv`)">
          {{
            $t(
              `${key}.${substitution.observedSv ? 'substitutionSvPresent' : 'substitutionSvAbsent'}`,
            )
          }}
        </DescriptionsItem>
      </Descriptions>
      <Descriptions
        v-if="presence.status === 'violated'"
        :column="1"
        size="small"
        class="mt-3"
      >
        <DescriptionsItem :label="$t(`${key}.presenceMember`)">
          {{ presence.member }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.presenceReason`)">
          {{ $t(`${key}.presenceReasons.${presence.reason}`) }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.namespaceDeclaredOriginal`)">
          <EvidenceDigest :value="presence.digest" />
        </DescriptionsItem>
        <DescriptionsItem :label="$t(`${key}.presenceSourceOffset`)">
          {{ presence.sourceOffset }}
        </DescriptionsItem>
      </Descriptions>
    </template>
  </Alert>
</template>
