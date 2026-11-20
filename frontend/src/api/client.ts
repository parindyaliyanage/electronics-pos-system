import axios, { AxiosError } from "axios";
import { loadSession } from "../lib/session";

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const session = loadSession();
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

/**
 * Called when the server rejects the token (expired, password changed,
 * account deactivated). The auth provider registers a handler that signs the
 * user out and sends them to the login page.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(undefined, (error: AxiosError) => {
  const isLogin = error.config?.url?.includes("/auth/login");
  if (error.response?.status === 401 && !isLogin) onUnauthorized?.();
  return Promise.reject(error);
});

/**
 * A readable message from an API error. NestJS returns `message` as a string
 * or, for validation errors, an array of strings.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "Cannot reach the server. Check that the backend is running.";
    const message = (error.response.data as { message?: unknown } | undefined)?.message;
    if (Array.isArray(message)) return message.join(". ");
    if (typeof message === "string" && message) return message;
    if (error.response.status === 403) return "You don't have permission to do that.";
  }
  return fallback;
}
