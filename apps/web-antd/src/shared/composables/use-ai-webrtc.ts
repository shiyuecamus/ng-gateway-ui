/**
 * WebRTC composable for AI live preview.
 *
 * Full-featured implementation covering:
 * - SDP offer/answer + ICE trickle via WebSocket signaling
 * - DataChannel "metadata" for per-frame detection results
 * - DataChannel "control" for pause/resume/snapshot/bitrate/resolution
 * - Canvas overlay drawing (BBox, labels, track IDs)
 * - RTCPeerConnection.getStats() for FPS / latency / bitrate / packet loss
 * - Automatic reconnection with exponential backoff
 * - Client-side snapshot compositing (video + canvas → JPEG blob)
 */

import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';

import { buildWsUrl } from './use-gateway-ws';

export type AiWebRtcState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

/** Compact detection from DataChannel (short key names for bandwidth). */
export interface CompactDetection {
  /** Bounding box [xmin, ymin, xmax, ymax] in normalized [0,1]. */
  b: [number, number, number, number];
  /** Class name. */
  c: string;
  /** Confidence score [0,1]. */
  cf: number;
  /** Track ID (from tracker stage, -1 if no tracker). */
  tid: number;
}

/** Per-frame metadata pushed via DataChannel. */
export interface FrameMetadata {
  type: 'frame';
  seq: number;
  ts: string;
  lat_ms: number;
  det: CompactDetection[];
  /** Per-track trajectory polylines: track_id → [[ts,x,y], ...]. */
  trajectories?: Record<number, Array<[number, number, number]>>;
  /** Heatmap grid data: 2D array of normalized [0,1] intensity values. */
  heatmap?: { cols: number; rows: number; data: number[] };
  stats: {
    fps_in: number;
    fps_ai: number;
    fps_out: number;
    drop: number;
    q: number;
  };
}

/** Alarm event pushed via DataChannel. */
export interface AlarmEvent {
  type: 'alarm';
  alarm_type: string;
  severity: string;
  desc: string;
  det: CompactDetection[];
  traj?: Array<[number, number, number]>;
}

/** Stream statistics from RTCPeerConnection.getStats(). */
export interface StreamStats {
  videoFps: number;
  videoBitrate: number;
  packetsLost: number;
  packetsReceived: number;
  roundTripTime: number;
  jitter: number;
}

/** ROI rectangle in normalized coordinates. */
export interface RoiRect {
  id: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  label?: string;
}

/** Canvas overlay layer visibility toggles. */
export interface OverlayLayers {
  bbox: boolean;
  roi: boolean;
  trajectory: boolean;
  heatmap: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const STATS_INTERVAL_MS = 2000;

const CLASS_COLORS: Record<string, string> = {
  person: '#00ff00',
  car: '#ff6600',
  truck: '#ff3300',
  bicycle: '#33ccff',
  motorcycle: '#ff33cc',
  bus: '#ffcc00',
  dog: '#cc66ff',
  cat: '#66ff99',
};

function classColor(className: string): string {
  return CLASS_COLORS[className] ?? '#00ff00';
}

/** Viridis-inspired heatmap color palette (16 stops). */
const HEATMAP_PALETTE: Array<[number, number, number]> = [
  [68, 1, 84], [72, 36, 117], [65, 68, 135], [53, 95, 141],
  [42, 120, 142], [33, 145, 140], [34, 168, 132], [53, 191, 112],
  [94, 211, 81], [146, 225, 44], [202, 232, 26], [244, 230, 30],
  [253, 205, 37], [253, 174, 50], [250, 137, 59], [240, 96, 68],
];

function heatmapColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  const idx = t * (HEATMAP_PALETTE.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HEATMAP_PALETTE.length - 1);
  const f = idx - lo;
  const r = Math.round(HEATMAP_PALETTE[lo]![0]! * (1 - f) + HEATMAP_PALETTE[hi]![0]! * f);
  const g = Math.round(HEATMAP_PALETTE[lo]![1]! * (1 - f) + HEATMAP_PALETTE[hi]![1]! * f);
  const b = Math.round(HEATMAP_PALETTE[lo]![2]! * (1 - f) + HEATMAP_PALETTE[hi]![2]! * f);
  return `rgb(${r},${g},${b})`;
}

