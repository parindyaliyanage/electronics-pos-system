import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import { clearSession, loadSession, saveSession, tokenExpiry, type Session, type SessionUser, type UserRole } from "./session";

export type SignOutReason = "manual" | "expired";

export interface AuthContextValue {
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  /** Swaps in a fresh token (after changing your own password the old one stops working). */
  adoptToken: (result: authApi.LoginResponse) => void;
  /** Re-reads the signed-in user's name/role from the server. */
  refreshUser: () => void;
  signOut: (reason?: SignOutReason) => void;
  hasRole: (...roles: UserRole[]) => boolean;
  /** Why the last session ended; the login page shows a notice for "expired". */
  signOutReason: SignOutReason | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);

  const signOut = useCallback((reason: SignOutReason = "manual") => {
    // Logout only needs to discard the token on the client (SRS FR1);
    // telling the server is best-effort so it can be audited.
    if (reason === "manual" && loadSession()) authApi.logout().catch(() => undefined);
    clearSession();
    setSession(null);
    setSignOutReason(reason);
  }, []);

  const adoptToken = useCallback((result: authApi.LoginResponse) => {
    const user: SessionUser = {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
    };
    const next: Session = {
      token: result.accessToken,
      user,
      expiresAt: tokenExpiry(result.accessToken) ?? Date.now() + 8 * 3600_000,
    };
    saveSession(next);
    setSession(next);
    setSignOutReason(null);
    return user;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    return adoptToken(await authApi.login(email, password));
  }, [adoptToken]);

  // The server rejected the token (expired, password changed, deactivated).
  useEffect(() => {
    setUnauthorizedHandler(() => signOut("expired"));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Sign out exactly when the token expires, even if the user is idle.
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => signOut("expired"), Math.max(session.expiresAt - Date.now(), 0));
    return () => window.clearTimeout(timer);
  }, [session, signOut]);

  // On page load, refresh the stored profile (name or role may have changed).
  // A rejected token is handled by the 401 handler above.
  const token = session?.token;
  const [profileVersion, setProfileVersion] = useState(0);
  const refreshUser = useCallback(() => setProfileVersion((v) => v + 1), []);
  useEffect(() => {
    if (!token) return;
    authApi.fetchMe().then((me) => {
      setSession((current) => {
        if (!current || current.token !== token) return current;
        const next = { ...current, user: { id: me.id, email: me.email, fullName: me.fullName, role: me.role } };
        saveSession(next);
        return next;
      });
    }).catch(() => undefined);
  }, [token, profileVersion]);

  // Signing out in one tab signs out every tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "smartretail.session" || event.key === null) setSession(loadSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    signIn,
    adoptToken,
    refreshUser,
    signOut,
    hasRole: (...roles) => !!session && roles.includes(session.user.role),
    signOutReason,
  }), [session, signIn, adoptToken, refreshUser, signOut, signOutReason]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
