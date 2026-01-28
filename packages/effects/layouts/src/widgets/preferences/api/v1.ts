import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import { defaultResponseInterceptor, RequestClient } from '@vben/request';
import type { InternalAxiosRequestConfig } from '@vben/request';
import { useAccessStore } from '@vben/stores';

/**
 * Standard WebResponse shape returned by ng-gateway APIs.
 */
export type WebResponse<T> = { code: number; data: T; message?: string };

/**
 * Create a v1 API helper for Preferences widgets.
 *
 * # Why this exists
 * Preferences blocks should not use ad-hoc `fetch` calls:
 * - Ensure consistent headers (token, locale, version)
 * - Ensure consistent error handling (WebResponse.code)
 * - Ensure timeouts to avoid "infinite pending" requests
 *
 * Note: for streaming/binary downloads we keep a dedicated `fetch` path because
 * we need the native `Response.body` stream for `pipeTo(...)`.
 */
export function useV1Api() {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const accessStore = useAccessStore();

  const client = new RequestClient({
    baseURL: apiURL,
    responseReturn: 'data',
    // Avoid “infinite pending” requests that can exhaust browser connection pool.
    timeout: 15_000,
  });

  client.addRequestInterceptor({
    fulfilled: async (config: InternalAxiosRequestConfig) => {
      const token = accessStore.accessToken;
      config.headers = config.headers ?? {};
      config.headers.Authorization = token ? `Bearer ${token}` : '';
      config.headers['Accept-Language'] = preferences.app.locale;
      config.headers['Accept-Api-Version'] = 'v1';
      return config;
    },
  });

  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  async function request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    return await client.request<T>(path, {
      method,
      ...(body === undefined ? {} : { data: body }),
    });
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
    const controller = new AbortController();
    const timeoutMs = 5 * 60_000;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = accessStore.accessToken;
      return await fetch(`${apiURL}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'Accept-Language': preferences.app.locale,
          'Accept-Api-Version': 'v1',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } finally {
      window.clearTimeout(timer);
    }
  }

  return { apiURL, request, requestRaw };
}

