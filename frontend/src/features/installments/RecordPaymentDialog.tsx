import axios from "axios";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { fetchReceipt, recordPayment } from "../../api/installments";
import type { PaymentMethod, Plan, RecordPaymentResponse } from "../../api/types";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { formatDueDate, showPdf } from "../../lib/documents";
import { formatCents, fromCents, parseAmountInput, toCents } from "../../lib/money";
import { uuid } from "../../lib/uuid";
import { METHOD_LABEL } from "../sales/payment";
import { allocate, earlierUnpaid, maxPayable, owed } from "./allocation";

interface Props {
  plan: Plan;
  scheduleIndex: number;
  onRecorded: (result: RecordPaymentResponse) => void;
  onClose: () => void;
}

const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

export function RecordPaymentDialog({ plan, scheduleIndex, onRecorded, onClose }: Props) {
  const schedule = plan.schedules[scheduleIndex];
  const dueHere = owed(schedule);
  const max = maxPayable(plan.schedules, scheduleIndex);
  const [amountInput, setAmountInput] = useState((dueHere / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RecordPaymentResponse | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  // Same idempotency rule as checkout: reuse the key only while the request
  // may have reached the server and nothing about the payment has changed.
  const key = useRef<string | null>(null);
  useEffect(() => {
    key.current = null;
  }, [amountInput, method]);

  const parsed = parseAmountInput(amountInput);
  let amountError = parsed.error;
  if (!amountError && (parsed.cents === null || parsed.cents <= 0)) amountError = "Enter the amount received.";
  if (!amountError && parsed.cents! > max) {
    amountError = `The most this payment can be is ${formatCents(max)} (everything still owed from installment ${scheduleIndex + 1} onward).`;
  }
  const allocation = !amountError && parsed.cents ? allocate(plan.schedules, scheduleIndex, parsed.cents) : [];
  const skipped = earlierUnpaid(plan.schedules, scheduleIndex);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (amountError || !parsed.cents || submitting) return;
    key.current ??= uuid();
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPayment(plan.id, { scheduleId: schedule.id, amount: fromCents(parsed.cents), method }, key.current);
      key.current = null;
      setDone(result);
      onRecorded(result);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const message = errorMessage(err);
      if (status === undefined || status >= 500) {
        setError(`${message} Press Record payment again to retry; it will not be recorded twice.`);
      } else {
        key.current = null;
        setError(status === 409 && /already been processed/i.test(message)
          ? "This payment was already recorded (the earlier attempt went through). Close this window to see it."
          : message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const openReceipt = async () => {
      setReceiptBusy(true);
      try {
        await showPdf(() => fetchReceipt(done.payment.id), `${done.receipt.invoiceNumber}.pdf`, "open");
      } catch (err) {
        setError(errorMessage(err, "Could not open the receipt."));
      } finally {
        setReceiptBusy(false);
      }
    };
    return (
      <Modal
        title="Payment recorded"
        onClose={onClose}
        footer={(
          <>
            <button type="button" className="button button-ghost" disabled={receiptBusy} onClick={openReceipt}>
              <Icon name="reports" size={18} /> {receiptBusy ? "Opening…" : "View / print receipt"}
            </button>
            <button type="button" className="button button-primary" onClick={onClose}>Done</button>
          </>
        )}
      >
        <div className="payment-done">
          <span className="success-icon"><Icon name="check" size={26} /></span>
          <div>
            <p className="payment-done-amount">{formatCents(parsed.cents ?? 0)} · {METHOD_LABEL[method]}</p>
            <p className="muted">Receipt <strong className="mono">{done.receipt.invoiceNumber}</strong></p>
            <p className="muted">
              {done.plan.status === "COMPLETED"
                ? "The plan is now fully paid."
                : `Still owed on the plan: ${formatCents(toCents(done.plan.summary.outstandingBalance))}.`}
            </p>
          </div>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </Modal>
    );
  }

  return (
    <Modal
      title={`Record payment · installment ${scheduleIndex + 1}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="record-payment-form" className="button button-primary" disabled={submitting || !!amountError}>
            {submitting ? "Recording…" : "Record payment"}
          </button>
        </>
      )}
    >
      <form id="record-payment-form" onSubmit={submit} noValidate>
        <dl className="summary-list compact-list">
          <div><dt>Customer</dt><dd>{plan.sale.customer.fullName}</dd></div>
          <div><dt>Installment {scheduleIndex + 1} due</dt><dd>{formatDueDate(schedule.dueDate)}</dd></div>
          <div><dt>Still owed on it</dt><dd>{formatCents(dueHere)}</dd></div>
        </dl>

        {skipped.length > 0 && (
          <div className="alert alert-warning" role="status">
            <Icon name="alert" size={18} />
            <span>
              Installment{skipped.length > 1 ? "s" : ""} {skipped.map(({ i }) => i + 1).join(", ")} {skipped.length > 1 ? "are" : "is"} still unpaid.
              This payment only covers installment {scheduleIndex + 1} and later ones.
            </span>
          </div>
        )}

        <div className={`field${amountError && amountInput ? " has-error" : ""}`}>
          <label htmlFor="payment-amount">Amount received (LKR)</label>
          <input
            id="payment-amount"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            aria-invalid={!!amountError}
          />
          {amountError && amountInput
            ? <p className="field-error">{amountError}</p>
            : <p className="muted small">Up to {formatCents(max)}. A smaller amount is recorded as a part payment.</p>}
        </div>

        <fieldset className="method-group">
          <legend>Paid by</legend>
          <div className="chips">
            {METHODS.map((m) => (
              <label key={m} className={`chip-option${method === m ? " active" : ""}`}>
                <input type="radio" name="installment-method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                {METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>

        {allocation.length > 0 && (
          <div className="plan-preview">
            <p className="small"><strong>This payment will be applied to:</strong></p>
            <ul className="allocation-list">
              {allocation.map((a) => (
                <li key={a.scheduleId}>
                  <span>Installment {a.index + 1} · due {formatDueDate(plan.schedules[a.index].dueDate)}</span>
                  <span>
                    {formatCents(a.applied)} <span className="muted small">{a.settles ? "· settles it" : "· part payment"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
