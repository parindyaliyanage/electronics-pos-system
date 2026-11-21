import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { resetUserPassword } from "../../api/users";
import type { ManagedUser } from "../../api/types";
import { Modal } from "../../components/Modal";
import { passwordProblem } from "./password-rules";

export function ResetPasswordDialog({ user, onDone, onClose }: { user: ManagedUser; onDone: () => void; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = passwordProblem(password);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      await resetUserPassword(user.id, password);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Reset password · ${user.fullName ?? user.email}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="reset-form" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Set new password"}</button>
        </>
      )}
    >
      <form id="reset-form" onSubmit={submit} noValidate>
        <p>They'll be signed out everywhere and must use the new password.</p>
        <div className={`field${attempted && problem ? " has-error" : ""}`}>
          <label htmlFor="r-password">New password</label>
          <input id="r-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          {attempted && problem ? <p className="field-error">{problem}</p> : <p className="muted small">8+ characters with a letter and a number.</p>}
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
