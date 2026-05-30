import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthUserListResponse,
  AuthUser,
  AuthChangePasswordRequest,
  AuthCreateUserRequest,
  AuthUpdateUserRequest,
} from "../contracts/api";
import { request } from "./request";

export const authApi = {
  login: (body: AuthLoginRequest) =>
    request<AuthLoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    }),

  me: () => request<AuthMeResponse>("/api/auth/me"),

  changeMyPassword: (body: AuthChangePasswordRequest) =>
    request<{ ok: boolean; message: string }>("/api/auth/me/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listUsers: () => request<AuthUserListResponse>("/api/auth/users"),

  getUser: (username: string) =>
    request<AuthUser>(`/api/auth/users/${encodeURIComponent(username)}`),

  createUser: (body: AuthCreateUserRequest) =>
    request<AuthUser>("/api/auth/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateUser: (username: string, body: AuthUpdateUserRequest) =>
    request<AuthUser>(`/api/auth/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteUser: (username: string) =>
    request<{ deleted: boolean; username: string }>(`/api/auth/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    }),

  changeUserPassword: (username: string, body: AuthChangePasswordRequest) =>
    request<{ ok: boolean; message: string }>(`/api/auth/users/${encodeURIComponent(username)}/password`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetUserPassword: (username: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>(`/api/auth/users/${encodeURIComponent(username)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),
};
