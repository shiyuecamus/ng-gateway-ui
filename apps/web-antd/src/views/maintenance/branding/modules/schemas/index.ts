import type { VbenFormSchema as FormSchema } from '#/adapter/form';

import { $t } from '@vben/locales';

/**
 * Options used to build branding form schemas.
 */
export interface BrandingFormSchemaOptions {
  /**
   * Hook called before a logo file is added to the form model.
   *
   * Returning `false` will stop auto upload, while still keeping the file
   * selectable (depending on Upload behavior). The caller can also mark
   * file status as "removed" to ignore it.
   */
  beforeLogoSelect: (file: unknown) => boolean | Promise<boolean>;
  /**
   * Hook called before a favicon file is added to the form model.
   */
  beforeFaviconSelect: (file: unknown) => boolean | Promise<boolean>;
}

/**
 * Build branding maintenance page form schema.
 *
 * Notes:
 * - Upload fields are modeled as `fileList` in the form values.
 * - Actual upload requests should be performed by the caller on "Save".
 */
export function buildBrandingFormSchema(
  opts: BrandingFormSchemaOptions,
): FormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'title',
      label: $t('page.maintenance.branding.productName'),
      rules: 'required',
      componentProps: {
        clearable: true,
        placeholder: $t('ui.placeholder.inputWithName', {
          name: $t('page.maintenance.branding.productName'),
        }),
      },
    },
    {
      component: 'Upload',
      fieldName: 'logoFiles',
      label: $t('page.maintenance.branding.logo'),
      rules: 'required',
      componentProps: {
        maxCount: 1,
        multiple: false,
        // MB, handled by component adapter (ui.formRules.sizeLimit)
        maxSize: 10,
        listType: 'picture-card',
        accept: 'image/png,image/webp,image/jpeg',
        placeholder: $t('page.maintenance.branding.uploadLogo'),
        beforeUpload: opts.beforeLogoSelect,
      },
    },
    {
      component: 'Upload',
      fieldName: 'faviconFiles',
      label: $t('page.maintenance.branding.favicon'),
      rules: 'required',
      componentProps: {
        maxCount: 1,
        multiple: false,
        // 256KB ~= 0.25MB
        maxSize: 0.25,
        listType: 'picture-card',
        accept: 'image/x-icon,image/vnd.microsoft.icon,image/png',
        placeholder: $t('page.maintenance.branding.uploadFavicon'),
        beforeUpload: opts.beforeFaviconSelect,
      },
    },
  ];
}
