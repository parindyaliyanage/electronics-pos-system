// FR1 — user management (Administrator)
import { useEffect, useState } from "react";
import { errorMessage } from "../api/client";
import { listUsers, setUserActive } from "../api/users";
import type { ManagedUser, UserRoleName } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { ChangePasswordDialog } from "../features/users/ChangePasswordDialog";
import { ResetPasswordDialog } from "../features/users/ResetPasswordDialog";
import { UserFormDialog } from "../features/users/UserFormDialog";
import { useDebounced } from "../hooks/useDebounced";
import { useAuth } from "../lib/auth-context";
import { formatDate } from "../lib/documents";
import { roleLabel } from "../lib/session";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: ManagedUser }
  | { kind: "reset"; user: ManagedUser }
  | { kind: "toggle"; user: ManagedUser }
  | { kind: "own-password" };

export default function UsersPage() {
  const { user: me, refreshUser } = useAuth();
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 250);
  const [role, setRole] = useState<UserRoleName | "">("");
  const [status, setStatus] = useState<"active" | "inactive" | "">("active");
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listUsers({ search: search || undefined, role: role || undefined, active: status === "" ? undefined : status === "active" }, controller.signal)
      .then((rows) => {
        setUsers(rows);
        setError(null);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [search, role, status, reloadKey]);

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    setReloadKey((k) => k + 1);
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search-input toolbar-search">
          <Icon name="search" size={18} />
          <input type="search" aria-label="Search users" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="toolbar-select" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRoleName | "")}>
          <option value="">All roles</option>
          <option value="ADMINISTRATOR">Administrators</option>
          <option value="WORKER">Workers</option>
        </select>
        <select className="toolbar-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="">All</option>
        </select>
        <button type="button" className="button button-primary" onClick={() => setDialog({ kind: "create" })}>
          <Icon name="plus" size={18} /> New user
        </button>
      </div>

      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {users && (users.length === 0 ? <div className="empty-inline">No users match these filters.</div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th className="hide-sm">Email</th><th>Role</th><th>Status</th><th className="hide-sm">Added</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.fullName ?? "—"}</strong>{self && <span className="chip">You</span>}
                      <div className="muted small show-sm">{u.email}</div>
                    </td>
                    <td className="hide-sm">{u.email}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td><StatusBadge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Deactivated"}</StatusBadge></td>
                    <td className="hide-sm nowrap">{formatDate(u.createdAt)}</td>
                    <td className="actions row-actions">
                      <button type="button" className="link-button small" onClick={() => setDialog({ kind: "edit", user: u })}>Edit</button>
                      {self ? (
                        <button type="button" className="link-button small" onClick={() => setDialog({ kind: "own-password" })}>Change password</button>
                      ) : (
                        <>
                          <button type="button" className="link-button small" onClick={() => setDialog({ kind: "reset", user: u })}>Reset password</button>
                          <button type="button" className={`link-button small${u.active ? " danger-link" : ""}`} onClick={() => setDialog({ kind: "toggle", user: u })}>
                            {u.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {dialog?.kind === "create" && (
        <UserFormDialog onClose={() => setDialog(null)} onSaved={(u) => done(`${u.fullName ?? u.email} can now sign in as ${roleLabel(u.role)}.`)} />
      )}
      {dialog?.kind === "edit" && (
        <UserFormDialog
          user={dialog.user}
          isSelf={dialog.user.id === me?.id}
          onClose={() => setDialog(null)}
          onSaved={() => {
            if (dialog.user.id === me?.id) refreshUser();
            done("Changes saved.");
          }}
        />
      )}
      {dialog?.kind === "reset" && (
        <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} onDone={() => done(`Password reset for ${dialog.user.fullName ?? dialog.user.email}.`)} />
      )}
      {dialog?.kind === "own-password" && <ChangePasswordDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "toggle" && (
        <ConfirmDialog
          title={dialog.user.active ? `Deactivate ${dialog.user.fullName ?? dialog.user.email}?` : `Reactivate ${dialog.user.fullName ?? dialog.user.email}?`}
          confirmLabel={dialog.user.active ? "Deactivate" : "Reactivate"}
          danger={dialog.user.active}
          onConfirm={() => setUserActive(dialog.user.id, !dialog.user.active)}
          onDone={() => done(dialog.user.active ? "User deactivated." : "User reactivated.")}
          onClose={() => setDialog(null)}
        >
          {dialog.user.active
            ? <p>They're signed out immediately and can't sign in until reactivated. Their sales and history are kept.</p>
            : <p>They'll be able to sign in again with their existing password.</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}
