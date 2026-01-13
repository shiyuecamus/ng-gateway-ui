import type { Nullable } from '@vben/types';

import { preferences } from '@vben/preferences';
import { isNullOrUndefined } from '@vben-core/shared/utils';

/**
 * Represents backend-provided localized text payloads.
 */
export type UiText =
  | { kind: 'localized'; locales: Record<string, string> }
  | { kind: 'simple'; value: string };

function unique<T>(arr: T[]): T[] {
  const set = new Set<T>();
  const res: T[] = [];
  for (const item of arr) {
    if (!set.has(item)) {
      set.add(item);
      res.push(item);
    }
  }
  return res;
}

/**
 * Resolve UI text for the current locale with sensible fallbacks.
 */
export function resolveUiText(
  text: Nullable<UiText>,
  locale?: string,
  fallbacks?: string[],
): string {
  if (isNullOrUndefined(text)) return '';
  if (text.kind === 'simple') return text.value ?? '';

  const current = locale || preferences.app.locale || 'en-US';
  const chain: string[] = unique(
    [current, ...(fallbacks ?? ['en-US', 'zh-CN'])].filter(Boolean) as string[],
  );

  if (text.kind === 'localized') {
    const locales = text.locales || {};
    for (const lang of chain) {
      if (locales[lang]) return locales[lang];
      const foundKey = Object.keys(locales).find(
        (key) =>
          key.toLowerCase() === lang.toLowerCase() ||
          key.toLowerCase().startsWith(lang.toLowerCase()),
      );
      if (foundKey) return locales[foundKey] || '';
    }
    const any = Object.values(locales)[0];
    return typeof any === 'string' ? any : '';
  }

  return '';
}
