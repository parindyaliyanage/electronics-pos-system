import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import type { UserRole } from "../lib/session";
import { Icon } from "./Icon";

/** Sends signed-out visitors to /login, remembering where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Shows a "no access" message when the signed-in role may not open this screen. */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Icon name="lock" size={28} /></span>
        <h2>Administrators only</h2>
        <p>This screen is only available to Administrators. Use the menu to go to a screen you can access.</p>
      </div>
    );
  }
  return <>{children}</>;
}
