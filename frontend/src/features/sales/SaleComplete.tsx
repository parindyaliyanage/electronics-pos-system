import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { fetchSaleInvoice } from "../../api/pos";
import type { CheckoutResponse } from "../../api/types";
import { Icon } from "../../components/Icon";
import { showPdf } from "../../lib/documents";
import { formatCents, toCents } from "../../lib/money";
import { FREQUENCY_LABEL } from "./installment-preview";
import { METHOD_LABEL } from "./payment";

interface Props {
  sale: CheckoutResponse;
  change: number | null;
  onNewSale: () => void;
}

export function SaleComplete({ sale, change, onNewSale }: Props) {
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const newSaleRef = useRef<HTMLButtonElement>(null);
  const payment = sale.payments[0];
  const plan = sale.installmentPlan;

  useEffect(() => newSaleRef.current?.focus(), []);

  const invoice = async (mode: "open" | "download") => {
    setBusy(mode);
    setError(null);
    try {
      await showPdf(() => fetchSaleInvoice(sale.id), `${sale.invoice.invoiceNumber}.pdf`, mode);
    } catch (err) {
      setError(errorMessage(err, "Could not load the invoice."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel sale-complete" aria-live="polite">
      <div className="sale-complete-head">
        <span className="success-icon"><Icon name="check" size={28} /></span>
        <div>
          <h2>Sale complete</h2>
          <p className="muted">
            Invoice <strong className="mono">{sale.invoice.invoiceNumber}</strong> · {sale.customer.fullName}
          </p>
        </div>
      </div>

      <dl className="summary-list">
        <div><dt>Items</dt><dd>{sale.saleItems.reduce((n, i) => n + i.quantity, 0)}</dd></div>
        <div><dt>Subtotal</dt><dd>{formatCents(toCents(sale.totals.subtotal))}</dd></div>
        {toCents(sale.totals.totalDiscount) > 0 && (
          <div><dt>Discount</dt><dd>− {formatCents(toCents(sale.totals.totalDiscount))}</dd></div>
        )}
        <div className="strong"><dt>Grand total</dt><dd>{formatCents(toCents(sale.totals.grandTotal))}</dd></div>
        <div>
          <dt>{plan ? "Deposit paid" : "Paid"} ({METHOD_LABEL[payment.method]})</dt>
          <dd>{formatCents(toCents(sale.totals.amountPaid))}</dd>
        </div>
        {change !== null && change > 0 && <div className="strong"><dt>Change</dt><dd>{formatCents(change)}</dd></div>}
      </dl>

      {plan && (
        <div className="schedule">
          <h3>
            Installment plan · {plan.termCount} {FREQUENCY_LABEL[plan.paymentFrequency].toLowerCase()} payments
          </h3>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead><tr><th>#</th><th>Due date</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {plan.schedules.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.dueDate.slice(0, 10)}</td>
                    <td className="num">{formatCents(toCents(s.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="button-row">
        <button type="button" className="button button-ghost" disabled={busy !== null} onClick={() => invoice("open")}>
          <Icon name="reports" size={18} /> {busy === "open" ? "Opening…" : "View / print invoice"}
        </button>
        <button type="button" className="button button-ghost" disabled={busy !== null} onClick={() => invoice("download")}>
          <Icon name="download" size={18} /> {busy === "download" ? "Downloading…" : "Download PDF"}
        </button>
        <button type="button" ref={newSaleRef} className="button button-primary" onClick={onNewSale}>
          <Icon name="plus" size={18} /> New sale
        </button>
      </div>
    </section>
  );
}