export function useAiWebRtc() {
  const state = ref<AiWebRtcState>('disconnected');
  const lastError = shallowRef<string | null>(null);
  const latestMetadata = shallowRef<FrameMetadata | null>(null);
  const latestAlarm = shallowRef<AlarmEvent | null>(null);
  const streamStats = shallowRef<StreamStats | null>(null);
  const paused = ref(false);

  /** Layer visibility toggles (reactive for UI binding). */
  const layers = reactive<OverlayLayers>({
    bbox: true,
    roi: true,
    trajectory: true,
    heatmap: true,
  });

  /** ROI rectangles displayed on the canvas overlay. */
  const roiRects = ref<RoiRect[]>([]);

  let pc: RTCPeerConnection | null = null;
  let ws: WebSocket | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let currentChannelId: number | null = null;
  // Held to prevent GC and used for readyState checks.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let metadataChannel: RTCDataChannel | null = null;
  let controlChannel: RTCDataChannel | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let prevBytesReceived = 0;
  let prevTimestamp = 0;
  let shouldReconnect = false;

  function cleanup() {
    shouldReconnect = false;
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
      pc = null;
    }
    if (ws) {
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.onopen = null;
      if (ws.readyState < 2) ws.close();
      ws = null;
    }
    metadataChannel = null;
    controlChannel = null;
    lastError.value = null;
  }

  function disconnect() {
    cleanup();
    state.value = 'disconnected';
    paused.value = false;
    latestMetadata.value = null;
    streamStats.value = null;
  }

  async function connect(
    channelId: number,
    video: HTMLVideoElement,
    canvas?: HTMLCanvasElement | null,
  ) {
    if (state.value === 'connecting' || state.value === 'connected') return;

    currentChannelId = channelId;
    videoEl = video;
    canvasEl = canvas ?? null;
    shouldReconnect = true;
    reconnectAttempt = 0;
    await doConnect(channelId);
  }

  async function doConnect(channelId: number) {
    state.value = reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    lastError.value = null;

    const wsUrl = buildWsUrl(`/api/ws/ai/channels/${channelId}/live`);

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (ev) => {
      if (videoEl && ev.streams[0]) {
        videoEl.srcObject = ev.streams[0];
      }
    };

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      if (ch.label === 'metadata') {
        metadataChannel = ch;
        ch.onmessage = handleMetadataMessage;
      } else if (ch.label === 'control') {
        controlChannel = ch;
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'ice',
            candidate: ev.candidate.candidate,
            sdp_mid: ev.candidate.sdpMid ?? undefined,
            sdp_m_line_index: ev.candidate.sdpMLineIndex ?? undefined,
          }),
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc?.iceConnectionState;
      if (iceState === 'failed' || iceState === 'disconnected') {
        lastError.value = `ICE state: ${iceState}`;
        state.value = 'error';
        scheduleReconnect();
      }
    };

    const offer = await pc.createOffer({ offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws!.send(
        JSON.stringify({
          type: 'offer',
          sdp: pc?.localDescription?.sdp ?? '',
          config: {
            preferred_codec: 'h264',
            max_resolution: [1280, 720],
            max_fps: 30,
            server_side_annotation: false,
          },
        }),
      );
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'answer': {
            if (msg.sdp && pc) {
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }),
              );
            }
            break;
          }
          case 'ice': {
            if (msg.candidate && pc) {
              await pc.addIceCandidate(
                new RTCIceCandidate({
                  candidate: msg.candidate,
                  sdpMid: msg.sdp_mid ?? undefined,
                  sdpMLineIndex: msg.sdp_m_line_index ?? undefined,
                }),
              );
            }
            break;
          }
          case 'connected': {
            state.value = 'connected';
            reconnectAttempt = 0;
            startStatsPolling();
            break;
          }
          case 'error': {
            lastError.value = msg.message ?? 'Server error';
            state.value = 'error';
            break;
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      lastError.value = 'WebSocket error';
      state.value = 'error';
      scheduleReconnect();
    };

    ws.onclose = () => {
      if (state.value === 'connected') {
        state.value = 'disconnected';
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    if (!shouldReconnect || currentChannelId === null) return;
    if (reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    reconnectAttempt++;
    state.value = 'reconnecting';

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      cleanup();
      if (currentChannelId !== null) {
        await doConnect(currentChannelId);
      }
    }, delay);
  }

  function handleMetadataMessage(ev: MessageEvent) {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'frame') {
        latestMetadata.value = data as FrameMetadata;
        drawOverlays(data as FrameMetadata);
      } else if (data.type === 'alarm') {
        latestAlarm.value = data as AlarmEvent;
      }
    } catch {
      // ignore
    }
  }

  function drawOverlays(metadata: FrameMetadata) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;
    ctx.clearRect(0, 0, w, h);

    // Layer 1: Heatmap (bottom-most, semi-transparent grid)
    if (layers.heatmap && metadata.heatmap) {
      drawHeatmapLayer(ctx, w, h, metadata.heatmap);
    }

    // Layer 2: ROI regions
    if (layers.roi && roiRects.value.length > 0) {
      drawRoiLayer(ctx, w, h);
    }

    // Layer 3: Trajectory polylines
    if (layers.trajectory && metadata.trajectories) {
      drawTrajectoryLayer(ctx, w, h, metadata.trajectories);
    }

    // Layer 3b: Alarm trajectory (from latest alarm event)
    if (layers.trajectory && latestAlarm.value?.traj) {
      drawSingleTrajectory(ctx, w, h, latestAlarm.value.traj, '#ff4444');
    }

    // Layer 4: BBox detections (top-most)
    if (layers.bbox) {
      drawBboxLayer(ctx, w, h, metadata.det ?? []);
    }
  }

  // ── Layer: BBox ───────────────────────────────────────────

  function drawBboxLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    detections: CompactDetection[],
  ) {
    for (const det of detections) {
      const [xmin, ymin, xmax, ymax] = det.b;
      const x = xmin * w;
      const y = ymin * h;
      const bw = (xmax - xmin) * w;
      const bh = (ymax - ymin) * h;
      const color = classColor(det.c);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, bw, bh);

      const label = `${det.c} ${(det.cf * 100).toFixed(0)}%${det.tid >= 0 ? ` #${det.tid}` : ''}`;
      ctx.font = '13px sans-serif';
      const metrics = ctx.measureText(label);
      const labelH = 18;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, y - labelH, metrics.width + 8, labelH);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 4, y - 4);
    }
  }

  // ── Layer: ROI ────────────────────────────────────────────

  function drawRoiLayer(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    for (const roi of roiRects.value) {
      const x = roi.xMin * w;
      const y = roi.yMin * h;
      const rw = (roi.xMax - roi.xMin) * w;
      const rh = (roi.yMax - roi.yMin) * h;

      ctx.strokeStyle = '#00bfff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, rw, rh);

      ctx.fillStyle = 'rgba(0, 191, 255, 0.08)';
      ctx.fillRect(x, y, rw, rh);

      if (roi.label) {
        ctx.setLineDash([]);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(0, 191, 255, 0.8)';
        ctx.fillRect(x, y, ctx.measureText(roi.label).width + 8, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(roi.label, x + 4, y + 12);
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Layer: Trajectory ─────────────────────────────────────

  function drawTrajectoryLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    trajectories: Record<number, Array<[number, number, number]>>,
  ) {
    const TRAIL_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bff', '#6bffff'];
    let colorIdx = 0;

    for (const [, points] of Object.entries(trajectories)) {
      if (points.length < 2) continue;
      const color = TRAIL_COLORS[colorIdx % TRAIL_COLORS.length]!;
      colorIdx++;
      drawSingleTrajectory(ctx, w, h, points, color);
    }
  }

  function drawSingleTrajectory(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    points: Array<[number, number, number]>,
    color: string,
  ) {
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    const [, x0, y0] = points[0]!;
    ctx.moveTo(x0! * w, y0! * h);

    for (let i = 1; i < points.length; i++) {
      const [, px, py] = points[i]!;
      // Fade older points: alpha decreases linearly from tail to head.
      ctx.globalAlpha = 0.3 + 0.7 * (i / (points.length - 1));
      ctx.lineTo(px! * w, py! * h);
    }
    ctx.stroke();

    // Draw arrowhead at the latest point to indicate direction.
    if (points.length >= 2) {
      const [, px2, py2] = points[points.length - 2]!;
      const [, px1, py1] = points[points.length - 1]!;
      const dx = px1! - px2!;
      const dy = py1! - py2!;
      const angle = Math.atan2(dy * h, dx * w);
      const headLen = 8;

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(px1! * w, py1! * h);
      ctx.lineTo(
        px1! * w - headLen * Math.cos(angle - Math.PI / 6),
        py1! * h - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(px1! * w, py1! * h);
      ctx.lineTo(
        px1! * w - headLen * Math.cos(angle + Math.PI / 6),
        py1! * h - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Layer: Heatmap ────────────────────────────────────────

  function drawHeatmapLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    heatmap: { cols: number; rows: number; data: number[] },
  ) {
    const { cols, rows, data } = heatmap;
    if (cols <= 0 || rows <= 0 || data.length !== cols * rows) return;

    ctx.save();
    ctx.globalAlpha = 0.4;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const intensity = data[r * cols + c]!;
        if (intensity < 0.01) continue;
        ctx.fillStyle = heatmapColor(intensity);
        ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    ctx.restore();
  }

  function startStatsPolling() {
    if (statsTimer) clearInterval(statsTimer);
    prevBytesReceived = 0;
    prevTimestamp = 0;

    statsTimer = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let videoFps = 0;
        let videoBitrate = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let roundTripTime = 0;
        let jitter = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            videoFps = report.framesPerSecond ?? 0;
            packetsLost = report.packetsLost ?? 0;
            packetsReceived = report.packetsReceived ?? 0;
            jitter = report.jitter ?? 0;

            const now = report.timestamp;
            const bytes = report.bytesReceived ?? 0;
            if (prevTimestamp > 0 && now > prevTimestamp) {
              const dt = (now - prevTimestamp) / 1000;
              videoBitrate = ((bytes - prevBytesReceived) * 8) / dt;
            }
            prevBytesReceived = bytes;
            prevTimestamp = now;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            roundTripTime = report.currentRoundTripTime ?? 0;
          }
        });

        streamStats.value = {
          videoFps,
          videoBitrate,
          packetsLost,
          packetsReceived,
          roundTripTime,
          jitter,
        };
      } catch {
        // ignore
      }
    }, STATS_INTERVAL_MS);
  }

  // Control commands
  function sendControl(msg: Record<string, any>) {
    if (controlChannel?.readyState === 'open') {
      controlChannel.send(JSON.stringify(msg));
    }
  }

  function pause() {
    sendControl({ type: 'pause' });
    paused.value = true;
  }
  function resume() {
    sendControl({ type: 'resume' });
    paused.value = false;
  }
  function requestSnapshot(quality = 95) {
    sendControl({ type: 'snapshot', quality });
  }
  function setBitrate(kbps: number) {
    sendControl({ type: 'set_bitrate', kbps });
  }
  function setResolution(w: number, h: number) {
    sendControl({ type: 'set_resolution', w, h });
  }

  async function captureSnapshot(): Promise<Blob | null> {
    if (!videoEl) return null;
    const composite = document.createElement('canvas');
    composite.width = videoEl.videoWidth || 1280;
    composite.height = videoEl.videoHeight || 720;
    const ctx = composite.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoEl, 0, 0);
    if (canvasEl) {
      ctx.drawImage(canvasEl, 0, 0, composite.width, composite.height);
    }

    return new Promise((resolve) => {
      composite.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.95,
      );
    });
  }

  function toggleFullscreen() {
    if (!videoEl) return;
    const container = videoEl.parentElement;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }

  onBeforeUnmount(() => {
    disconnect();
  });

  return {
    state: computed(() => state.value),
    lastError: computed(() => lastError.value),
    latestMetadata: computed(() => latestMetadata.value),
    latestAlarm: computed(() => latestAlarm.value),
    streamStats: computed(() => streamStats.value),
    paused: computed(() => paused.value),
    /** Overlay layer visibility toggles. */
    layers,
    /** ROI rectangles for canvas overlay rendering. */
    roiRects,
    connect,
    disconnect,
    pause,
    resume,
    requestSnapshot,
    setBitrate,
    setResolution,
    captureSnapshot,
    toggleFullscreen,
  };
}
