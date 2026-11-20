import { apiClient } from "./client";
import type { SessionUser } from "../lib/session";

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: SessionUser & { createdAt: string };
}

export async function login(email: string, password: string) {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function fetchMe() {
  const { data } = await apiClient.get<SessionUser>("/auth/me");
  return data;
}

export async function logout() {
  await apiClient.post("/auth/logout");
}
