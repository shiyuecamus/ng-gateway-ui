import { $t } from '@vben/locales';

export const stageTypeOptions = [
  { label: () => $t('page.ai.pipeline.enums.stage.inference'), value: 'inference' },
  { label: () => $t('page.ai.pipeline.enums.stage.tracker'), value: 'tracker' },
  { label: () => $t('page.ai.pipeline.enums.stage.frameTransform'), value: 'frame_transform' },
  { label: () => $t('page.ai.pipeline.enums.stage.resultProcessor'), value: 'result_processor' },
];

export const trackerAlgorithmOptions = [
  { label: () => $t('page.ai.pipeline.enums.tracker.sort'), value: 'sort' },
  { label: () => $t('page.ai.pipeline.enums.tracker.deepSort'), value: 'deep_sort' },
];

export const alarmConditionTypeOptions = [
  { label: () => $t('page.ai.pipeline.enums.alarm.classDetected'), value: 'class_detected' },
  { label: () => $t('page.ai.pipeline.enums.alarm.countExceeds'), value: 'count_exceeds' },
  { label: () => $t('page.ai.pipeline.enums.alarm.zoneIntrusion'), value: 'zone_intrusion' },
  { label: () => $t('page.ai.pipeline.enums.alarm.lineCrossing'), value: 'line_crossing' },
  { label: () => $t('page.ai.pipeline.enums.alarm.anomalyDetected'), value: 'anomaly_detected' },
  { label: () => $t('page.ai.pipeline.enums.alarm.customWasm'), value: 'custom_wasm' },
];

export const samplingTypeOptions = [
  { label: 'Every Frame', value: 'every_frame' },
  { label: 'Fixed Interval', value: 'fixed_interval' },
  { label: 'Target FPS', value: 'target_fps' },
];

export const severityOptions = [
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
];

export const directionOptions = [
  { label: 'Any', value: 'any' },
  { label: 'Left to Right', value: 'left_to_right' },
  { label: 'Right to Left', value: 'right_to_left' },
  { label: 'Top to Bottom', value: 'top_to_bottom' },
  { label: 'Bottom to Top', value: 'bottom_to_top' },
];
