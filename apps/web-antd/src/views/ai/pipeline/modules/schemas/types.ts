import type { AiPipelineConfig } from '@vben/types';

export type PipelineEditorMode = 'create' | 'update';

export type SamplingType = 'every_frame' | 'fixed_interval' | 'target_fps' | 'key_frame_only';
export type StageType = 'frame_transform' | 'inference' | 'tracker' | 'result_processor';
export type TrackerAlgorithmType = 'sort' | 'deep_sort';
export type AlarmConditionType =
  | 'class_detected'
  | 'count_exceeds'
  | 'zone_intrusion'
  | 'line_crossing'
  | 'anomaly_detected'
  | 'custom_wasm';

export type ConfigValueType = 'string' | 'number' | 'boolean';

export interface ConfigEntry {
  key: string;
  value: string;
  valueType: ConfigValueType;
}

export interface RoiRect {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface StagePreprocessForm {
  resizeMode?: 'center_crop' | 'direct_resize' | 'letterbox';
  channelOrder?: 'bgr' | 'rgb';
  padValue?: number;
  normalizationPreset?: 'custom' | 'imagenet' | 'symmetric' | 'yolo';
  meanR?: number;
  meanG?: number;
  meanB?: number;
  stdR?: number;
  stdG?: number;
  stdB?: number;
}

export interface StagePostprocessForm {
  type?:
    | 'anomaly_detection'
    | 'classification'
    | 'passthrough'
    | 'segmentation'
    | 'yolov5_detection'
    | 'yolov8_detection'
    | 'yolov8_pose';
  topK?: number;
  applySoftmax?: boolean;
  maxDetections?: number;
  numKeypoints?: number;
  anomalyThreshold?: number;
  nmsVariant?: 'classic' | 'diou' | 'soft';
  softNmsSigma?: number;
  detectionParallelThreshold?: number;
  nmsPrescreenMultiplier?: number;
  classificationSmallClassFastPath?: number;
  segmentationParallelMinPixels?: number;
}

export interface PipelineEditorStage {
  type: StageType;
  moduleId?: string;
  configEntries: ConfigEntry[];
  modelId?: string;
  confidenceThreshold?: number;
  nmsIouThreshold?: number;
  inputWidth?: number;
  inputHeight?: number;
  preprocessEnabled: boolean;
  preprocess: StagePreprocessForm;
  postprocessEnabled: boolean;
  postprocess: StagePostprocessForm;
  algorithm?: TrackerAlgorithmType;
  reidModelId?: string;
  maxAge?: number;
}

export interface PipelineEditorAlarmRule {
  name: string;
  severity: 'info' | 'warning' | 'critical';
  cooldownSecs: number;
  minDurationSecs?: number;
  conditionType: AlarmConditionType;
  className?: string;
  minConfidence?: number;
  threshold?: number;
  zonePoints: Point2D[];
  lineStart: Point2D;
  lineEnd: Point2D;
  direction?: 'left_to_right' | 'right_to_left' | 'any';
  minScore?: number;
  customModuleId?: string;
  customConfigEntries: ConfigEntry[];
}

export interface PipelineEditorFormValues {
  channelId?: number;
  id: string;
  name: string;
  samplingType: SamplingType;
  everyNFrames?: number;
  fps?: number;
  roiEnabled: boolean;
  roiXMin?: number;
  roiYMin?: number;
  roiXMax?: number;
  roiYMax?: number;
  roiRegions: RoiRect[];
  stages: PipelineEditorStage[];
  alarmRules: PipelineEditorAlarmRule[];
  drawBboxes: boolean;
  drawLabels: boolean;
  drawConfidence: boolean;
  drawTrackIds: boolean;
  drawSegmentation: boolean;
  segmentationAlpha: number;
  segmentationBackgroundClass?: number;
  lineThickness: number;
  fontScale: number;
  jpegQuality: number;
  maxOutputDimension?: number;
}

export interface PipelineEditorSubmitPayload {
  channelId: number;
  config: AiPipelineConfig;
}
