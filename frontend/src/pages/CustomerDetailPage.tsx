// FR4 — one customer: details, purchase history and installment plans
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { customerHistory, fetchDocument } from "../api/customers";
import { fetchSaleInvoice } from "../api/pos";
import type { CreateCustomerResult, CustomerHistory, HistorySale } from "../api/types";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { saleStatus, scheduleStatus, PAYMENT_TYPE_LABEL } from "../features/customers/status";
import { describeCancellation } from "../features/installments/plan-status";
import { FREQUENCY_LABEL } from "../features/sales/installment-preview";
import { METHOD_LABEL } from "../features/sales/payment";
import { useAuth } from "../lib/auth-context";
import { formatDate, formatDateTime, formatDueDate, showPdf } from "../lib/documents";
import { formatCents, toCents } from "../lib/money";

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const warnings = (location.state as { warnings?: CreateCustomerResult["warnings"] } | null)?.warnings ?? [];
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setError(null);
    customerHistory(id)
      .then((data) => !cancelled && setHistory(data))
      .catch((err) => {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError({ message: errorMessage(err), notFound: status === 404 || status === 400 });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="empty-state">
        <h2>{error.notFound ? "Customer not found" : "Could not load this customer"}</h2>
        <p>{error.notFound ? "This customer doesn't exist or the link is wrong." : error.message}</p>
        <Link className="button button-primary" to="/customers">Back to customers</Link>
      </div>
    );
  }
  if (!history) return <p className="muted">Loading customer…</p>;

  const { customer, sales } = history;
  // Same rule as the dashboard and reports: only active plans are owed.
  const active = sales.filter((s) => s.installmentPlan?.status === "ACTIVE");
  const outstanding = active.reduce((sum, s) => sum + toCents(s.totals.outstanding), 0);
  const overdue = active.reduce((n, s) => n + s.installmentPlan!.schedules.filter((x) => x.status === "OVERDUE").length, 0);
  const purchases = sales.reduce((sum, s) => sum + toCents(s.totals.grandTotal), 0);
  const paid = sales.reduce((sum, s) => sum + toCents(s.totals.amountPaid), 0);

  return (
    <div className="stack">
      <button
        type="button"
        className="back-link"
        // Back to the filtered list when we came from it; otherwise to the list itself.
        onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/customers"))}
      >
        ← Customers
      </button>

      {warnings.map((w) => (
        <div key={w.code} className="alert alert-warning" role="status">
          <Icon name="alert" size={18} />
          <div>
            Customer registered. {w.message}:{" "}
            {w.matches.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <Link to={`/customers/${m.id}`}>{m.fullName}</Link>
              </span>
            ))}
            . Check this isn't the same person.
          </div>
        </div>
      ))}

      <section className="panel customer-header">
        <div>
          <h2>{customer.fullName}</h2>
          <dl className="contact-list">
            <div><dt>Phone</dt><dd>{customer.phone}</dd></div>
            <div><dt>Email</dt><dd>{customer.email ?? <span className="muted">—</span>}</dd></div>
            <div><dt>Address</dt><dd>{customer.address ?? <span className="muted">—</span>}</dd></div>
            <div><dt>Registered</dt><dd>{formatDate(customer.createdAt)}</dd></div>
          </dl>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate("/pos", { state: { customer } })}>
          <Icon name="pos" size={18} /> New sale for this customer
        </button>
      </section>

      <div className="stat-grid">
        <Stat label="Purchases" value={String(sales.length)} />
        <Stat label="Total purchases" value={formatCents(purchases)} />
        <Stat label="Paid to date" value={formatCents(paid)} />
        <Stat
          label="Outstanding on active plans"
          value={formatCents(outstanding)}
          note={overdue ? `${overdue} overdue installment${overdue > 1 ? "s" : ""}` : active.length ? `${active.length} active plan${active.length > 1 ? "s" : ""}` : undefined}
          tone={overdue ? "danger" : undefined}
        />
      </div>

      <section className="panel">
        <h2 className="panel-title">Purchase history</h2>
        {sales.length === 0
          ? <p className="muted">No purchases yet.</p>
          : <div className="sale-list">{sales.map((sale) => <SaleCard key={sale.id} sale={sale} />)}</div>}
      </section>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "danger" }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

