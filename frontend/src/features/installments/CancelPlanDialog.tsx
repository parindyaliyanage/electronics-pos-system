import { useState } from "react";
import { errorMessage } from "../../api/client";
import { cancelPlan } from "../../api/installments";
import type { CancelReason, Plan } from "../../api/types";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { formatCents, toCents } from "../../lib/money";
import { CANCEL_REASON_LABEL } from "./plan-status";

interface Props {
  plan: Plan;
  onCancelled: (plan: Plan) => void;
  onClose: () => void;
}

const REASONS = Object.keys(CANCEL_REASON_LABEL) as CancelReason[];
const NOTE_MAX = 500;

/** SRS 3.2: an action that can't be undone needs an explicit confirmation step. */
export function CancelPlanDialog({ plan, onCancelled, onClose }: Props) {
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same rules as CancelInstallmentPlanDto.
  const reasonError = !reason ? "Choose why the plan is being cancelled." : undefined;
  const noteError = reason === "OTHER" && !note.trim()
    ? "Describe the reason."
    : note.trim().length > NOTE_MAX ? `Keep the note under ${NOTE_MAX} characters.` : undefined;
  const confirmed = confirmText.trim().toUpperCase() === "CANCEL";

  const submit = async () => {
    setAttempted(true);
    if (reasonError || noteError || !confirmed || busy || !reason) return;
    setBusy(true);
    setError(null);
    try {
      onCancelled(await cancelPlan(plan.id, { reason, ...(note.trim() ? { note: note.trim() } : {}) }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Cancel installment plan?"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Keep plan</button>
          <button type="button" className="button button-danger" disabled={!confirmed || busy} onClick={submit}>
            {busy ? "Cancelling…" : "Cancel plan"}
          </button>
        </>
      )}
    >
      <div className="alert alert-warning" role="status">
        <Icon name="alert" size={18} />
        <span>This can't be undone.</span>
      </div>
      <p>
        Cancelling {plan.sale.customer.fullName}'s plan with <strong>{formatCents(toCents(plan.summary.outstandingBalance))}</strong> still owed:
      </p>
      <ul className="consequences">
        <li>No more payments can be recorded on it, and reminders stop.</li>
        <li>The unpaid balance is no longer counted as outstanding on the dashboard and reports.</li>
        <li>Nothing is deleted: the sale, payments, receipts and schedule stay in the history.</li>
      </ul>

      <div className={`field${attempted && reasonError ? " has-error" : ""}`}>
        <label htmlFor="cancel-reason">Reason</label>
        <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value as CancelReason)}>
          <option value="" disabled>Choose a reason…</option>
          {REASONS.map((r) => <option key={r} value={r}>{CANCEL_REASON_LABEL[r]}</option>)}
        </select>
        {attempted && reasonError && <p className="field-error">{reasonError}</p>}
      </div>
      <div className={`field${(attempted || note) && noteError ? " has-error" : ""}`}>
        <label htmlFor="cancel-note">{reason === "OTHER" ? "Details" : "Note (optional)"}</label>
        <textarea
          id="cancel-note"
          rows={3}
          maxLength={NOTE_MAX + 50}
          placeholder={reason === "ITEM_RETURNED" ? "e.g. phone returned in good condition" : "Anything the next person should know"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {(attempted || note) && noteError
          ? <p className="field-error">{noteError}</p>
          : <p className="muted small">{note.trim().length}/{NOTE_MAX}</p>}
      </div>
      <div className="field">
        <label htmlFor="confirm-cancel">Type CANCEL to confirm</label>
        <input id="confirm-cancel" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
    </Modal>
  );
}
