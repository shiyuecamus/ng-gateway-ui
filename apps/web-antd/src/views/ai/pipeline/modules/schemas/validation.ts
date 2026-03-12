import type { Recordable } from '@vben/types';

export interface StageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the ordering and completeness constraints of pipeline stages.
 *
 * Rules enforced:
 * - FrameTransform stages must precede all Inference stages.
 * - Tracker stages must follow at least one Inference stage.
 * - ResultProcessor stages must follow at least one Inference stage.
 * - At least one Inference stage is required.
 */
export function validateStageOrder(
  stages: Recordable<any>[],
): StageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let hasInference = false;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage) continue;

    switch (stage.type) {
      case 'frame_transform': {
        if (hasInference) {
          errors.push(
            `Stage ${i + 1}: frame_transform must precede all inference stages`,
          );
        }
        break;
      }
      case 'inference': {
        hasInference = true;
        break;
      }
      case 'tracker': {
        if (!hasInference) {
          errors.push(`Stage ${i + 1}: tracker must follow an inference stage`);
        }
        break;
      }
      case 'result_processor': {
        if (!hasInference) {
          errors.push(
            `Stage ${i + 1}: result_processor must follow an inference stage`,
          );
        }
        break;
      }
    }
  }

  if (!hasInference && stages.length > 0) {
    errors.push('Pipeline requires at least one inference stage');
  }

  return { valid: errors.length === 0, errors, warnings };
}
