<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

import { useAiWebRtc } from '#/shared/composables/use-ai-webrtc';
import type { RoiRect } from '#/shared/composables/use-ai-webrtc';

const route = useRoute();
const channelId = computed(() => Number(route.params.channelId));

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
const roiStartPos = ref<{ x: number; y: number } | null>(null);

function toggleRoiEditMode() {
  roiEditMode.value = !roiEditMode.value;
  if (!roiEditMode.value) {
    roiDrawing.value = false;
    roiStartPos.value = null;
  }
}

function normalizeMousePos(e: MouseEvent): { nx: number; ny: number } | null {
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
    message.warning('No video data to capture');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-live-ch${channelId.value}-${Date.now()}.jpg`;
  a.click();
  URL.revokeObjectURL(url);
  message.success('Snapshot saved');
}

function handleSetBitrate() {
  setBitrate(bitrateInput.value);
  message.success(`Bitrate set to ${bitrateInput.value} kbps`);
}

function handleSetResolution() {
  const preset = resolutionPresets[resolutionPreset.value];
  if (preset) {
    setResolution(preset[0], preset[1]);
    message.success(`Resolution set to ${resolutionPreset.value}`);
  }
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
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

onMounted(() => {
  const observer = new ResizeObserver(syncCanvasSize);
  if (videoRef.value) observer.observe(videoRef.value);
  return () => observer.disconnect();
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
          />
          <canvas
            ref="canvasRef"
            :class="roiEditMode ? 'absolute left-0 top-0 cursor-crosshair' : 'pointer-events-none absolute left-0 top-0'"
            @mousedown="onCanvasMouseDown"
            @mouseup="onCanvasMouseUp"
          />
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
              Connecting...
            </Tag>
            <Tag v-else-if="state === 'reconnecting'" color="orange">
              Reconnecting...
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
              <Tooltip :title="paused ? 'Resume' : 'Pause'">
                <Button @click="paused ? resume() : pause()">
                  {{ paused ? '▶' : '⏸' }}
                </Button>
              </Tooltip>
              <Tooltip title="Snapshot">
                <Button @click="handleSnapshot">📸</Button>
              </Tooltip>
              <Tooltip title="Fullscreen">
                <Button @click="toggleFullscreen">⛶</Button>
              </Tooltip>
              <!-- Layer manager -->
              <Popover trigger="click" placement="bottomRight">
                <template #content>
                  <div class="space-y-2" style="width: 160px">
                    <div class="mb-1 text-xs font-medium text-gray-600">Overlay Layers</div>
                    <Checkbox v-model:checked="layers.bbox">BBox / Labels</Checkbox>
                    <Checkbox v-model:checked="layers.roi">ROI Regions</Checkbox>
                    <Checkbox v-model:checked="layers.trajectory">Trajectories</Checkbox>
                    <Checkbox v-model:checked="layers.heatmap">Heatmap</Checkbox>
                  </div>
                </template>
                <Tooltip title="Layers">
                  <Button>◫</Button>
                </Tooltip>
              </Popover>
              <!-- ROI editor toggle -->
              <Tooltip :title="roiEditMode ? 'Exit ROI edit' : 'Draw ROI'">
                <Button
                  :type="roiEditMode ? 'primary' : 'default'"
                  @click="toggleRoiEditMode"
                >
                  ▭
                </Button>
              </Tooltip>
              <!-- ROI management popover (when ROIs exist) -->
              <Popover v-if="roiRects.length > 0" trigger="click" placement="bottomRight">
                <template #content>
                  <div style="width: 220px">
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-xs font-medium text-gray-600">
                        ROI Regions ({{ roiRects.length }})
                      </span>
                      <Button size="small" danger @click="clearAllRois">Clear All</Button>
                    </div>
                    <div v-for="roi in roiRects" :key="roi.id" class="mb-1 flex items-center justify-between rounded bg-gray-50 px-2 py-1">
                      <span class="text-xs">{{ roi.label }}</span>
                      <Button size="small" type="text" danger @click="removeRoi(roi.id)">✕</Button>
                    </div>
                  </div>
                </template>
                <Tooltip title="Manage ROIs">
                  <Button>
                    <span class="text-xs">ROI {{ roiRects.length }}</span>
                  </Button>
                </Tooltip>
              </Popover>
              <!-- Stream settings -->
              <Popover trigger="click" placement="bottomRight">
                <template #content>
                  <div class="space-y-3" style="width: 200px">
                    <div>
                      <div class="mb-1 text-xs text-gray-500">Bitrate (kbps)</div>
                      <Space>
                        <InputNumber v-model:value="bitrateInput" :min="100" :max="10000" :step="100" size="small" style="width: 100px" />
                        <Button size="small" @click="handleSetBitrate">Set</Button>
                      </Space>
                    </div>
                    <div>
                      <div class="mb-1 text-xs text-gray-500">Resolution</div>
                      <Space>
                        <Select v-model:value="resolutionPreset" :options="[{ label: '480p', value: '480p' }, { label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }]" size="small" style="width: 80px" />
                        <Button size="small" @click="handleSetResolution">Set</Button>
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
        title="Stream Statistics"
      >
        <Descriptions :column="4" bordered size="small">
          <DescriptionsItem label="Video FPS">
            {{ streamStats?.videoFps?.toFixed(0) ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="Bitrate">
            {{ streamStats ? formatBitrate(streamStats.videoBitrate) : '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="RTT">
            {{ streamStats ? formatRtt(streamStats.roundTripTime) : '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="Packet Loss">
            {{ streamStats ? `${streamStats.packetsLost} / ${streamStats.packetsReceived}` : '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="AI FPS">
            {{ latestMetadata?.stats?.fps_ai ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="AI Latency">
            {{ latestMetadata?.lat_ms ? `${latestMetadata.lat_ms.toFixed(1)} ms` : '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="Detections">
            {{ latestMetadata?.det?.length ?? 0 }}
          </DescriptionsItem>
          <DescriptionsItem label="Queue Depth">
            {{ latestMetadata?.stats?.q ?? '—' }}
          </DescriptionsItem>
        </Descriptions>
      </Card>
    </div>
  </Page>
</template>
