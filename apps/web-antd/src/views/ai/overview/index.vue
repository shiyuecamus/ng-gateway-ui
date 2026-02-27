<script setup lang="ts">
import { onMounted, reactive } from 'vue';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Col, Row } from 'ant-design-vue';

import { fetchAiEngineStatus } from '#/api';
import type { AiEngineStatus } from '@vben/types';
import { KpiCard } from './modules/widgets';

defineOptions({ name: 'AiOverviewPage' });

const status = reactive<AiEngineStatus>({
  enabled: false,
  executionProvider: 'unknown',
  models: {
    registered: 0,
    loaded: 0,
    totalMemoryBytes: 0,
  },
  inference: {
    activeCount: 0,
    maxConcurrent: 0,
    availablePermits: 0,
    totalInferences: 0,
    avgLatencyMs: 0,
  },
  pipelines: {
    registered: 0,
    activeChannels: 0,
  },
});

async function loadStatus() {
  const result = await fetchAiEngineStatus();
  Object.assign(status, result);
}

onMounted(() => {
  void loadStatus();
});
</script>

<template>
  <Page auto-content-height>
    <Row :gutter="16">
      <Col :span="8">
        <KpiCard
          :title="$t('page.ai.overview.engineStatus')"
          :value="
            status.enabled
              ? $t('page.ai.overview.status.running')
              : $t('page.ai.overview.status.disabled')
          "
        />
      </Col>
      <Col :span="8">
        <KpiCard
          :title="$t('page.ai.overview.registeredModels')"
          :value="status.models.registered"
        />
      </Col>
      <Col :span="8">
        <KpiCard
          :title="$t('page.ai.overview.activePipelines')"
          :value="status.pipelines.activeChannels"
        />
      </Col>
    </Row>
  </Page>
</template>
