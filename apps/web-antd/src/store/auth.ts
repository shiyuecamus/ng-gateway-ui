import type { Recordable, UserInfo } from '@vben/types';

import type { AuthApi } from '#/api';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import { getUserInfoApi, loginApi, logoutApi } from '#/api';
import { $t } from '#/locales';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  /**
   * Performs the shared login workflow and stores the issued access token.
   */
  async function performLogin(
    params: AuthApi.LoginParams | Recordable<any>,
  ): Promise<null | UserInfo> {
    loginLoading.value = true;

    try {
      const { token } = await loginApi(params);

      if (!token) {
        return null;
      }

      accessStore.setAccessToken(token);

      const userInfo = await fetchUserInfo();

      if (userInfo?.nickname) {
        notification.success({
          description: `${$t('authentication.loginSuccessDesc')}:${userInfo.nickname}`,
          duration: 3,
          message: $t('authentication.loginSuccess'),
        });
      }

      return userInfo;
    } finally {
      loginLoading.value = false;
    }
  }

  /**
   * Asynchronously handles the form login process and post-login navigation.
   * @param params Login form payload.
   * @param onSuccess Optional callback for custom successful-login navigation.
   */
  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    const userInfo = await performLogin(params);

    if (userInfo) {
      if (accessStore.loginExpired) {
        accessStore.setLoginExpired(false);
      } else {
        onSuccess
          ? await onSuccess?.()
          : await router.push(preferences.app.defaultHomePath);
      }
    }

    return {
      userInfo,
    };
  }

  /**
   * Authenticates with credentials provided by URL query parameters.
   *
   * Navigation is intentionally controlled by the route guard so this method
   * only completes token persistence and user-info hydration.
   */
  async function urlAutoLogin(
    params: AuthApi.LoginParams,
  ): Promise<null | UserInfo> {
    const userInfo = await performLogin(params);

    if (!userInfo) {
      throw new Error($t('authentication.urlAutoLoginFailedDesc'));
    }

    return userInfo;
  }

  async function logout(redirect: boolean = true) {
    try {
      await logoutApi();
    } catch {
      // 不做任何处理
    }
    resetAllStores();
    accessStore.setLoginExpired(false);

    // 回登录页带上当前路由地址
    await router.replace({
      path: LOGIN_PATH,
      query: redirect
        ? {
            redirect: encodeURIComponent(router.currentRoute.value.fullPath),
          }
        : {},
    });
  }

  async function fetchUserInfo() {
    let userInfo: null | UserInfo = null;
    userInfo = await getUserInfoApi();
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
    urlAutoLogin,
  };
});
