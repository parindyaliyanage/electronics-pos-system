// Administrator overview (GET /dashboard/summary)
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { getDashboard } from "../api/reports";
import type { DashboardSummary, PaymentMethod } from "../api/types";
import { Icon } from "../components/Icon";
import { METHOD_LABEL } from "../features/sales/payment";
import { formatDueDate } from "../lib/documents";
import { formatCents, toCents } from "../lib/money";

const REFRESH_MS = 60_000;

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getDashboard()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Live figures: refresh every minute while the dashboard is open.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data) {
    return error
      ? <div className="alert alert-error" role="alert">{error} <button type="button" className="link-button" onClick={load}>Try again</button></div>
      : <p className="muted">Loading dashboard…</p>;
  }

  const { todaySales, receivedToday, installments, lowStock, overdue } = data;
  const methods = (Object.keys(receivedToday.byMethod) as PaymentMethod[]).filter((m) => toCents(receivedToday.byMethod[m]) > 0);
  const updated = new Intl.DateTimeFormat("en-LK", { timeStyle: "short" }).format(new Date(data.generatedAt));

  return (
    <div className="stack">
      <div className="dashboard-head">
        <p className="muted">Today, {formatDueDate(data.date)} · updated {updated}</p>
        <button type="button" className="button button-ghost button-small" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error && <div className="alert alert-error" role="alert">Couldn't refresh: {error}. Showing the last figures.</div>}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Today's sales</div>
          <div className="stat-value">{formatCents(toCents(todaySales.netRevenue))}</div>
          <div className="stat-note">{todaySales.count} sale{todaySales.count === 1 ? "" : "s"} · {todaySales.units} item{todaySales.units === 1 ? "" : "s"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Money received today</div>
          <div className="stat-value">{formatCents(toCents(receivedToday.total))}</div>
          <div className="stat-note">
            {methods.length ? methods.map((m) => `${METHOD_LABEL[m]} ${formatCents(toCents(receivedToday.byMethod[m]), false)}`).join(" · ") : "Nothing yet"}
          </div>
        </div>
        <Link to="/installments" className="stat stat-link">
          <div className="stat-label">Owed on installment plans</div>
          <div className="stat-value">{formatCents(toCents(installments.outstandingBalance))}</div>
          <div className="stat-note">{installments.activePlans} active plan{installments.activePlans === 1 ? "" : "s"}</div>
        </Link>
        <Link to="/installments?tab=OVERDUE" className={`stat stat-link${installments.overdueInstallments ? " stat-danger" : ""}`}>
          <div className="stat-label">Overdue installments</div>
          <div className="stat-value">{installments.overdueInstallments}</div>
          <div className="stat-note">
            {installments.overdueInstallments
              ? `${formatCents(toCents(installments.overdueAmount))} from ${installments.overdueCustomers} customer${installments.overdueCustomers === 1 ? "" : "s"}`
              : "None"}
          </div>
        </Link>
      </div>

      <div className="dashboard-lists">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Overdue installments</h2>
            {overdue.count > overdue.items.length && <Link className="small" to="/installments?tab=OVERDUE">See all {overdue.count} →</Link>}
          </div>
          {overdue.items.length === 0 ? <p className="muted">No overdue installments.</p> : (
            <table className="data-table compact clickable-rows">
              <thead><tr><th>Customer</th><th>Was due</th><th className="num">Still owed</th></tr></thead>
              <tbody>
                {overdue.items.map((o) => (
                  <tr key={o.scheduleId}>
                    <td>
                      <Link to={`/installments/${o.planId}`}>{o.customer.fullName}</Link>
                      <div className="muted small">{o.customer.phone}</div>
                    </td>
                    <td className="nowrap">{formatDueDate(o.dueDate)}<div className="muted small">{o.daysOverdue} days ago</div></td>
                    <td className="num">{formatCents(toCents(o.outstanding), false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Low stock</h2>
            {lowStock.count > lowStock.items.length && <Link className="small" to="/products">{lowStock.count} products →</Link>}
          </div>
          {lowStock.items.length === 0 ? <p className="muted">Everything is above its low-stock level.</p> : (
            <table className="data-table compact">
              <thead><tr><th>Product</th><th className="num">In stock</th><th className="num">Alert below</th></tr></thead>
              <tbody>
                {lowStock.items.map((p) => (
                  <tr key={p.productId}>
                    <td>
                      <Link to={`/products/${p.productId}`}>{p.name}</Link>
                      <div className="muted small">{p.category}</div>
                    </td>
                    <td className={`num ${p.stock === 0 ? "qty-out" : ""}`}>{p.stock}</td>
                    <td className="num">{p.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="quick-links">
        <Link to="/pos" className="button button-ghost"><Icon name="pos" size={18} /> New sale</Link>
        <Link to="/reports" className="button button-ghost"><Icon name="reports" size={18} /> Reports</Link>
        <Link to="/products" className="button button-ghost"><Icon name="products" size={18} /> Products</Link>
      </div>
    </div>
  );
}
