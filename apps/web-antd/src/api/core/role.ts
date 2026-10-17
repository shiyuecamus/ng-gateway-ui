import type { IdType } from '@vben/types';

import { requestClient } from '#/api/request';

export interface RoleOption {
  id: number;
  code: string;
  name: string;
  status: number;
}

export function fetchRoleOptions() {
  return requestClient.get<RoleOption[]>('/role/list');
}

export function fetchUserRoleIds(userId: IdType) {
  return requestClient.get<number[]>(`/user/${userId}/roles`);
}

export function assignUserRoles(userId: IdType, roleIds: number[]) {
  return requestClient.put<boolean>(`/user/${userId}/roles`, roleIds);
}
