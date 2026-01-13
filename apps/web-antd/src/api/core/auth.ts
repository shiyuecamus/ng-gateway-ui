import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  export const base = '/auth';
  export const login = `${base}/login`;
  export const refresh = `${base}/refresh`;
  export const logout = `${base}/logout`;
  export const codes = `${base}/codes`;

  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
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

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>(AuthApi.login, data);
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  return baseRequestClient.post<AuthApi.RefreshTokenResult>(AuthApi.refresh, {
    withCredentials: true,
  });
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return baseRequestClient.post(AuthApi.logout, {
    withCredentials: true,
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>(AuthApi.codes);
}
