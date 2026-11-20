// FR5 — installment plans and schedules (FR6 overdue list for Administrators)
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { getCustomer, searchCustomers } from "../api/customers";
import { listOverdue, listPlans } from "../api/installments";
import type { Customer, OverdueItem, Page, Plan, PlanStatus } from "../api/types";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { planStatus } from "../features/installments/plan-status";
import { FREQUENCY_LABEL } from "../features/sales/installment-preview";
import { useDebounced } from "../hooks/useDebounced";
import { useAuth } from "../lib/auth-context";
import { formatDate, formatDueDate } from "../lib/documents";
import { formatCents, toCents } from "../lib/money";

const LIMIT = 20;
type Tab = PlanStatus | "OVERDUE" | "ALL";
const TABS: Array<{ id: Tab; label: string; adminOnly?: boolean }> = [
  { id: "ACTIVE", label: "Active" },
  { id: "OVERDUE", label: "Overdue", adminOnly: true },
  { id: "COMPLETED", label: "Paid off" },
  { id: "CANCELLED", label: "Cancelled" },
  { id: "ALL", label: "All" },
];

export default function InstallmentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMINISTRATOR";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = (params.get("tab") as Tab) || "ACTIVE";
  const tab: Tab = TABS.some((t) => t.id === requested && (!t.adminOnly || isAdmin)) ? requested : "ACTIVE";
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const customerId = params.get("customer") ?? undefined;

  const [plans, setPlans] = useState<Page<Plan> | null>(null);
  const [overdue, setOverdue] = useState<Page<OverdueItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const update = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {};
    const all = { tab: tab === "ACTIVE" ? undefined : tab, customer: customerId, page: undefined as string | undefined, ...next };
    for (const [k, v] of Object.entries(all)) if (v) merged[k] = v;
    setParams(merged);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const request = tab === "OVERDUE"
      ? listOverdue({ page, limit: LIMIT }, controller.signal).then((d) => { setOverdue(d); setPlans(null); })
      : listPlans({ status: tab === "ALL" ? undefined : tab, customerId, page, limit: LIMIT }, controller.signal).then((d) => { setPlans(d); setOverdue(null); });
    request
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [tab, page, customerId]);

  return (
    <section className="panel">
      <div className="tabs" role="tablist" aria-label="Plan status">
        {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => update({ tab: t.id === "ACTIVE" ? undefined : t.id, customer: t.id === "OVERDUE" ? undefined : customerId })}
          >
            {t.label}
          </button>
        ))}
        {loading && <span className="spinner" aria-label="Loading" />}
      </div>

      {tab !== "OVERDUE" && (
        <div className="toolbar">
          <CustomerFilter customerId={customerId} onChange={(id) => update({ customer: id })} />
          <Link to="/pos" className="button button-ghost">
            <Icon name="plus" size={18} /> New installment sale
          </Link>
        </div>
      )}

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {plans && (plans.data.length === 0 ? (
        <div className="empty-inline">
          {customerId ? "This customer has no plans in this list." : tab === "ACTIVE" ? "No active installment plans." : "Nothing here."}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="hide-sm">Items</th>
                  <th className="hide-sm">Sold</th>
                  <th className="hide-sm">Plan</th>
                  <th className="hide-sm">Next payment</th>
                  <th className="num">Still owed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((plan) => {
                  const st = planStatus(plan);
                  return (
                    <tr key={plan.id} onClick={() => navigate(`/installments/${plan.id}`)}>
                      <td>
                        <Link to={`/installments/${plan.id}`} onClick={(e) => e.stopPropagation()}>{plan.sale.customer.fullName}</Link>
                        <div className="muted small">{plan.sale.customer.phone}</div>
                      </td>
                      <td className="hide-sm items-cell">{plan.sale.saleItems.map((i) => i.product.name).join(", ")}</td>
                      <td className="hide-sm nowrap">{formatDate(plan.createdAt)}</td>
                      <td className="hide-sm nowrap">{plan.termCount} × {FREQUENCY_LABEL[plan.paymentFrequency].toLowerCase()}</td>
                      <td className="nowrap hide-sm">
                        {plan.status === "ACTIVE" && plan.summary.nextDueDate ? (
                          <>
                            {formatCents(toCents(plan.summary.nextAmountDue))}
                            <div className="muted small">due {formatDueDate(plan.summary.nextDueDate)}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="num">{formatCents(toCents(plan.summary.outstandingBalance), false)}</td>
                      <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={plans.meta.total} onPage={(p) => update({ page: p > 1 ? String(p) : undefined })} />
        </>
      ))}

      {overdue && (overdue.data.length === 0 ? (
        <div className="empty-inline">No overdue installments. 🎉</div>
      ) : (
        <>
          <p className="muted small">Installments still unpaid after their due date and grace period, oldest first.</p>
          <div className="table-wrap">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Was due</th>
                  <th className="num">Days late</th>
                  <th className="num">Still owed</th>
                  <th className="hide-sm">Reminder</th>
                </tr>
              </thead>
              <tbody>
                {overdue.data.map((item) => (
                  <tr key={item.scheduleId} onClick={() => navigate(`/installments/${item.planId}`)}>
                    <td>
                      <Link to={`/installments/${item.planId}`} onClick={(e) => e.stopPropagation()}>{item.customer.fullName}</Link>
                      <div className="muted small">{item.customer.phone}</div>
                    </td>
                    <td className="nowrap">{formatDueDate(item.dueDate)}</td>
                    <td className="num">{item.daysOverdue}</td>
                    <td className="num">{formatCents(toCents(item.outstanding), false)}</td>
                    <td className="hide-sm small">
                      {item.reminder ? (item.reminder.status === "SENT" && item.reminder.sentAt ? `Sent ${formatDate(item.reminder.sentAt)}` : item.reminder.status.toLowerCase()) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={overdue.meta.total} onPage={(p) => update({ page: p > 1 ? String(p) : undefined })} />
        </>
      ))}
    </section>
  );
}

/** Filters plans by customer: the API filters by customer id, so pick a customer first. */
function CustomerFilter({ customerId, onChange }: { customerId?: string; onChange: (id: string | undefined) => void }) {
  const [selected, setSelected] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const [results, setResults] = useState<Customer[]>([]);

  useEffect(() => {
    if (!customerId) {
      setSelected(null);
      return;
    }
    if (selected?.id === customerId) return;
    getCustomer(customerId).then(setSelected).catch(() => onChange(undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    searchCustomers(debounced, controller.signal).then(setResults).catch(() => undefined);
    return () => controller.abort();
  }, [debounced]);

  if (customerId) {
    return (
      <div className="filter-chip">
        <span>Customer: <strong>{selected?.fullName ?? "…"}</strong></span>
        <button type="button" className="icon-button" aria-label="Clear customer filter" onClick={() => onChange(undefined)}>
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="search-box toolbar-search">
      <div className="search-input">
        <Icon name="search" size={18} />
        <input
          type="search"
          aria-label="Filter plans by customer name or phone"
          placeholder="Filter by customer name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => window.setTimeout(() => setResults([]), 150)}
        />
      </div>
      {debounced && results.length > 0 && (
        <ul className="search-results">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="customer-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(c);
                  setQuery("");
                  onChange(c.id);
                }}
              >
                <span className="customer-name">{c.fullName}</span>
                <span className="muted small">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
