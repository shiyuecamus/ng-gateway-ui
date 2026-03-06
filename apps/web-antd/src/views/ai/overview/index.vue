<script lang="ts" setup>
import type { AiEngineStatus, AiPipelineSummary } from '@vben/types';

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
  Table,
  Tag,
} from 'ant-design-vue';

import { fetchAiEngineStatus, fetchAiPipelines } from '#/api';

const router = useRouter();
const status = ref<AiEngineStatus | null>(null);
const pipelines = ref<AiPipelineSummary[]>([]);
const loading = ref(true);

const channelColumns = [
  { title: 'Channel ID', dataIndex: 'channelId', key: 'channelId', width: 100 },
  { title: 'Pipeline', dataIndex: 'pipelineName', key: 'pipelineName' },
  { title: 'Stages', dataIndex: 'stageCount', key: 'stageCount', width: 80 },
  { title: 'Rules', dataIndex: 'ruleCount', key: 'ruleCount', width: 80 },
  { title: '', dataIndex: 'actions', key: 'actions', width: 120 },
];

const channelData = ref<any[]>([]);

onMounted(async () => {
  try {
    const [s, p] = await Promise.all([
      fetchAiEngineStatus(),
      fetchAiPipelines().catch(() => []),
    ]);
    status.value = s;
    pipelines.value = p ?? [];
    channelData.value = (p ?? []).map((pl: AiPipelineSummary) => ({
      key: pl.channelId,
      channelId: pl.channelId,
      pipelineName: pl.config.name || pl.config.id,
      stageCount: pl.config.stages?.length ?? 0,
      ruleCount: pl.config.alarmRules?.length ?? 0,
    }));
  } catch {
    status.value = null;
  } finally {
    loading.value = false;
  }
});

function goToLive(channelId: number) {
  router.push(`/ai/live/${channelId}`);
}
</script>

<template>
  <Page :title="$t('page.ai.overview.title')">
    <Spin :spinning="loading" style="min-height: 120px">
      <template v-if="!loading && !status">
        <Card>
          <div class="py-8 text-center text-muted-foreground">
            {{ $t('common.noData') }}
          </div>
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
            <DescriptionsItem :label="$t('page.ai.overview.inferenceMaxConcurrent')">
              {{ status.inference?.maxConcurrent ?? 0 }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t('page.ai.overview.inferenceTotal')">
              {{ status.inference?.totalInferences ?? 0 }}
            </DescriptionsItem>
            <DescriptionsItem :label="$t('page.ai.overview.inferenceAvgLatency')">
              <Tag :color="(status.inference?.avgLatencyMs ?? 0) > 100 ? 'orange' : 'green'">
                {{ (status.inference?.avgLatencyMs ?? 0).toFixed(1) }} ms
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <!-- Active channels table -->
        <Card class="mt-4" title="Active Channels">
          <Table
            v-if="channelData.length > 0"
            :columns="channelColumns"
            :data-source="channelData"
            :pagination="false"
            size="small"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'stageCount'">
                <Tag color="blue">{{ record.stageCount }}</Tag>
              </template>
              <template v-else-if="column.key === 'ruleCount'">
                <Tag :color="record.ruleCount > 0 ? 'orange' : 'default'">
                  {{ record.ruleCount }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'actions'">
                <Button type="link" size="small" @click="goToLive(record.channelId)">
                  {{ $t('page.ai.live.title') }}
                </Button>
              </template>
            </template>
          </Table>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="No active channels"
          />
        </Card>
      </template>
    </Spin>
  </Page>
</template>
