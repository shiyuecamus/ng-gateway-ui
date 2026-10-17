import { requestClient } from '#/api/request';

export namespace AuthApi {
  export const base = '/auth';
  export const login = `${base}/login`;
  export const logout = `${base}/logout`;

  /** 登录接口参数 */
  export interface LoginParams {
    requestId: string;
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    mustChangePassword: boolean;
    jti?: string;
    sub: string;
    iss: string;
    aud: string[] | undefined;
    exp: number;
    nbf: number;
    iat: number;
    user_id: string;
    username: string;
    token: string;
    access_token_expire: number;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>(AuthApi.login, data);
}

/** Revoke the actual authenticated session before clearing local state. */
export async function logoutApi() {
  return requestClient.post<boolean>(AuthApi.logout);
}

/** A successful password change invalidates every previous session. */
export async function changePasswordApi(
  oldPassword: string,
  newPassword: string,
) {
  return requestClient.put<boolean>('/auth/password', {
    oldPassword,
    newPassword,
  });
}
