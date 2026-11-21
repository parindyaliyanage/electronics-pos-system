import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { changeOwnPassword } from "../../api/users";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../lib/auth-context";
import { passwordProblem } from "./password-rules";

/** Any user changes their own password; the server returns a new token which replaces the old one. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { adoptToken } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const errors = {
    current: !current ? "Enter your current password." : undefined,
    next: passwordProblem(next) ?? (next && next === current ? "Choose a different password from the current one." : undefined),
    confirm: confirm !== next ? "The passwords don't match." : undefined,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      adoptToken(await changeOwnPassword(current, next));
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Modal title="Password changed" onClose={onClose} footer={<button type="button" className="button button-primary" onClick={onClose}>Done</button>}>
        <p>Your password has been changed. Other devices signed in with your old password have been signed out.</p>
      </Modal>
    );
  }

  const field = (id: keyof typeof errors, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <div className={`field${attempted && errors[id] ? " has-error" : ""}`}>
      <label htmlFor={`cp-${id}`}>{label}</label>
      <input id={`cp-${id}`} type="password" value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} />
      {attempted && errors[id] && <p className="field-error">{errors[id]}</p>}
    </div>
  );

  return (
    <Modal
      title="Change your password"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="change-password-form" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
        </>
      )}
    >
      <form id="change-password-form" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {field("current", "Current password", current, setCurrent, "current-password")}
        {field("next", "New password", next, setNext, "new-password")}
        {field("confirm", "Repeat new password", confirm, setConfirm, "new-password")}
        <p className="muted small">8+ characters with a letter and a number.</p>
      </form>
    </Modal>
  );
}
