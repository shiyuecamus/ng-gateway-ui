<script lang="ts" setup>
import type { RoiRect } from '#/shared/composables/use-ai-webrtc';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  DescriptionsItem,
  InputNumber,
  message,
  Popover,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  fetchAiPipeline,
  updateAiPipeline,
} from '#/api/core/ai';
import { useAiWebRtc } from '#/shared/composables/use-ai-webrtc';

const route = useRoute();
const channelId = computed(() => Number(route.params.channelId));
const pipelineId = computed(() => {
  const q = route.query.pipelineId;
  return q ? Number(q) : null;
});

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const {
  state,
  lastError,
  latestMetadata,
  latestAlarm,
  streamStats,
  paused,
  layers,
  roiRects,
  connect,
  disconnect,
  pause,
  resume,
  setBitrate,
  setResolution,
  captureSnapshot,
  toggleFullscreen,
} = useAiWebRtc();

// ── ROI interactive editing state ─────────────────────────────────
const roiEditMode = ref(false);
const roiDrawing = ref(false);
const roiStartPos = ref<null | { x: number; y: number }>(null);

function toggleRoiEditMode() {
  roiEditMode.value = !roiEditMode.value;
  if (!roiEditMode.value) {
    roiDrawing.value = false;
    roiStartPos.value = null;
  }
}

function normalizeMousePos(e: MouseEvent): null | { nx: number; ny: number } {
  if (!canvasRef.value) return null;
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    nx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    ny: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
}

function onCanvasMouseDown(e: MouseEvent) {
  if (!roiEditMode.value) return;
  const pos = normalizeMousePos(e);
  if (!pos) return;
  roiDrawing.value = true;
  roiStartPos.value = { x: pos.nx, y: pos.ny };
}

function onCanvasMouseUp(e: MouseEvent) {
  if (!roiEditMode.value || !roiDrawing.value || !roiStartPos.value) return;
  const pos = normalizeMousePos(e);
  if (!pos) return;

  const xMin = Math.min(roiStartPos.value.x, pos.nx);
  const yMin = Math.min(roiStartPos.value.y, pos.ny);
  const xMax = Math.max(roiStartPos.value.x, pos.nx);
  const yMax = Math.max(roiStartPos.value.y, pos.ny);

  if (xMax - xMin > 0.01 && yMax - yMin > 0.01) {
    const roi: RoiRect = {
      id: `roi-${Date.now()}`,
      xMin,
      yMin,
      xMax,
      yMax,
      label: `ROI ${roiRects.value.length + 1}`,
    };
    roiRects.value = [...roiRects.value, roi];
  }

  roiDrawing.value = false;
  roiStartPos.value = null;
}

function removeRoi(id: string) {
  roiRects.value = roiRects.value.filter((r) => r.id !== id);
}

function clearAllRois() {
  roiRects.value = [];
}

// ── ROI persistence (sync to Pipeline roi_regions) ────────────────
const roiSaving = ref(false);
const roiDirty = ref(false);

watch(roiRects, () => { roiDirty.value = true; }, { deep: true });

async function loadRoiFromPipeline() {
  if (!pipelineId.value) return;
  try {
    const pipeline = await fetchAiPipeline(pipelineId.value);
    const regions = pipeline?.roiRegions ?? [];
    roiRects.value = regions.map((r: any, i: number) => ({
      id: r.id ?? `roi-loaded-${i}`,
      xMin: r.x_min ?? r.xMin ?? 0,
      yMin: r.y_min ?? r.yMin ?? 0,
      xMax: r.x_max ?? r.xMax ?? 1,
      yMax: r.y_max ?? r.yMax ?? 1,
      label: r.label ?? `ROI ${i + 1}`,
    }));
    roiDirty.value = false;
  } catch (e) {
    console.warn('Failed to load ROI from pipeline:', e);
  }
}

