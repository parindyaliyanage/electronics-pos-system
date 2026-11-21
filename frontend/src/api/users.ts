import { apiClient } from "./client";
import type { LoginResponse } from "./auth";
import type { ManagedUser, UserRoleName } from "./types";

export async function listUsers(params: { search?: string; role?: UserRoleName; active?: boolean }, signal?: AbortSignal) {
  const { data } = await apiClient.get<ManagedUser[]>("/users", { params, signal });
  return data;
}

export async function createUser(input: { email: string; fullName: string; role: UserRoleName; password: string }) {
  const { data } = await apiClient.post<ManagedUser>("/users", input);
  return data;
}

export async function updateUser(id: string, input: { fullName?: string; role?: UserRoleName }) {
  const { data } = await apiClient.patch<ManagedUser>(`/users/${id}`, input);
  return data;
}

export async function setUserActive(id: string, active: boolean) {
  const { data } = await apiClient.patch<ManagedUser>(`/users/${id}/${active ? "activate" : "deactivate"}`);
  return data;
}

export async function resetUserPassword(id: string, password: string) {
  const { data } = await apiClient.patch<ManagedUser>(`/users/${id}/password`, { password });
  return data;
}

/** Any signed-in user. Returns a NEW token: tokens issued before the change stop working. */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const { data } = await apiClient.post<LoginResponse>("/auth/change-password", { currentPassword, newPassword });
  return data;
}
