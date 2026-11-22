// FR5 / FR6 — one installment plan: schedule, payments, receipts, reminders
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { fetchReceipt, getPlan, getReminders, listReceipts } from "../api/installments";
import { fetchSaleInvoice } from "../api/pos";
import type { Plan, ReceiptListItem, ReminderRecord } from "../api/types";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { PAYMENT_TYPE_LABEL, scheduleStatus } from "../features/customers/status";
import { owed } from "../features/installments/allocation";
import { CancelPlanDialog } from "../features/installments/CancelPlanDialog";
import { describeCancellation, planStatus, reminderLabel } from "../features/installments/plan-status";
import { RecordPaymentDialog } from "../features/installments/RecordPaymentDialog";
import { FREQUENCY_LABEL } from "../features/sales/installment-preview";
import { METHOD_LABEL } from "../features/sales/payment";
import { useAuth } from "../lib/auth-context";
import { formatDate, formatDateTime, formatDueDate, showPdf } from "../lib/documents";
import { formatCents, toCents } from "../lib/money";

export default function InstallmentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMINISTRATOR";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [receipts, setReceipts] = useState<ReceiptListItem[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [paying, setPaying] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // Receipts and reminders are secondary: a failure there shouldn't hide the plan.
  const loadExtras = useCallback(async (p: Plan) => {
    const [r, rem] = await Promise.allSettled([listReceipts(p.saleId), getReminders(p.id)]);
    if (r.status === "fulfilled") setReceipts(r.value);
    if (rem.status === "fulfilled") setReminders(rem.value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    getPlan(id)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        void loadExtras(p);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError({ message: errorMessage(err), notFound: status === 404 || status === 400 });
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadExtras]);

  if (error) {
    return (
      <div className="empty-state">
        <h2>{error.notFound ? "Installment plan not found" : "Could not load this plan"}</h2>
        <p>{error.notFound ? "This plan doesn't exist or the link is wrong." : error.message}</p>
        <Link className="button button-primary" to="/installments">Back to installments</Link>
      </div>
    );
  }
  if (!plan) return <p className="muted">Loading plan…</p>;

  const status = planStatus(plan);
  const active = plan.status === "ACTIVE";
  const totalPayable = toCents(plan.deposit) + plan.schedules.reduce((s, x) => s + toCents(x.amount), 0);
  const paid = plan.sale.payments.reduce((s, p) => s + toCents(p.amount), 0);
  const grandTotal = plan.sale.saleItems.reduce((s, i) => s + (toCents(i.unitPrice) - toCents(i.discount)) * i.quantity, 0);
  const reminderBySchedule = new Map(reminders.map((r) => [r.scheduleId, r]));
  const receiptByPayment = new Map(receipts.filter((r) => r.paymentId).map((r) => [r.paymentId!, r]));
  const firstUnpaid = plan.schedules.findIndex((s) => owed(s) > 0);
  const canOpenInvoice = isAdmin || plan.sale.cashierId === user?.id;

  const openDoc = async (key: string, fetchPdf: () => Promise<Blob>, fileName: string) => {
    setBusy(key);
    setDocError(null);
    try {
      await showPdf(fetchPdf, fileName, "open");
    } catch (err) {
      setDocError(errorMessage(err, "Could not open the document."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <button
        type="button"
        className="back-link"
        onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/installments"))}
      >
        ← Installments
      </button>

      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {plan.status === "CANCELLED" && (
        <div className="cancel-banner" role="note">
          <strong>Cancelled{plan.cancelledAt ? ` on ${formatDate(plan.cancelledAt)}` : ""}.</strong>{" "}
          <span>Reason: {describeCancellation(plan)}</span>
        </div>
      )}

      <section className="panel customer-header">
        <div>
          <div className="title-row">
            <h2>{plan.sale.customer.fullName}</h2>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className="muted plan-subtitle">
            {plan.sale.saleItems.map((i) => `${i.product.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}
          </p>
          <dl className="contact-list">
            <div><dt>Phone</dt><dd>{plan.sale.customer.phone}</dd></div>
            <div><dt>Sold</dt><dd>{formatDate(plan.sale.createdAt)}</dd></div>
            <div><dt>Plan</dt><dd>{plan.termCount} × {FREQUENCY_LABEL[plan.paymentFrequency].toLowerCase()}</dd></div>
            <div><dt>Interest</dt><dd>{(Number(plan.interestRate) * 100).toLocaleString("en-LK", { maximumFractionDigits: 2 })}% flat</dd></div>
          </dl>
        </div>
        <div className="header-actions">
          <Link className="button button-ghost" to={`/customers/${plan.sale.customer.id}`}>
            <Icon name="customers" size={18} /> Customer
          </Link>
          {canOpenInvoice && (
            <button type="button" className="button button-ghost" disabled={busy !== null} onClick={() => openDoc("invoice", () => fetchSaleInvoice(plan.saleId), "invoice.pdf")}>
              <Icon name="reports" size={18} /> {busy === "invoice" ? "Opening…" : "Invoice"}
            </button>
          )}
          {isAdmin && active && (
            <button type="button" className="button button-danger-ghost" onClick={() => setCancelling(true)}>
              Cancel plan
            </button>
          )}
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Total payable</div><div className="stat-value">{formatCents(totalPayable)}</div>
          <div className="stat-note">{formatCents(grandTotal)} + {formatCents(totalPayable - grandTotal)} interest</div></div>
        <div className="stat"><div className="stat-label">Paid so far</div><div className="stat-value">{formatCents(paid)}</div>
          <div className="stat-note">incl. {formatCents(toCents(plan.deposit))} deposit</div></div>
        <div className={`stat${status.tone === "danger" ? " stat-danger" : ""}`}>
          <div className="stat-label">{plan.status === "CANCELLED" ? "Unpaid when cancelled" : "Still owed"}</div>
          <div className="stat-value">{formatCents(toCents(plan.summary.outstandingBalance))}</div>
        </div>
        <div className="stat"><div className="stat-label">Next payment</div>
          <div className="stat-value">{active && plan.summary.nextDueDate ? formatCents(toCents(plan.summary.nextAmountDue)) : "—"}</div>
          <div className="stat-note">
            {active && plan.summary.nextDueDate ? `due ${formatDueDate(plan.summary.nextDueDate)}` : plan.status === "COMPLETED" ? `paid off ${plan.completedAt ? formatDate(plan.completedAt) : ""}` : plan.cancelledAt ? `cancelled ${formatDate(plan.cancelledAt)}` : ""}
          </div>
        </div>
      </div>

      <section className="panel">
        <h2 className="panel-title">Schedule</h2>
        <p className="muted small plan-explain">
          A payment is recorded against one installment; anything extra carries forward to the next ones.
          An unpaid installment becomes overdue after its due date plus the grace period.
        </p>
        <div className="table-wrap">
          <table className="data-table schedule-table">
            <thead>
              <tr>
                <th>#</th><th>Due date</th><th className="num hide-sm">Amount</th><th className="num hide-sm">Paid</th><th className="num">Still owed</th>
                <th>Status</th><th className="hide-sm">Reminder</th>{active && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {plan.schedules.map((s, i) => {
                const due = owed(s);
                const paidHere = toCents(s.amountPaid);
                const st = scheduleStatus(s.status, paidHere);
                const reminder = reminderLabel(reminderBySchedule.get(s.id));
                return (
                  <tr key={s.id} className={i === firstUnpaid && active ? "next-row" : ""}>
                    <td>{i + 1}</td>
                    <td className="nowrap">{formatDueDate(s.dueDate)}</td>
                    <td className="num hide-sm">{formatCents(toCents(s.amount), false)}</td>
                    <td className="num hide-sm">{paidHere ? formatCents(paidHere, false) : "—"}</td>
                    <td className="num">{due ? formatCents(due, false) : "—"}</td>
                    <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                    <td className="hide-sm small" title={reminder.title}>{reminder.text}</td>
                    {active && (
                      <td className="actions">
                        {due > 0 && (
                          <button type="button" className={`button button-small ${i === firstUnpaid ? "button-primary" : "button-ghost"}`} onClick={() => setPaying(i)}>
                            Record payment
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Payments</h2>
        {docError && <div className="alert alert-error" role="alert">{docError}</div>}
        <ul className="payment-list">
          {[...plan.sale.payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => {
            const appliedTo = plan.schedules
              .map((s, i) => ({ i, a: s.allocations.find((x) => x.paymentId === p.id) }))
              .filter((x) => x.a);
            const receipt = receiptByPayment.get(p.id);
            return (
              <li key={p.id}>
                <span>
                  <strong>{formatCents(toCents(p.amount))}</strong> · {PAYMENT_TYPE_LABEL[p.type]} · {METHOD_LABEL[p.method]}
                  <span className="muted small"> · {formatDateTime(p.createdAt)}</span>
                  {appliedTo.length > 0 && (
                    <span className="muted small applied-to">
                      {" "}→ {appliedTo.map(({ i, a }) => `#${i + 1} (${formatCents(toCents(a!.amountApplied), false)})`).join(", ")}
                    </span>
                  )}
                </span>
                {p.type === "INSTALLMENT" && (receipt ? (
                  <button type="button" className="link-button small" disabled={busy !== null}
                    onClick={() => openDoc(p.id, () => fetchReceipt(p.id), `${receipt.invoiceNumber}.pdf`)}>
                    {busy === p.id ? "Opening…" : `Receipt ${receipt.invoiceNumber}`}
                  </button>
                ) : <span className="muted small">Receipt issued by another user</span>)}
                {p.type === "DEPOSIT" && <span className="muted small">On the sale invoice</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {paying !== null && (
        <RecordPaymentDialog
          plan={plan}
          scheduleIndex={paying}
          onRecorded={(result) => {
            setPlan(result.plan);
            void loadExtras(result.plan);
          }}
          onClose={() => setPaying(null)}
        />
      )}
      {cancelling && (
        <CancelPlanDialog
          plan={plan}
          onCancelled={(updated) => {
            setCancelling(false);
            setPlan(updated);
            setNotice("The plan was cancelled. Its history is kept below.");
            void loadExtras(updated);
          }}
          onClose={() => setCancelling(false)}
        />
      )}
    </div>
  );
}