async function saveRoiToPipeline() {
  if (!pipelineId.value) {
    message.warning($t('page.ai.live.messages.noPipelineBound'));
    return;
  }
  roiSaving.value = true;
  try {
    const pipeline = await fetchAiPipeline(pipelineId.value);
    if (!pipeline) throw new Error('Pipeline not found');
    await updateAiPipeline({
      ...pipeline,
      roiRegions: roiRects.value.map((r) => ({
        id: r.id,
        x_min: r.xMin,
        y_min: r.yMin,
        x_max: r.xMax,
        y_max: r.yMax,
        label: r.label,
      })),
    });
    roiDirty.value = false;
    message.success($t('page.ai.live.messages.roiSaved'));
  } catch (e) {
    message.error($t('page.ai.live.messages.roiSaveFailed'));
    console.error('Failed to save ROI:', e);
  } finally {
    roiSaving.value = false;
  }
}

onMounted(() => { loadRoiFromPipeline(); });

const showStats = ref(true);
const bitrateInput = ref(2000);
const resolutionPreset = ref('720p');

const resolutionPresets: Record<string, [number, number]> = {
  '480p': [854, 480],
  '720p': [1280, 720],
  '1080p': [1920, 1080],
};

async function startPreview() {
  if (!videoRef.value || !channelId.value) return;
  await nextTick();
  await connect(channelId.value, videoRef.value, canvasRef.value);
}

async function handleSnapshot() {
  const blob = await captureSnapshot();
  if (!blob) {
    message.warning($t('page.ai.live.messages.noVideoData'));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-live-ch${channelId.value}-${Date.now()}.jpg`;
  a.click();
  URL.revokeObjectURL(url);
  message.success($t('page.ai.live.messages.snapshotSaved'));
}

function handleSetBitrate() {
  setBitrate(bitrateInput.value);
  message.success(
    $t('page.ai.live.messages.bitrateUpdated', { value: bitrateInput.value }),
  );
}

function handleSetResolution() {
  const preset = resolutionPresets[resolutionPreset.value];
  if (preset) {
    setResolution(preset[0], preset[1]);
    message.success(
      $t('page.ai.live.messages.resolutionUpdated', {
        value: resolutionPreset.value,
      }),
    );
  }
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${bps.toFixed(0)} bps`;
}

function formatRtt(seconds: number): string {
  return `${(seconds * 1000).toFixed(0)} ms`;
}

function syncCanvasSize() {
  if (!videoRef.value || !canvasRef.value) return;
  const rect = videoRef.value.getBoundingClientRect();
  canvasRef.value.width = rect.width;
  canvasRef.value.height = rect.height;
  canvasRef.value.style.width = `${rect.width}px`;
  canvasRef.value.style.height = `${rect.height}px`;
}

let resizeObserver: null | ResizeObserver = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(syncCanvasSize);
  if (videoRef.value) resizeObserver.observe(videoRef.value);
});

watch(
  () => latestAlarm.value,
  (alarm) => {
    if (alarm) {
      const color = alarm.severity === 'critical' ? 'error' : 'warning';
      message[color](`[${alarm.alarm_type}] ${alarm.desc}`);
    }
  },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  disconnect();
});
</script>

