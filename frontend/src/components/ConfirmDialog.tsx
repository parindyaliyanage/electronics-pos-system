import { useState, type ReactNode } from "react";
import { errorMessage } from "../api/client";
import { Modal } from "./Modal";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onDone: () => void;
  onClose: () => void;
}

/** Confirmation step for actions that can't be undone (SRS 3.2); shows the server's error if it refuses. */
export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onDone, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={busy} onClick={confirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="confirm-body">{children}</div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
    </Modal>
  );
}
