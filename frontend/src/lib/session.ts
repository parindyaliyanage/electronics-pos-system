export type UserRole = "ADMINISTRATOR" | "WORKER";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
}

export interface Session {
  token: string;
  user: SessionUser;
  /** Token expiry, epoch milliseconds (from the JWT's `exp` claim). */
  expiresAt: number;
}

const STORAGE_KEY = "smartretail.session";

/** Reads `exp` from a JWT without verifying it (the server verifies every request). */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.token || !session.user || session.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or blocked storage: the session still works until the tab closes.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const roleLabel = (role: UserRole) => (role === "ADMINISTRATOR" ? "Administrator" : "Worker");

/** Where each role lands after signing in. */
export const homePath = (role: UserRole) => (role === "ADMINISTRATOR" ? "/dashboard" : "/pos");
