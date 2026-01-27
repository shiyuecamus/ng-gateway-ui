import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

export type WebResponse<T> = { code: number; data: T; message?: string };

export function useV1Api() {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const accessStore = useAccessStore();

  function buildHeaders(extra?: Record<string, string>) {
    const token = accessStore.accessToken;
    return {
      Authorization: token ? `Bearer ${token}` : '',
      'Accept-Language': preferences.app.locale,
      'Accept-Api-Version': 'v1',
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async function request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const resp = await fetch(`${apiURL}${path}`, {
      method,
      headers: buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await resp.json()) as WebResponse<T>;
    if (json.code !== 0) {
      throw new Error(json.message || `Request failed (code=${json.code})`);
    }
    return json.data;
  }

  /**
   * Request a binary (or streaming) response. Used by log ZIP download.
   *
   * Note: server may return JSON error body even with non-2xx status.
   */
  async function requestRaw(
    method: string,
    path: string,
    body?: any,
  ): Promise<Response> {
    return await fetch(`${apiURL}${path}`, {
      method,
      headers: buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return { apiURL, request, requestRaw };
}