function SaleCard({ sale }: { sale: HistorySale }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const status = saleStatus(sale);
  const plan = sale.installmentPlan;
  const invoice = sale.invoices.find((d) => d.type === "INVOICE");
  const isAdmin = user?.role === "ADMINISTRATOR";
  // Workers may only open documents they issued (FR1 / FR7); the server enforces it too.
  const canOpenInvoice = isAdmin || sale.cashierId === user?.id;
  const items = sale.saleItems.reduce((n, i) => n + i.quantity, 0);

  const open_ = useCallback(async (key: string, fetchPdf: () => Promise<Blob>, fileName: string) => {
    setBusy(key);
    setDocError(null);
    try {
      await showPdf(fetchPdf, fileName, "open");
    } catch (err) {
      setDocError(errorMessage(err, "Could not open the document."));
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <article className={`sale-card${open ? " open" : ""}`}>
      <button type="button" className="sale-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="sale-when">
          <span className="sale-date">{formatDateTime(sale.createdAt)}</span>
          <span className="muted small">
            {invoice?.invoiceNumber ?? "No invoice number yet"} · {items} item{items === 1 ? "" : "s"}
          </span>
        </span>
        <span className="sale-items-preview muted small">
          {sale.saleItems.map((i) => i.product.name).join(", ")}
        </span>
        <span className="sale-amount">{formatCents(toCents(sale.totals.grandTotal))}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className={`chevron${open ? " up" : ""}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="sale-detail">
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Discount / unit</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {sale.saleItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.product.name}
                      {item.serializedUnit && <div className="muted small mono">S/N {item.serializedUnit.serialNumber}</div>}
                    </td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatCents(toCents(item.unitPrice), false)}</td>
                    <td className="num">{toCents(item.discount) ? formatCents(toCents(item.discount), false) : "—"}</td>
                    <td className="num">{formatCents((toCents(item.unitPrice) - toCents(item.discount)) * item.quantity, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="detail-grid">
            <div>
              <h3>Payments</h3>
              <ul className="payment-list">
                {[...sale.payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => {
                  const receipt = sale.invoices.find((d) => d.paymentId === p.id);
                  const canOpen = receipt && (isAdmin || receipt.issuedById === user?.id);
                  return (
                    <li key={p.id}>
                      <span>
                        <strong>{formatCents(toCents(p.amount))}</strong> · {PAYMENT_TYPE_LABEL[p.type]} · {METHOD_LABEL[p.method]}
                        <span className="muted small"> · {formatDateTime(p.createdAt)}</span>
                      </span>
                      {receipt && (canOpen ? (
                        <button
                          type="button"
                          className="link-button small"
                          disabled={busy !== null}
                          onClick={() => open_(receipt.id, () => fetchDocument(receipt.id), `${receipt.invoiceNumber}.pdf`)}
                        >
                          {busy === receipt.id ? "Opening…" : `Receipt ${receipt.invoiceNumber}`}
                        </button>
                      ) : <span className="muted small">Receipt {receipt.invoiceNumber}</span>)}
                    </li>
                  );
                })}
              </ul>
              <p className="muted small">Served by {sale.cashier.email}</p>
            </div>

            <dl className="summary-list">
              <div><dt>Grand total</dt><dd>{formatCents(toCents(sale.totals.grandTotal))}</dd></div>
              {plan && <div><dt>Interest</dt><dd>{formatCents(toCents(sale.totals.interest))}</dd></div>}
              {plan && <div><dt>Total payable</dt><dd>{formatCents(toCents(sale.totals.totalPayable))}</dd></div>}
              <div><dt>Paid</dt><dd>{formatCents(toCents(sale.totals.amountPaid))}</dd></div>
              {plan && (
                <div className="strong">
                  <dt>{plan.status === "CANCELLED" ? "Unpaid when cancelled" : "Outstanding"}</dt>
                  <dd>{formatCents(toCents(sale.totals.outstanding))}</dd>
                </div>
              )}
            </dl>
          </div>

          {plan && (
            <div className="plan-block">
              <h3>
                Installment plan · {plan.termCount} × {FREQUENCY_LABEL[plan.paymentFrequency].toLowerCase()} ·{" "}
                {(Number(plan.interestRate) * 100).toLocaleString("en-LK", { maximumFractionDigits: 2 })}% interest
                {plan.cancelledAt && <span className="muted small"> · cancelled {formatDate(plan.cancelledAt)}</span>}
                {plan.completedAt && <span className="muted small"> · completed {formatDate(plan.completedAt)}</span>}
                {" "}<Link className="small plan-link" to={`/installments/${plan.id}`}>
                  {plan.status === "ACTIVE" ? "Open plan / record payment →" : "Open plan →"}
                </Link>
              </h3>
              {plan.status === "CANCELLED" && (
                <p className="cancel-banner small">Cancelled — reason: {describeCancellation(plan)}</p>
              )}
              <p className="muted small plan-explain">
                {formatCents(toCents(sale.totals.grandTotal))} − deposit {formatCents(toCents(plan.deposit))} ={" "}
                {formatCents(toCents(sale.totals.grandTotal) - toCents(plan.deposit))} financed, + {formatCents(toCents(sale.totals.interest))} interest ={" "}
                {formatCents(toCents(sale.totals.totalPayable) - toCents(plan.deposit))} in {plan.termCount} installments.
                A payment is recorded against one installment; anything extra carries forward to the next ones.
              </p>
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead><tr><th>#</th><th>Due date</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Still owed</th><th>Status</th></tr></thead>
                  <tbody>
                    {plan.schedules.map((s, i) => {
                      const amount = toCents(s.amount);
                      const paidCents = s.allocations.reduce((sum, a) => sum + toCents(a.amountApplied), 0);
                      const owed = Math.max(amount - paidCents, 0);
                      const st = scheduleStatus(s.status, paidCents);
                      return (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{formatDueDate(s.dueDate)}</td>
                          <td className="num">{formatCents(amount)}</td>
                          <td className="num">{paidCents ? formatCents(paidCents) : "—"}</td>
                          <td className="num">{owed ? formatCents(owed) : "—"}</td>
                          <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {docError && <div className="alert alert-error" role="alert">{docError}</div>}
          <div className="button-row">
            {canOpenInvoice ? (
              <button
                type="button"
                className="button button-ghost button-small"
                disabled={busy !== null}
                onClick={() => open_("invoice", () => fetchSaleInvoice(sale.id), `${invoice?.invoiceNumber ?? "invoice"}.pdf`)}
              >
                <Icon name="reports" size={16} /> {busy === "invoice" ? "Opening…" : "View invoice"}
              </button>
            ) : (
              <span className="muted small">The invoice can be opened by the cashier who made this sale or an Administrator.</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
