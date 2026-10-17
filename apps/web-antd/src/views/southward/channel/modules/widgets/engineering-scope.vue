<script setup lang="ts">
import type { NamespaceScope } from '#/api/core/engineering';

import NamespaceEvidence from './engineering-namespace.vue';
import PresenceEvidence from './engineering-presence.vue';

defineProps<{ scope: NamespaceScope }>();
</script>

<template>
  <div data-testid="namespace-scope-evidence" class="min-w-0">
    <PresenceEvidence
      :presence="scope.presence"
      :substitution="scope.substitution"
      :control-model="scope.controlModel"
      class="mb-4"
    />
    <NamespaceEvidence :evidence="scope" :declarations="scope.declarations" />
  </div>
</template>
