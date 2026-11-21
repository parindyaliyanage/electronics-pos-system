import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { createUser, updateUser } from "../../api/users";
import type { ManagedUser, UserRoleName } from "../../api/types";
import { Modal } from "../../components/Modal";
import { passwordProblem } from "./password-rules";

interface Props {
  user?: ManagedUser;
  isSelf?: boolean;
  onSaved: (user: ManagedUser) => void;
  onClose: () => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** New user (email, name, role, first password) or edit (name, role). Email can't change (UpdateUserDto). */
export function UserFormDialog({ user, isSelf, onSaved, onClose }: Props) {
  const editing = !!user;
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [role, setRole] = useState<UserRoleName>(user?.role ?? "WORKER");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors: Record<string, string | undefined> = {
    email: editing ? undefined : !email.trim() ? "Enter an email address." : !EMAIL.test(email.trim()) ? "Enter a valid email address." : undefined,
    fullName: !fullName.trim() ? "Enter the person's name." : fullName.trim().length > 200 ? "Keep the name under 200 characters." : undefined,
    password: editing ? undefined : passwordProblem(password),
  };
  const show = (k: string) => attempted && errors[k] && <p className="field-error">{errors[k]}</p>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const changes: { fullName?: string; role?: UserRoleName } = {};
        if (fullName.trim() !== (user.fullName ?? "")) changes.fullName = fullName.trim();
        if (role !== user.role) changes.role = role;
        onSaved(Object.keys(changes).length ? await updateUser(user.id, changes) : user);
      } else {
        onSaved(await createUser({ email: email.trim(), fullName: fullName.trim(), role, password }));
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${user.fullName ?? user.email}` : "New user"}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="button button-primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create user"}</button>
        </>
      )}
    >
      <form id="user-form" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className={`field${attempted && errors.email ? " has-error" : ""}`}>
          <label htmlFor="u-email">Email (used to sign in)</label>
          <input id="u-email" type="email" value={email} disabled={editing} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          {editing ? <p className="muted small">Email can't be changed; create a new account instead.</p> : show("email")}
        </div>
        <div className={`field${attempted && errors.fullName ? " has-error" : ""}`}>
          <label htmlFor="u-name">Full name</label>
          <input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
          {show("fullName")}
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRoleName)}>
            <option value="WORKER">Worker: POS, customers, installment payments</option>
            <option value="ADMINISTRATOR">Administrator: everything, including reports and users</option>
          </select>
          {isSelf && <p className="muted small">You can't change your own role; ask another administrator.</p>}
        </div>
        {!editing && (
          <div className={`field${attempted && errors.password ? " has-error" : ""}`}>
            <label htmlFor="u-password">First password</label>
            <input id="u-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            {show("password") || <p className="muted small">8+ characters with a letter and a number. Give it to the person and ask them to change it after signing in.</p>}
          </div>
        )}
      </form>
    </Modal>
  );
}