<template>
  <Page :title="`${$t('page.ai.live.title')} — Channel #${channelId}`">
    <div class="space-y-4">
      <!-- Video + Canvas overlay container -->
      <Card :body-style="{ padding: '12px' }">
        <div
          class="relative mx-auto overflow-hidden rounded-lg bg-black"
          style="max-width: 960px"
        >
          <video
            ref="videoRef"
            autoplay
            muted
            playsinline
            class="block w-full"
            style="min-height: 400px"
            @loadedmetadata="syncCanvasSize"
            @resize="syncCanvasSize"
          ></video>
          <canvas
            ref="canvasRef"
            :class="
              roiEditMode
                ? 'absolute left-0 top-0 cursor-crosshair'
                : 'pointer-events-none absolute left-0 top-0'
            "
            @mousedown="onCanvasMouseDown"
            @mouseup="onCanvasMouseUp"
          ></canvas>
          <Spin
            v-if="state === 'connecting' || state === 'reconnecting'"
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        <!-- Status bar -->
        <div class="mt-3 flex items-center justify-between">
          <div>
            <Tag v-if="state === 'connected'" color="green">
              {{ $t('page.ai.live.status.connected') }}
            </Tag>
            <Tag v-else-if="state === 'connecting'" color="blue">
              {{ $t('page.ai.live.status.connecting') }}
            </Tag>
            <Tag v-else-if="state === 'reconnecting'" color="orange">
              {{ $t('page.ai.live.status.reconnecting') }}
            </Tag>
            <Tag v-else-if="state === 'error'" color="red">
              {{ lastError || $t('page.ai.live.status.error') }}
            </Tag>
            <Tag v-else color="default">
              {{ $t('page.ai.live.status.disconnected') }}
            </Tag>
          </div>
          <Space>
            <Button
              v-if="state === 'disconnected' || state === 'error'"
              type="primary"
              @click="startPreview"
            >
              {{ $t('page.ai.live.actions.startPreview') }}
            </Button>
            <template v-if="state === 'connected'">
              <Tooltip
                :title="
                  paused
                    ? $t('page.ai.live.actions.resume')
                    : $t('page.ai.live.actions.pause')
                "
              >
                <Button @click="paused ? resume() : pause()">
                  {{ paused ? '▶' : '⏸' }}
                </Button>
              </Tooltip>
              <Tooltip :title="$t('page.ai.live.actions.snapshot')">
                <Button @click="handleSnapshot">📸</Button>
              </Tooltip>
              <Tooltip :title="$t('page.ai.live.actions.fullscreen')">
                <Button @click="toggleFullscreen">⛶</Button>
              </Tooltip>
              <!-- Layer manager -->
              <Popover trigger="click" placement="bottomRight">
                <template #content>
                  <div class="space-y-2" style="width: 160px">
                    <div class="mb-1 text-xs font-medium text-gray-600">
                      {{ $t('page.ai.live.panels.layers') }}
                    </div>
                    <Checkbox v-model:checked="layers.bbox">
                      {{ $t('page.ai.live.labels.bboxLabels') }}
                    </Checkbox>
                    <Checkbox v-model:checked="layers.roi">
                      {{ $t('page.ai.live.labels.roiRegions') }}
                    </Checkbox>
                    <Checkbox v-model:checked="layers.trajectory">
                      {{ $t('page.ai.live.labels.trajectories') }}
                    </Checkbox>
                    <Checkbox v-model:checked="layers.heatmap">
                      {{ $t('page.ai.live.labels.heatmap') }}
                    </Checkbox>
                  </div>
                </template>
                <Tooltip :title="$t('page.ai.live.actions.layers')">
                  <Button>◫</Button>
                </Tooltip>
              </Popover>
              <!-- ROI editor toggle -->
              <Tooltip
                :title="
                  roiEditMode
                    ? $t('page.ai.live.actions.exitRoiEdit')
                    : $t('page.ai.live.actions.drawRoi')
                "
              >
                <Button
                  :type="roiEditMode ? 'primary' : 'default'"
                  @click="toggleRoiEditMode"
                >
                  ▭
                </Button>
              </Tooltip>
              <!-- ROI management popover (when ROIs exist) -->
              <Popover
                v-if="roiRects.length > 0"
                trigger="click"
                placement="bottomRight"
              >
                <template #content>
                  <div style="width: 220px">
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-xs font-medium text-gray-600">
                        {{ $t('page.ai.live.labels.roiRegions') }}
                        ({{ roiRects.length }})
                      </span>
                      <Button size="small" danger @click="clearAllRois">
                        {{ $t('page.ai.live.actions.clearAll') }}
                      </Button>
                    </div>
                    <div
                      v-for="roi in roiRects"
                      :key="roi.id"
                      class="mb-1 flex items-center justify-between rounded bg-gray-50 px-2 py-1"
                    >
                      <span class="text-xs">{{ roi.label }}</span>
                      <Button
                        size="small"
                        type="text"
                        danger
                        @click="removeRoi(roi.id)"
                      >
                        ✕
                      </Button>
                    </div>
                    <Button
                      v-if="pipelineId"
                      type="primary"
                      size="small"
                      block
                      :loading="roiSaving"
                      :disabled="!roiDirty"
                      class="mt-2"
                      @click="saveRoiToPipeline"
                    >
                      {{ $t('page.ai.live.actions.saveRoi') }}
                    </Button>
                  </div>
                </template>
                <Tooltip :title="$t('page.ai.live.actions.manageRois')">
                  <Button>
                    <span class="text-xs">
                      {{
                        $t('page.ai.live.labels.roiCount', {
                          count: roiRects.length,
                        })
                      }}
                      <span v-if="roiDirty" class="text-orange-500">*</span>
                    </span>
                  </Button>
                </Tooltip>
              </Popover>
              <!-- Stream settings -->
              <Popover trigger="click" placement="bottomRight">
                <template #content>
                  <div class="space-y-3" style="width: 200px">
                    <div>
                      <div class="mb-1 text-xs text-gray-500">
                        {{ $t('page.ai.live.labels.bitrateKbps') }}
                      </div>
                      <Space>
                        <InputNumber
                          v-model:value="bitrateInput"
                          :min="100"
                          :max="10000"
                          :step="100"
                          size="small"
                          style="width: 100px"
                        />
                        <Button size="small" @click="handleSetBitrate">
                          {{ $t('page.ai.live.actions.set') }}
                        </Button>
                      </Space>
                    </div>
                    <div>
                      <div class="mb-1 text-xs text-gray-500">
                        {{ $t('page.ai.live.labels.resolution') }}
                      </div>
                      <Space>
                        <Select
                          v-model:value="resolutionPreset"
                          :options="[
                            { label: '480p', value: '480p' },
                            { label: '720p', value: '720p' },
                            { label: '1080p', value: '1080p' },
                          ]"
                          size="small"
                          style="width: 80px"
                        />
                        <Button size="small" @click="handleSetResolution">
                          {{ $t('page.ai.live.actions.set') }}
                        </Button>
                      </Space>
                    </div>
                  </div>
                </template>
                <Button>⚙</Button>
              </Popover>
            </template>
            <Button v-if="state === 'connected'" danger @click="disconnect">
              {{ $t('page.ai.live.actions.stop') }}
            </Button>
          </Space>
        </div>
      </Card>

      <!-- Stats panel -->
      <Card
        v-if="state === 'connected' && showStats"
        size="small"
        :title="$t('page.ai.live.panels.stats')"
      >
        <Descriptions :column="4" bordered size="small">
          <DescriptionsItem :label="$t('page.ai.live.labels.videoFps')">
            {{ streamStats?.videoFps?.toFixed(0) ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.bitrate')">
            {{ streamStats ? formatBitrate(streamStats.videoBitrate) : '—' }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.rtt')">
            {{ streamStats ? formatRtt(streamStats.roundTripTime) : '—' }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.packetLoss')">
            {{
              streamStats
                ? `${streamStats.packetsLost} / ${streamStats.packetsReceived}`
                : '—'
            }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.aiFps')">
            {{ latestMetadata?.stats?.fps_ai ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.aiLatency')">
            {{
              latestMetadata?.lat_ms
                ? `${latestMetadata.lat_ms.toFixed(1)} ms`
                : '—'
            }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.detections')">
            {{ latestMetadata?.det?.length ?? 0 }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('page.ai.live.labels.queueDepth')">
            {{ latestMetadata?.stats?.q ?? '—' }}
          </DescriptionsItem>
        </Descriptions>
      </Card>
    </div>
  </Page>
</template>
