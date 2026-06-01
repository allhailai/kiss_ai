export type AuthLoginRequest = {
  username: string;
  password: string;
};

export type AuthLoginResponse = {
  ok: boolean;
  user: AuthUser;
};

export type AuthUser = {
  username: string;
  firstname: string;
  lastname: string;
  is_admin: boolean;
  is_system: boolean;
  token_version: number;
  created_at: string;
  updated_at: string;
};

export type AuthMeResponse = AuthUser;

export type AuthUserListResponse = {
  users: AuthUser[];
};

export type AuthCreateUserRequest = {
  username: string;
  password: string;
  firstname?: string;
  lastname?: string;
  is_admin?: boolean;
};

export type AuthUpdateUserRequest = {
  firstname?: string;
  lastname?: string;
  is_admin?: boolean;
};

export type AuthChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};
