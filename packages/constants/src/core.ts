/**
 * @zh_CN 登录页面 url 地址
 */
export const LOGIN_PATH = '/auth/login';

export interface LanguageOption {
  label: string;
  value: 'en-US' | 'zh-CN';
}

/**
 * Supported languages
 */
export const SUPPORT_LANGUAGES: LanguageOption[] = [
  {
    label: '简体中文',
    value: 'zh-CN',
  },
  {
    label: 'English',
    value: 'en-US',
  },
];

/**
 * Form open types
 */

export enum FormOpenType {
  CREATE = 'create',
  EDIT = 'edit',
}

/**
 * Form open data
 */
export interface FormOpenData {
  id?: number | string;
  type: FormOpenType;
}
