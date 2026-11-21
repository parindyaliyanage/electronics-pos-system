import type { IconName } from "../components/Icon";
import type { UserRole } from "./session";

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  roles: UserRole[];
}

const BOTH: UserRole[] = ["ADMINISTRATOR", "WORKER"];
const ADMIN: UserRole[] = ["ADMINISTRATOR"];

/**
 * The left-hand menu (SRS 3.9.1), filtered by role. It mirrors the backend's
 * @Roles guards: hiding a link is only a convenience, the server still checks
 * every request (SRS FR1).
 */
export const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ADMIN },
  { path: "/pos", label: "Point of Sale", icon: "pos", roles: BOTH },
  { path: "/products", label: "Products", icon: "products", roles: BOTH },
  { path: "/customers", label: "Customers", icon: "customers", roles: BOTH },
  { path: "/installments", label: "Installments", icon: "installments", roles: BOTH },
  { path: "/reports", label: "Reports", icon: "reports", roles: ADMIN },
  { path: "/users", label: "Users", icon: "users", roles: ADMIN },
  { path: "/settings", label: "Settings", icon: "settings", roles: ADMIN },
];

export const navFor = (role: UserRole) => NAV_ITEMS.filter((item) => item.roles.includes(role));

/** True when `path` belongs to a screen this role may open. */
export const canOpen = (role: UserRole, path: string) =>
  NAV_ITEMS.some((item) => (path === item.path || path.startsWith(`${item.path}/`)) && item.roles.includes(role));
