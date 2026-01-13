import { z } from '@vben/common-ui';
import { $t } from '@vben/locales';

/**
 * Creates a number validation rule with minimum value 0
 */
export function createNumberValidation(
  fieldName: string,
  defaultValue: number = 0,
  min: number = 0,
) {
  return z
    .number()
    .min(min, {
      message: $t('errors.mustBeGreaterThan0', {
        field: $t(fieldName),
      }),
    })
    .default(defaultValue);
}

/**
 * Creates a required string validation rule
 */
export function createRequiredStringValidation(
  fieldName: string,
  defaultValue: string | undefined = undefined,
) {
  return z
    .string()
    .nonempty({
      message: $t('errors.required', {
        field: $t(fieldName),
      }),
    })
    .default(defaultValue as string);
}
