import type {
  LocationQuery,
  LocationQueryRaw,
  RouteLocationRaw,
  Router,
} from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { notification } from 'ant-design-vue';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';

let is_auto_login_consumed = false;

/**
 * Holds credentials extracted from URL query parameters.
 */
interface UrlAutoLoginCredentials {
  /** Plain text password from the inbound URL. */
  password: string;
  /** Plain text username from the inbound URL. */
  username: string;
}

/**
 * Extracts URL auto-login credentials only when both required values exist.
 *
 * The function intentionally ignores array values because duplicated query
 * parameters are ambiguous and should not trigger silent authentication.
 */
function pickAutoLoginCredentials(
  query: LocationQuery,
): null | UrlAutoLoginCredentials {
  const username = typeof query.username === 'string' ? query.username : '';
  const password = typeof query.password === 'string' ? query.password : '';

  if (!username || !password) {
    return null;
  }

  return { password, username };
}

/**
 * Removes sensitive auto-login credentials from a route query object.
 */
function stripCredentialsFromQuery(query: LocationQuery): LocationQueryRaw {
  const { password: _password, username: _username, ...cleaned_query } = query;
  return cleaned_query;
}

/**
 * Sanitizes redirect targets to keep navigation inside this SPA.
 */
function sanitizeRedirect(raw_redirect: unknown): null | string {
  if (typeof raw_redirect !== 'string' || raw_redirect.length === 0) {
    return null;
  }

  let decoded_redirect: string;
  try {
    decoded_redirect = decodeURIComponent(raw_redirect);
  } catch {
    return null;
  }

  if (!decoded_redirect.startsWith('/')) {
    return null;
  }

  if (decoded_redirect.startsWith('//')) {
    return null;
  }

  if (/^\s*javascript:/i.test(decoded_redirect)) {
    return null;
  }

  return decoded_redirect;
}

/**
 * Rewrites the visible browser URL before any network request can expose
 * credentials through history, screenshots, or long-lived address-bar state.
 */
function rewriteAddressBar(
  router: Router,
  path: string,
  query: LocationQueryRaw,
  hash: string,
) {
  const href = router.resolve({ hash, path, query }).href;
  history.replaceState(history.state, '', href);
}

/**
 * Creates a sanitized navigation target after URL credentials are consumed.
 */
function buildSanitizedNavigationTarget(
  router: Router,
  path: string,
  query: LocationQueryRaw,
  hash: string,
  redirect_target: null | string,
): RouteLocationRaw {
  const final_query: LocationQueryRaw = { ...query };
  delete final_query.redirect;

  if (redirect_target) {
    const resolved_redirect = router.resolve(redirect_target);

    return {
      ...resolved_redirect,
      query: {
        ...resolved_redirect.query,
        ...final_query,
      },
      replace: true,
    };
  }

  return {
    hash,
    path,
    query: final_query,
    replace: true,
  };
}

/**
 * Registers the URL auto-login guard.
 *
 * This guard must run before the access guard so unauthenticated users can
 * exchange URL credentials for a normal access token before route protection
 * redirects them to the login page.
 */
export function setupUrlAutoLoginGuard(router: Router) {
  router.beforeEach(async (to): Promise<RouteLocationRaw | true> => {
    if (is_auto_login_consumed) {
      return true;
    }

    const credentials = pickAutoLoginCredentials(to.query);
    if (!credentials) {
      return true;
    }

    is_auto_login_consumed = true;

    const cleaned_query = stripCredentialsFromQuery(to.query);
    rewriteAddressBar(router, to.path, cleaned_query, to.hash);

    const redirect_target = sanitizeRedirect(cleaned_query.redirect);
    const access_store = useAccessStore();

    if (access_store.accessToken) {
      return buildSanitizedNavigationTarget(
        router,
        to.path,
        cleaned_query,
        to.hash,
        redirect_target,
      );
    }

    const auth_store = useAuthStore();

    try {
      await auth_store.urlAutoLogin(credentials);
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : $t('authentication.urlAutoLoginFailedDesc');

      notification.error({
        description,
        duration: 5,
        message: $t('authentication.urlAutoLoginFailed'),
      });

      return { path: LOGIN_PATH, replace: true };
    }

    return buildSanitizedNavigationTarget(
      router,
      preferences.app.defaultHomePath,
      cleaned_query,
      to.hash,
      redirect_target,
    );
  });
}
