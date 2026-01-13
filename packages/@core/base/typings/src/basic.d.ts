interface BasicOption {
  label: string;
  value: string;
}

type SelectOption = BasicOption;

type TabOption = BasicOption;

interface SimpleRole {
  /**
   * 编码
   */
  code: string;
  /**
   * id
   */
  id: number | string;
}

interface BasicUserInfo {
  /**
   * 头像
   */
  avatar: string;
  /**
   * 邮箱
   */
  email?: string;
  /**
   * 用户id
   */
  id: number | string;
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 手机号码
   */
  phone?: string;
  /**
   * 用户角色
   */
  roles?: SimpleRole[];
  /**
   * 状态
   */
  status?: number;
  /**
   * 用户名
   */
  username: string;
}

type ClassType = Array<object | string> | object | string;

export type {
  BasicOption,
  BasicUserInfo,
  ClassType,
  SelectOption,
  SimpleRole,
  TabOption,
};
