import { useEffect, useState } from "react";
import { ChangePasswordDialog } from "../features/users/ChangePasswordDialog";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { APP_NAME } from "../lib/constants";
import { displayName, initials } from "../lib/formatting";
import { navFor } from "../lib/navigation";
import { roleLabel } from "../lib/session";
import { Icon } from "./Icon";

/** Signed-in shell: role-scoped left menu, top bar with the user, page content. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!user) return null;
  const name = displayName(user);
  const items = navFor(user.role);
  const current = items.find((item) => location.pathname.startsWith(item.path));

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">SR</span>
          <span className="brand-name">{APP_NAME}</span>
          <button type="button" className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="role-badge">{roleLabel(user.role)}</span>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-button menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <h1 className="topbar-title">{current?.label ?? APP_NAME}</h1>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">{initials(name)}</span>
            <span className="user-text">
              <span className="user-name">{name}</span>
              <span className="user-role">{roleLabel(user.role)}</span>
            </span>
            <button type="button" className="icon-button" title="Change password" aria-label="Change password" onClick={() => setChangingPassword(true)}>
              <Icon name="key" size={18} />
            </button>
            <button type="button" className="button button-ghost" onClick={() => signOut()}>
              <Icon name="logout" size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      </div>
    </div>
  );
}
