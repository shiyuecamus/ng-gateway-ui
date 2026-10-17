import type { Recordable, UserInfo } from '@vben/types';

import type { AuthApi } from '#/api/core/auth';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import { loginApi, logoutApi } from '#/api/core/auth';
import { getUserInfoApi } from '#/api/core/user';
import { $t } from '#/locales';
import { requestId } from '#/shared/request-id';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);
  const mustChangePassword = ref(false);
  const sessionChecked = ref(false);
  let pendingLogin: null | { id: string; password: string; username: string } =
    null;

  /**
   * Performs the shared login workflow and stores the issued access token.
   */
  async function performLogin(
    params: AuthApi.LoginParams | Recordable<any>,
  ): Promise<null | UserInfo> {
    loginLoading.value = true;

    try {
      const username = String(params.username ?? '');
      const password = String(params.password ?? '');
      if (
        !pendingLogin ||
        pendingLogin.username !== username ||
        pendingLogin.password !== password
      )
        pendingLogin = { id: requestId(), username, password };
      const { token, mustChangePassword: mustChange } = await loginApi({
        username,
        password,
        requestId: pendingLogin.id,
      });
      pendingLogin = null;
      mustChangePassword.value = mustChange;

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
      if (mustChangePassword.value) {
        accessStore.setLoginExpired(false);
        await router.replace('/auth/password');
      } else if (accessStore.loginExpired) {
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

  async function clearSession(redirect: boolean = true) {
    resetAllStores();
    accessStore.setLoginExpired(false);
    await router.replace({
      path: LOGIN_PATH,
      query:
        redirect && !router.currentRoute.value.path.startsWith('/auth/')
          ? { redirect: encodeURIComponent(router.currentRoute.value.fullPath) }
          : {},
    });
  }

  async function logout(redirect: boolean = true) {
    const token = accessStore.accessToken;
    try {
      await logoutApi();
    } catch (error) {
      if (
        (error as { response?: { status?: number } }).response?.status !== 401
      )
        throw error;
    }
    if (accessStore.accessToken && accessStore.accessToken !== token) return;
    await clearSession(redirect);
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    mustChangePassword.value = userInfo.mustChangePassword;
    sessionChecked.value = true;
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
    pendingLogin = null;
    mustChangePassword.value = false;
    sessionChecked.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
    mustChangePassword,
    sessionChecked,
    clearSession,
  };
});
