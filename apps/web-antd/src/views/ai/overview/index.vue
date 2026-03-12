<script lang="ts" setup>
import type { AiEngineStatus, AiPipelineInfo } from '@vben/types';

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { formatBytesHuman } from '@vben/utils';

import {
  Button,
  Card,
  Col,
  Descriptions,
  DescriptionsItem,
  Empty,
  Row,
  Spin,
  Statistic,
  Tag,
} from 'ant-design-vue';

import { fetchAiEngineStatus, fetchAiPipelines } from '#/api';

defineOptions({ name: 'AiOverviewPage' });

const router = useRouter();
const status = ref<AiEngineStatus | null>(null);
const pipelines = ref<AiPipelineInfo[]>([]);
const loading = ref(true);
const error = ref(false);

async function loadData() {
  loading.value = true;
  error.value = false;
  try {
    const [s, p] = await Promise.all([
      fetchAiEngineStatus(),
      fetchAiPipelines().catch(() => []),
    ]);
    status.value = s;
    pipelines.value = p ?? [];
  } catch {
    error.value = true;
    status.value = null;
  } finally {
    loading.value = false;
  }
}

function navigateTo(path: string) {
  router.push(path);
}

onMounted(loadData);
</script>

<template>
  <Page :title="$t('page.ai.overview.title')">
    <Spin :spinning="loading" style="min-height: 120px">
      <template v-if="!loading && (error || !status)">
        <Card>
          <Empty :description="$t('common.noData')">
            <Button type="primary" @click="loadData">
              {{ $t('common.refresh') }}
            </Button>
          </Empty>
        </Card>
      </template>
      <template v-else-if="status">
        <!-- KPI Row 1: Engine + Models -->
        <Row :gutter="[16, 16]">
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic :title="$t('page.ai.overview.engineStatus')">
                <template #formatter>
                  <Tag :color="status.enabled ? 'green' : 'red'">
                    {{
                      status.enabled
                        ? $t('page.ai.overview.status.running')
                        : $t('page.ai.overview.status.disabled')
                    }}
                  </Tag>
                </template>
              </Statistic>
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.registeredModels')"
                :value="status.models?.registered ?? 0"
              />
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.loadedModels')"
                :value="status.models?.loaded ?? 0"
              />
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.totalMemory')"
                :value="formatBytesHuman(status.models?.totalMemoryBytes ?? 0)"
              />
            </Card>
          </Col>
        </Row>

        <!-- KPI Row 2: Pipelines + Algorithms -->
        <Row :gutter="[16, 16]" class="mt-4">
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.registeredPipelines')"
                :value="status.pipelines?.registered ?? 0"
              />
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.activePipelines')"
                :value="status.pipelines?.activeChannels ?? 0"
              />
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.algorithmsRegistered')"
                :value="status.algorithms?.registered ?? 0"
              />
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card>
              <Statistic
                :title="$t('page.ai.overview.wasmModules')"
                :value="status.algorithms?.wasmModules ?? 0"
              />
            </Card>
          </Col>
        </Row>

        <!-- Inference metrics -->
        <Card class="mt-4" :title="$t('page.ai.overview.inference')">
          <Descriptions :column="{ xs: 2, sm: 4 }" bordered size="small">
            <DescriptionsItem :label="$t('page.ai.overview.inferenceActive')">
              {{ status.inference?.activeCount ?? 0 }}
            </DescriptionsItem>
            <DescriptionsItem
              :label="$t('page.ai.overview.inferenceMaxConcurrent')"
            >
              {{ status.inference?.maxConcurrent ?? 0 }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t('page.ai.overview.inferenceTotal')">
              {{ status.inference?.totalInferences ?? 0 }}
            </DescriptionsItem>
            <DescriptionsItem
              :label="$t('page.ai.overview.inferenceAvgLatency')"
            >
              <Tag
                :color="
                  (status.inference?.avgLatencyMs ?? 0) > 100
                    ? 'orange'
                    : 'green'
                "
              >
                {{ (status.inference?.avgLatencyMs ?? 0).toFixed(1) }} ms
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <!-- Quick navigation -->
        <Row :gutter="[16, 16]" class="mt-4">
          <Col :xs="12" :sm="6">
            <Card hoverable @click="navigateTo('/ai/model')">
              <div class="text-center">
                <div class="text-lg font-medium">
                  {{ $t('page.ai.model.title') }}
                </div>
                <div class="mt-1 text-sm text-gray-500">
                  {{ status.models?.registered ?? 0 }}
                  {{ $t('page.ai.overview.registeredModels') }}
                </div>
              </div>
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card hoverable @click="navigateTo('/ai/algorithm')">
              <div class="text-center">
                <div class="text-lg font-medium">
                  {{ $t('page.ai.algorithm.title') }}
                </div>
                <div class="mt-1 text-sm text-gray-500">
                  {{ status.algorithms?.registered ?? 0 }}
                  {{ $t('page.ai.overview.algorithmsRegistered') }}
                </div>
              </div>
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card hoverable @click="navigateTo('/ai/pipeline')">
              <div class="text-center">
                <div class="text-lg font-medium">
                  {{ $t('page.ai.pipeline.title') }}
                </div>
                <div class="mt-1 text-sm text-gray-500">
                  {{ status.pipelines?.registered ?? 0 }}
                  {{ $t('page.ai.overview.registeredPipelines') }}
                </div>
              </div>
            </Card>
          </Col>
          <Col :xs="12" :sm="6">
            <Card hoverable @click="navigateTo('/ai/alarm')">
              <div class="text-center">
                <div class="text-lg font-medium">
                  {{ $t('page.ai.alarm.title') }}
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </template>
    </Spin>
  </Page>
</template>
