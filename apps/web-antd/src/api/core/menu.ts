import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

export namespace MenuApi {
  export const base = '/menu';
  export const all = `${base}/all`;
  export const accessable = `${base}/accessable`;
}

/**
 * 获取用户所有菜单
 */
export async function getAllMenusApi() {
  return requestClient.get<RouteRecordStringComponent[]>(MenuApi.all);
}

/**
 * 获取用户所有可访问菜单
 */
export async function getAccessableMenus() {
  return requestClient.get<Array<RouteRecordStringComponent>>(
    MenuApi.accessable,
  );
}
