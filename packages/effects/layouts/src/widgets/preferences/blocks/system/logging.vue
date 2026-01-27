<script setup lang="ts">
/**
 * Deprecated wrapper kept for compatibility.
 *
 * The new System settings UI lives in `system/index.vue` and uses:
 * - `/system/settings/logging_runtime`
 * - `/system/settings/logging_output`
 * - `/system/settings/logging_cleanup`
 * - `/system/settings/logging_files/*`
 */
import LoggingCleanup from './logging-cleanup.vue';
import LoggingFiles from './logging-files.vue';
import LoggingOutput from './logging-output.vue';
import LoggingRuntime from './logging-runtime.vue';
</script>

<template>
  <div class="space-y-4">
    <LoggingRuntime />
    <LoggingFiles />
    <LoggingOutput />
    <LoggingCleanup />
  </div>
</template>
