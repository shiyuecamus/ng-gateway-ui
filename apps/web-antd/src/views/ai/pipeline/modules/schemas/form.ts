import type {
  AiPipelineConfig,
  AiPipelineSummary,
  Recordable,
} from '@vben/types';

import type {
  ConfigEntry,
  ConfigValueType,
  PipelineEditorAlarmRule,
  PipelineEditorFormValues,
  PipelineEditorStage,
  Point2D,
  RoiRect,
  SamplingType,
  StagePostprocessForm,
  StagePreprocessForm,
} from './types';

function inferSamplingType(sampling?: Recordable<any>): SamplingType {
  const current = (sampling?.type ?? 'every_frame') as SamplingType;
  if (
    current === 'every_frame' ||
    current === 'fixed_interval' ||
    current === 'target_fps' ||
    current === 'key_frame_only'
  ) {
    return current;
  }
  return 'every_frame';
}

function detectValueType(value: unknown): ConfigValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function objectToEntries(value: unknown): ConfigEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Recordable<any>).map(([key, raw]) => ({
    key,
    value:
      typeof raw === 'string'
        ? raw
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : JSON.stringify(raw),
    valueType: detectValueType(raw),
  }));
}

function entriesToObject(entries: ConfigEntry[]): Recordable<any> {
  const result: Recordable<any> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    if (entry.valueType === 'number') {
      const parsed = Number(entry.value);
      result[key] = Number.isNaN(parsed) ? 0 : parsed;
      continue;
    }
    if (entry.valueType === 'boolean') {
      result[key] = entry.value === 'true';
      continue;
    }
    result[key] = entry.value;
  }
  return result;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toPointList(value: unknown): Point2D[] {
  if (!Array.isArray(value)) return [];
  const points: Point2D[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const x = Number(item[0]);
    const y = Number(item[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    points.push({ x, y });
  }
  return points;
}

function buildTriple(
  a?: number,
  b?: number,
  c?: number,
): [number, number, number] | undefined {
  if (a === undefined || b === undefined || c === undefined) {
    return undefined;
  }
  return [a, b, c];
}

function pointsToTuple(points: Point2D[]): [number, number][] {
  return points.map((point) => [point.x, point.y]);
}

function mapPreprocessToForm(preprocess?: Recordable<any>): StagePreprocessForm {
  const normalization = (preprocess?.normalization ?? {}) as Recordable<any>;
  const mean = Array.isArray(normalization.mean) ? normalization.mean : [];
  const std = Array.isArray(normalization.std) ? normalization.std : [];
  return {
    resizeMode: preprocess?.resizeMode,
    channelOrder: preprocess?.channelOrder,
    padValue: toNumberOrUndefined(preprocess?.padValue),
    normalizationPreset: normalization?.preset,
    meanR: toNumberOrUndefined(mean[0]),
    meanG: toNumberOrUndefined(mean[1]),
    meanB: toNumberOrUndefined(mean[2]),
    stdR: toNumberOrUndefined(std[0]),
    stdG: toNumberOrUndefined(std[1]),
    stdB: toNumberOrUndefined(std[2]),
  };
}

function mapPostprocessToForm(postprocess?: Recordable<any>): StagePostprocessForm {
  return {
    type: postprocess?.type,
    topK: toNumberOrUndefined(postprocess?.topK),
    applySoftmax:
      postprocess?.applySoftmax === undefined
        ? undefined
        : Boolean(postprocess?.applySoftmax),
    maxDetections: toNumberOrUndefined(postprocess?.maxDetections),
    numKeypoints: toNumberOrUndefined(postprocess?.numKeypoints),
    anomalyThreshold: toNumberOrUndefined(postprocess?.anomalyThreshold),
    nmsVariant: postprocess?.nmsVariant,
    softNmsSigma: toNumberOrUndefined(postprocess?.softNmsSigma),
    detectionParallelThreshold: toNumberOrUndefined(
      postprocess?.detectionParallelThreshold,
    ),
    nmsPrescreenMultiplier: toNumberOrUndefined(postprocess?.nmsPrescreenMultiplier),
    classificationSmallClassFastPath: toNumberOrUndefined(
      postprocess?.classificationSmallClassFastPath,
    ),
    segmentationParallelMinPixels: toNumberOrUndefined(
      postprocess?.segmentationParallelMinPixels,
    ),
  };
}

export function buildDefaultEditorValues(): PipelineEditorFormValues {
  return {
    channelId: undefined,
    id: '',
    name: '',
    samplingType: 'every_frame',
    everyNFrames: 5,
    fps: 5,
    roiEnabled: false,
    roiXMin: 0,
    roiYMin: 0,
    roiXMax: 1,
    roiYMax: 1,
    roiRegions: [],
    stages: [
      {
        type: 'inference',
        configEntries: [],
        modelId: '',
        confidenceThreshold: 0.5,
        nmsIouThreshold: 0.45,
        inputWidth: undefined,
        inputHeight: undefined,
        preprocessEnabled: false,
        preprocess: {},
        postprocessEnabled: false,
        postprocess: {},
      },
    ],
    alarmRules: [],
    drawBboxes: true,
    drawLabels: true,
    drawConfidence: true,
    drawTrackIds: true,
    drawSegmentation: true,
    segmentationAlpha: 0.4,
    segmentationBackgroundClass: 0,
    lineThickness: 2,
    fontScale: 0.6,
    jpegQuality: 75,
    maxOutputDimension: 1280,
  };
}

function mapStageToForm(stage: Recordable<any>): PipelineEditorStage {
  const stageType = stage.type as PipelineEditorStage['type'];
  switch (stageType) {
    case 'frame_transform':
      return {
        type: 'frame_transform',
        moduleId: stage.moduleId ?? '',
        configEntries: objectToEntries(stage.config),
        preprocessEnabled: false,
        preprocess: {},
        postprocessEnabled: false,
        postprocess: {},
      };
    case 'inference':
      return {
        type: 'inference',
        configEntries: [],
        modelId: stage.modelId ?? '',
        confidenceThreshold: Number(stage.confidenceThreshold ?? 0.5),
        nmsIouThreshold:
          stage.nmsIouThreshold === undefined || stage.nmsIouThreshold === null
            ? undefined
            : Number(stage.nmsIouThreshold),
        inputWidth: toNumberOrUndefined(stage.inputSize?.[0]),
        inputHeight: toNumberOrUndefined(stage.inputSize?.[1]),
        preprocessEnabled: Boolean(stage.preprocess),
        preprocess: mapPreprocessToForm(stage.preprocess),
        postprocessEnabled: Boolean(stage.postprocess),
        postprocess: mapPostprocessToForm(stage.postprocess),
      };
    case 'tracker': {
      const algorithmObj = stage.algorithm ?? {};
      const algorithmType =
        algorithmObj.type === 'deep_sort' ? 'deep_sort' : 'sort';
      return {
        type: 'tracker',
        configEntries: [],
        preprocessEnabled: false,
        preprocess: {},
        postprocessEnabled: false,
        postprocess: {},
        algorithm: algorithmType,
        reidModelId: algorithmObj.reidModelId,
        maxAge: Number(stage.maxAge ?? 30),
      };
    }
    case 'result_processor':
      return {
        type: 'result_processor',
        moduleId: stage.moduleId ?? '',
        configEntries: objectToEntries(stage.config),
        preprocessEnabled: false,
        preprocess: {},
        postprocessEnabled: false,
        postprocess: {},
      };
    default:
      return {
        type: 'inference',
        configEntries: [],
        modelId: '',
        confidenceThreshold: 0.5,
        nmsIouThreshold: 0.45,
        preprocessEnabled: false,
        preprocess: {},
        postprocessEnabled: false,
        postprocess: {},
      };
  }
}

function mapAlarmRuleToForm(rule: Recordable<any>): PipelineEditorAlarmRule {
  const condition = (rule.condition ?? {}) as Recordable<any>;
  const conditionType = (condition.type ?? 'class_detected') as PipelineEditorAlarmRule['conditionType'];
  return {
    name: String(rule.name ?? ''),
    severity: (rule.severity ?? 'warning') as PipelineEditorAlarmRule['severity'],
    cooldownSecs: Number(rule.cooldownSecs ?? 60),
    minDurationSecs:
      rule.minDurationSecs === undefined || rule.minDurationSecs === null
        ? undefined
        : Number(rule.minDurationSecs),
    conditionType,
    className: condition.class,
    minConfidence:
      condition.minConfidence === undefined || condition.minConfidence === null
        ? undefined
        : Number(condition.minConfidence),
    threshold:
      condition.threshold === undefined || condition.threshold === null
        ? undefined
        : Number(condition.threshold),
    zonePoints: toPointList(condition.zone),
    lineStart: {
      x: toNumberOrUndefined(condition.line?.[0]?.[0]) ?? 0,
      y: toNumberOrUndefined(condition.line?.[0]?.[1]) ?? 0,
    },
    lineEnd: {
      x: toNumberOrUndefined(condition.line?.[1]?.[0]) ?? 1,
      y: toNumberOrUndefined(condition.line?.[1]?.[1]) ?? 1,
    },
    direction: condition.direction,
    minScore:
      condition.minScore === undefined || condition.minScore === null
        ? undefined
        : Number(condition.minScore),
    customModuleId: condition.moduleId,
    customConfigEntries: objectToEntries(condition.config),
  };
}

export function mapSummaryToEditorValues(
  summary?: AiPipelineSummary,
): PipelineEditorFormValues {
  if (!summary) {
    return buildDefaultEditorValues();
  }
  const { channelId, config } = summary;
  const sampling = (config.sampling ?? {}) as Recordable<any>;
  const annotation = (config.annotation ?? {}) as Recordable<any>;
  return {
    channelId,
    id: config.id ?? '',
    name: config.name ?? '',
    samplingType: inferSamplingType(sampling),
    everyNFrames:
      sampling.everyNFrames === undefined || sampling.everyNFrames === null
        ? 5
        : Number(sampling.everyNFrames),
    fps:
      sampling.fps === undefined || sampling.fps === null
        ? 5
        : Number(sampling.fps),
    roiEnabled: Boolean(config.roi),
    roiXMin: Number(config.roi?.xMin ?? 0),
    roiYMin: Number(config.roi?.yMin ?? 0),
    roiXMax: Number(config.roi?.xMax ?? 1),
    roiYMax: Number(config.roi?.yMax ?? 1),
    roiRegions: (config.roiRegions ?? []).map(
      (item) =>
        ({
          xMin: Number(item.xMin ?? 0),
          yMin: Number(item.yMin ?? 0),
          xMax: Number(item.xMax ?? 1),
          yMax: Number(item.yMax ?? 1),
        }) as RoiRect,
    ),
    stages: (config.stages ?? []).map((stage) => mapStageToForm(stage as Recordable<any>)),
    alarmRules: (config.alarmRules ?? []).map((rule) =>
      mapAlarmRuleToForm(rule as Recordable<any>),
    ),
    drawBboxes: Boolean(annotation.drawBboxes ?? true),
    drawLabels: Boolean(annotation.drawLabels ?? true),
    drawConfidence: Boolean(annotation.drawConfidence ?? true),
    drawTrackIds: Boolean(annotation.drawTrackIds ?? true),
    drawSegmentation: Boolean(annotation.drawSegmentation ?? true),
    segmentationAlpha: Number(annotation.segmentationAlpha ?? 0.4),
    segmentationBackgroundClass:
      annotation.segmentationBackgroundClass === undefined ||
        annotation.segmentationBackgroundClass === null
        ? undefined
        : Number(annotation.segmentationBackgroundClass),
    lineThickness: Number(annotation.lineThickness ?? 2),
    fontScale: Number(annotation.fontScale ?? 0.6),
    jpegQuality: Number(annotation.jpegQuality ?? 75),
    maxOutputDimension:
      annotation.maxOutputDimension === undefined ||
        annotation.maxOutputDimension === null
        ? undefined
        : Number(annotation.maxOutputDimension),
  };
}

function mapStageToPayload(stage: PipelineEditorStage): Recordable<any> {
  const preprocess = stage.preprocess;
  const postprocess = stage.postprocess;
  switch (stage.type) {
    case 'frame_transform':
      return {
        type: 'frame_transform',
        moduleId: stage.moduleId?.trim(),
        config: entriesToObject(stage.configEntries),
      };
    case 'inference':
      return {
        type: 'inference',
        modelId: stage.modelId?.trim(),
        confidenceThreshold: stage.confidenceThreshold ?? 0.5,
        nmsIouThreshold: stage.nmsIouThreshold,
        inputSize:
          stage.inputWidth && stage.inputHeight
            ? [stage.inputWidth, stage.inputHeight]
            : undefined,
        preprocess: stage.preprocessEnabled
          ? {
            resizeMode: preprocess.resizeMode,
            channelOrder: preprocess.channelOrder,
            padValue: preprocess.padValue,
            normalization: preprocess.normalizationPreset
              ? {
                preset: preprocess.normalizationPreset,
                mean:
                  preprocess.normalizationPreset === 'custom'
                    ? buildTriple(
                      preprocess.meanR,
                      preprocess.meanG,
                      preprocess.meanB,
                    )
                    : undefined,
                std:
                  preprocess.normalizationPreset === 'custom'
                    ? buildTriple(
                      preprocess.stdR,
                      preprocess.stdG,
                      preprocess.stdB,
                    )
                    : undefined,
              }
              : undefined,
          }
          : undefined,
        postprocess: stage.postprocessEnabled
          ? {
            type: postprocess.type,
            topK: postprocess.topK,
            applySoftmax: postprocess.applySoftmax,
            maxDetections: postprocess.maxDetections,
            numKeypoints: postprocess.numKeypoints,
            anomalyThreshold: postprocess.anomalyThreshold,
            nmsVariant: postprocess.nmsVariant,
            softNmsSigma: postprocess.softNmsSigma,
            detectionParallelThreshold: postprocess.detectionParallelThreshold,
            nmsPrescreenMultiplier: postprocess.nmsPrescreenMultiplier,
            classificationSmallClassFastPath:
              postprocess.classificationSmallClassFastPath,
            segmentationParallelMinPixels: postprocess.segmentationParallelMinPixels,
          }
          : undefined,
      };
    case 'tracker':
      return {
        type: 'tracker',
        algorithm:
          stage.algorithm === 'deep_sort'
            ? {
              type: 'deep_sort',
              reidModelId: stage.reidModelId?.trim(),
            }
            : {
              type: 'sort',
            },
        maxAge: stage.maxAge ?? 30,
      };
    case 'result_processor':
      return {
        type: 'result_processor',
        moduleId: stage.moduleId?.trim(),
        config: entriesToObject(stage.configEntries),
      };
    default:
      return {
        type: 'inference',
        modelId: '',
        confidenceThreshold: 0.5,
      };
  }
}

function mapAlarmRuleToPayload(rule: PipelineEditorAlarmRule): Recordable<any> {
  const condition: Recordable<any> = { type: rule.conditionType };
  switch (rule.conditionType) {
    case 'class_detected':
      condition.class = rule.className?.trim();
      condition.minConfidence = rule.minConfidence ?? 0.5;
      break;
    case 'count_exceeds':
      condition.class = rule.className?.trim() || undefined;
      condition.threshold = rule.threshold ?? 1;
      break;
    case 'zone_intrusion':
      condition.class = rule.className?.trim() || undefined;
      condition.zone = pointsToTuple(rule.zonePoints);
      break;
    case 'line_crossing':
      condition.class = rule.className?.trim() || undefined;
      condition.line = [
        [rule.lineStart.x, rule.lineStart.y],
        [rule.lineEnd.x, rule.lineEnd.y],
      ];
      condition.direction = rule.direction ?? 'any';
      break;
    case 'anomaly_detected':
      condition.minScore = rule.minScore ?? 0.5;
      break;
    case 'custom_wasm':
      condition.moduleId = rule.customModuleId?.trim();
      condition.config = entriesToObject(rule.customConfigEntries);
      break;
    default:
      break;
  }
  return {
    name: rule.name.trim(),
    severity: rule.severity,
    cooldownSecs: rule.cooldownSecs ?? 60,
    minDurationSecs: rule.minDurationSecs,
    condition,
  };
}

export function mapEditorValuesToPayload(
  values: PipelineEditorFormValues,
): { channelId: number; config: AiPipelineConfig } {
  const sampling: Recordable<any> = { type: values.samplingType };
  if (values.samplingType === 'fixed_interval') {
    sampling.everyNFrames = values.everyNFrames ?? 1;
  }
  if (values.samplingType === 'target_fps') {
    sampling.fps = values.fps ?? 5;
  }

  return {
    channelId: Number(values.channelId),
    config: {
      id: values.id.trim(),
      name: values.name.trim(),
      sampling,
      roi: values.roiEnabled
        ? {
          xMin: values.roiXMin ?? 0,
          yMin: values.roiYMin ?? 0,
          xMax: values.roiXMax ?? 1,
          yMax: values.roiYMax ?? 1,
        }
        : undefined,
      roiRegions: values.roiRegions.map((item) => ({
        xMin: item.xMin,
        yMin: item.yMin,
        xMax: item.xMax,
        yMax: item.yMax,
      })),
      stages: values.stages.map(mapStageToPayload),
      alarmRules: values.alarmRules.map(mapAlarmRuleToPayload),
      annotation: {
        drawBboxes: values.drawBboxes,
        drawLabels: values.drawLabels,
        drawConfidence: values.drawConfidence,
        drawTrackIds: values.drawTrackIds,
        drawSegmentation: values.drawSegmentation,
        segmentationAlpha: values.segmentationAlpha,
        segmentationBackgroundClass: values.segmentationBackgroundClass,
        lineThickness: values.lineThickness,
        fontScale: values.fontScale,
        jpegQuality: values.jpegQuality,
        maxOutputDimension: values.maxOutputDimension,
      },
    },
  };
}
