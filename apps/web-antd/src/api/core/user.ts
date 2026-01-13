import type {
  CommonPageRequest,
  CommonPageResponse,
  CommonStatus,
  CommonTimeRangeRequest,
  IdType,
  UserInfo,
} from '@vben/types';

import { requestClient } from '#/api/request';

export namespace UserApi {
  export const base = '/user';
  export const info = `${base}/userinfo`;
  export const page = `${base}/page`;
  export const deleteUser = (id: IdType) => `${base}/${id}`;
  export const getById = (id: IdType) => `${base}/detail/${id}`;
  export const changeStatus = `${base}/change-status`;
  export const resetPassword = `${base}/reset-password`;

  /** user page params */
  export interface UserPageParams
    extends CommonPageRequest,
      CommonTimeRangeRequest {
    name?: string;
    status?: (typeof CommonStatus)[keyof typeof CommonStatus];
  }
}

/**
 * get user info
 */
export async function getUserInfoApi() {
  return requestClient.get<UserInfo>(UserApi.info);
}

/**
 * fetch user page
 * @param params - User page params
 * @returns Promise with user page response
 */
export async function fetchUserPage(params: UserApi.UserPageParams) {
  return requestClient.get<CommonPageResponse<UserInfo>>(UserApi.page, {
    params,
  });
}

/**
 * create user
 * @param data - User data
 * @returns Promise with create user response
 */
export async function createUser(data: UserInfo) {
  return requestClient.post(UserApi.base, data);
}

/**
 * update user
 * @param data - User data
 * @returns Promise with update user response
 */
export async function updateUser(data: UserInfo) {
  return requestClient.put(UserApi.base, data);
}

/**
 * delete user
 * @param id - User ID
 * @returns Promise with delete response
 */
export async function deleteUser(id: IdType) {
  return requestClient.delete(UserApi.deleteUser(id));
}

/**
 * get user by id
 * @param id - User ID
 * @returns Promise with user response
 */
export async function getUserById(id: IdType) {
  return requestClient.get<UserInfo>(UserApi.getById(id));
}

/**
 * change user status
 * @param id - User ID
 * @param status - User status
 * @returns Promise with change status response
 */
export async function changeUserStatus(
  id: IdType,
  status: (typeof CommonStatus)[keyof typeof CommonStatus],
) {
  return requestClient.put(UserApi.changeStatus, {
    id,
    status,
  });
}

/**
 * reset user password
 * @param id - User ID
 * @param newPassword - User new password
 * @returns Promise with reset password response
 */
export async function resetUserPassword(id: IdType, newPassword: string) {
  return requestClient.put(UserApi.resetPassword, { id, newPassword });
}
