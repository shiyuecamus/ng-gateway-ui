import { requestClient } from '#/api/request';

/**
 * System branding management API (SYSTEM_ADMIN only).
 *
 * Note: Public read endpoints are not part of this module:
 * - `/branding.json`
 * - `/branding/logo`
 * - `/branding/favicon.ico`
 */
export namespace BrandingApi {
  export const base = '/branding';
  export const title = `${base}/title`;
  export const logo = `${base}/logo`;
  export const favicon = `${base}/favicon`;

  export interface UpdateTitlePayload {
    title: string;
  }
}

/**
 * Update global application title.
 */
export async function updateBrandingTitle(
  payload: BrandingApi.UpdateTitlePayload,
): Promise<void> {
  await requestClient.put(BrandingApi.title, payload);
}

/**
 * Upload and replace the global logo.
 */
export async function uploadBrandingLogo(file: File): Promise<void> {
  await requestClient.upload(BrandingApi.logo, { file });
}

/**
 * Upload and replace the global favicon.
 */
export async function uploadBrandingFavicon(file: File): Promise<void> {
  await requestClient.upload(BrandingApi.favicon, { file });
}
