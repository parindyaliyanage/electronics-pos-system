// FR8 — reports (Administrator)
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import { listCategories } from "../api/catalog";
import { createReport, downloadReport, listReports, retryReport } from "../api/reports";
import type { CategoryRow, ManagedUser, Page, PaymentMethod, ReportFilters, ReportFormat, ReportJob, ReportStatus, ReportType } from "../api/types";
import { listUsers } from "../api/users";
import { Pagination } from "../components/Pagination";
import { StatusBadge, type Tone } from "../components/StatusBadge";
import { METHOD_LABEL } from "../features/sales/payment";
import { formatDate, formatDateTime, formatDueDate, showPdf } from "../lib/documents";

const TYPES: Record<ReportType, { label: string; help: string; dates: "required" | "optional" | "none"; dateLabel?: string }> = {
  SALES: { label: "Sales", help: "Revenue by day or month, by product, category and cashier.", dates: "required" },
  INVENTORY: { label: "Inventory", help: "Current stock and value of every active product, and low-stock items.", dates: "none" },
  INSTALLMENTS: { label: "Installments", help: "Upcoming and overdue payments, balances by customer, all plans.", dates: "optional", dateLabel: "Due between (default: next 30 days)" },
  FINANCIAL: { label: "Financial", help: "Money received by type and method, daily cash summary, receivables aging.", dates: "required" },
};
const STATUS: Record<ReportStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: "Waiting", tone: "info" },
  GENERATING: { label: "Generating", tone: "info" },
  COMPLETED: { label: "Ready", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};
const MAX_DAYS = 3660;
const POLL_MS = 3000;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function quickRanges(): Array<[string, string, string]> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysAgo = (n: number) => iso(new Date(y, m, now.getDate() - n));
  return [
    ["Today", iso(now), iso(now)],
    ["Last 7 days", daysAgo(6), iso(now)],
    ["This month", iso(new Date(y, m, 1)), iso(now)],
    ["Last month", iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    ["This year", iso(new Date(y, 0, 1)), iso(now)],
  ];
}

interface Form {
  type: ReportType;
  format: ReportFormat;
  from: string;
  to: string;
  categoryId: string;
  cashierId: string;
  groupBy: "DAY" | "MONTH";
  stockThreshold: string;
  lowStockOnly: boolean;
  status: "" | "ACTIVE" | "OVERDUE" | "COMPLETED";
  paymentMethod: "" | PaymentMethod;
}

/** Only the filters each report type accepts (others are a 400 on the server). */
function filtersFor(form: Form): ReportFilters {
  const dates = form.from || form.to ? { from: form.from, to: form.to } : {};
  switch (form.type) {
    case "SALES":
      return { ...dates, ...(form.categoryId ? { categoryId: form.categoryId } : {}), ...(form.cashierId ? { cashierId: form.cashierId } : {}), groupBy: form.groupBy };
    case "INVENTORY":
      return {
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        ...(form.stockThreshold.trim() ? { stockThreshold: Number(form.stockThreshold) } : {}),
        ...(form.lowStockOnly ? { lowStockOnly: true } : {}),
      };
    case "INSTALLMENTS":
      return { ...dates, ...(form.status ? { status: form.status } : {}) };
    case "FINANCIAL":
      return { ...dates, ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}) };
  }
}

function validate(form: Form): string | undefined {
  const rule = TYPES[form.type].dates;
  if (rule === "required" && (!form.from || !form.to)) return "Choose a start and end date.";
  if (rule === "optional" && !!form.from !== !!form.to) return "Choose both dates, or leave both empty.";
  if (rule !== "none" && form.from && form.to) {
    if (form.to < form.from) return "The end date can't be before the start date.";
    const days = (Date.parse(form.to) - Date.parse(form.from)) / 86_400_000 + 1;
    if (days > MAX_DAYS) return "Choose a range of at most 10 years.";
  }
  if (form.type === "INVENTORY" && form.stockThreshold.trim() && !/^\d+$/.test(form.stockThreshold.trim())) return "The stock threshold must be a whole number.";
  return undefined;
}

export default function ReportsPage() {
  const ranges = quickRanges();
  const [form, setForm] = useState<Form>({
    type: "SALES", format: "PDF", from: ranges[2][1], to: ranges[2][2], categoryId: "", cashierId: "", groupBy: "DAY",
    stockThreshold: "", lowStockOnly: false, status: "", paymentMethod: "",
  });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [cashiers, setCashiers] = useState<ManagedUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<Page<ReportJob> | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    listCategories().then(setCategories).catch(() => undefined);
    listUsers({}).then(setCashiers).catch(() => undefined);
  }, []);

  const loadHistory = useCallback(() => listReports({ page: pageRef.current, limit: 10 }).then(setHistory).catch(() => undefined), []);
  useEffect(() => {
    void loadHistory();
  }, [page, loadHistory]);

  // While a report is waiting or generating, check again every few seconds.
  const pending = history?.data.some((j) => j.status === "QUEUED" || j.status === "GENERATING") ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void loadHistory(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending, loadHistory]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const download = async (job: ReportJob, mode?: "open" | "download") => {
    setBusyId(job.id);
    setRowError(null);
    try {
      const fileName = job.fileName ?? `${job.type.toLowerCase()}-report.${job.format.toLowerCase()}`;
      // PDFs open in a new tab (view/print); CSVs download for Excel.
      await showPdf(() => downloadReport(job.id), fileName, mode ?? (job.format === "PDF" ? "open" : "download"));
    } catch (err) {
      setRowError(errorMessage(err, "Could not download the report."));
      void loadHistory();
    } finally {
      setBusyId(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate(form);
    setFormError(problem ?? null);
    setNotice(null);
    if (problem) return;
    setSubmitting(true);
    try {
      const { job, queued } = await createReport({ type: form.type, format: form.format, ...filtersFor(form) });
      setPage(1);
      pageRef.current = 1;
      await loadHistory();
      if (queued) {
        setNotice("This is a large report, so it's being prepared in the background. It will show as Ready in the list below; you can keep working meanwhile.");
      } else if (job.status === "COMPLETED") {
        setNotice(`${TYPES[job.type].label} report ready and downloaded. You can open it again from the list below.`);
        // Not a direct click any more (we awaited the server), so download rather than open a tab.
        await download(job, "download");
      } else {
        setFormError(`The report could not be generated: ${job.errorMessage ?? "unknown error"}. You can retry it from the list below.`);
      }
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async (job: ReportJob) => {
    setBusyId(job.id);
    setRowError(null);
    try {
      await retryReport(job.id);
      await loadHistory();
    } catch (err) {
      setRowError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const rule = TYPES[form.type];
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "one category";
  const cashierName = (id?: string) => {
    const c = cashiers.find((u) => u.id === id);
    return c ? c.fullName ?? c.email : "one cashier";
  };
  const describe = (j: ReportJob) => {
    const f = j.filters ?? {};
    const parts: string[] = [];
    if (f.from && f.to) parts.push(f.from === f.to ? formatDueDate(f.from) : `${formatDueDate(f.from)} – ${formatDueDate(f.to)}`);
    if (f.categoryId) parts.push(categoryName(f.categoryId));
    if (f.cashierId) parts.push(cashierName(f.cashierId));
    if (f.groupBy === "MONTH") parts.push("by month");
    if (f.lowStockOnly) parts.push("low stock only");
    if (f.stockThreshold !== undefined) parts.push(`below ${f.stockThreshold}`);
    if (f.status) parts.push(f.status.toLowerCase());
    if (f.paymentMethod) parts.push(METHOD_LABEL[f.paymentMethod]);
    return parts.join(" · ") || (j.type === "INVENTORY" ? "all products" : j.type === "INSTALLMENTS" ? "next 30 days" : "");
  };

  return (
    <div className="stack">
      <section className="panel">
        <h2 className="panel-title">New report</h2>
        <form onSubmit={submit} noValidate className="report-form">
          <div className="report-types" role="radiogroup" aria-label="Report type">
            {(Object.keys(TYPES) as ReportType[]).map((t) => (
              <label key={t} className={`report-type${form.type === t ? " active" : ""}`}>
                <input type="radio" name="report-type" value={t} checked={form.type === t} onChange={() => { set("type", t); setFormError(null); }} />
                <strong>{TYPES[t].label}</strong>
                <span className="muted small">{TYPES[t].help}</span>
              </label>
            ))}
          </div>

          {rule.dates !== "none" && (
            <div className="field">
              <span className="field-label">{rule.dateLabel ?? "Period"}</span>
              <div className="date-range">
                <input type="date" aria-label="From" value={form.from} onChange={(e) => set("from", e.target.value)} />
                <span className="muted">to</span>
                <input type="date" aria-label="To" value={form.to} onChange={(e) => set("to", e.target.value)} />
                {rule.dates === "optional" && (form.from || form.to) && (
                  <button type="button" className="link-button small" onClick={() => setForm((f) => ({ ...f, from: "", to: "" }))}>Clear</button>
                )}
              </div>
              <div className="chips quick-ranges">
                {ranges.map(([label, from, to]) => (
                  <button key={label} type="button" className={`chip-option${form.from === from && form.to === to ? " active" : ""}`} onClick={() => setForm((f) => ({ ...f, from, to }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-grid">
            {(form.type === "SALES" || form.type === "INVENTORY") && (
              <div className="field">
                <label htmlFor="r-category">Category</label>
                <select id="r-category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
                </select>
              </div>
            )}
            {form.type === "SALES" && (
              <>
                <div className="field">
                  <label htmlFor="r-cashier">Cashier</label>
                  <select id="r-cashier" value={form.cashierId} onChange={(e) => set("cashierId", e.target.value)}>
                    <option value="">All cashiers</option>
                    {cashiers.map((u) => <option key={u.id} value={u.id}>{u.fullName ?? u.email}{u.active ? "" : " (deactivated)"}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="r-group">Revenue by</label>
                  <select id="r-group" value={form.groupBy} onChange={(e) => set("groupBy", e.target.value as Form["groupBy"])}>
                    <option value="DAY">Day</option>
                    <option value="MONTH">Month</option>
                  </select>
                </div>
              </>
            )}
            {form.type === "INVENTORY" && (
              <>
                <div className="field">
                  <label htmlFor="r-threshold">Low stock means below</label>
                  <input id="r-threshold" inputMode="numeric" placeholder="Each product's own level" value={form.stockThreshold} onChange={(e) => set("stockThreshold", e.target.value)} />
                </div>
                <label className="checkbox filter-checkbox">
                  <input type="checkbox" checked={form.lowStockOnly} onChange={(e) => set("lowStockOnly", e.target.checked)} />
                  <span>Only low-stock items</span>
                </label>
              </>
            )}
            {form.type === "INSTALLMENTS" && (
              <div className="field">
                <label htmlFor="r-status">Plans</label>
                <select id="r-status" value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                  <option value="">Active and paid off</option>
                  <option value="ACTIVE">Active</option>
                  <option value="OVERDUE">Active with overdue payments</option>
                  <option value="COMPLETED">Paid off</option>
                </select>
              </div>
            )}
            {form.type === "FINANCIAL" && (
              <div className="field">
                <label htmlFor="r-method">Payment method</label>
                <select id="r-method" value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value as Form["paymentMethod"])}>
                  <option value="">All methods</option>
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="report-submit">
            <div className="segmented format-toggle" role="radiogroup" aria-label="Format">
              {(["PDF", "CSV"] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={form.format === f} className={form.format === f ? "active" : ""} onClick={() => set("format", f)}>
                  {f === "PDF" ? "PDF" : "CSV (Excel)"}
                </button>
              ))}
            </div>
            <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Generating…" : `Generate ${rule.label.toLowerCase()} report`}</button>
          </div>
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          {notice && <div className="alert alert-info" role="status">{notice}</div>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Report history</h2>
          {pending && <span className="muted small"><span className="spinner inline-spinner" /> checking for finished reports…</span>}
        </div>
        {rowError && <div className="alert alert-error" role="alert">{rowError}</div>}
        {history && (history.data.length === 0 ? <p className="muted">No reports yet.</p> : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Requested</th><th>Report</th><th className="hide-sm">Filters</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {history.data.map((j) => (
                    <tr key={j.id}>
                      <td className="nowrap">{formatDateTime(j.createdAt)}<div className="muted small hide-sm">{j.requestedBy?.fullName ?? j.requestedBy?.email}</div></td>
                      <td>{TYPES[j.type].label} <span className="chip">{j.format}</span></td>
                      <td className="hide-sm small">{describe(j)}</td>
                      <td>
                        <StatusBadge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</StatusBadge>
                        {j.status === "FAILED" && j.errorMessage && <div className="field-error small">{j.errorMessage}</div>}
                        {j.status === "COMPLETED" && j.expiresAt && <div className="muted small">until {formatDate(j.expiresAt)}</div>}
                      </td>
                      <td className="actions nowrap">
                        {j.status === "COMPLETED" && (
                          <button type="button" className="button button-ghost button-small" disabled={busyId !== null} onClick={() => download(j)}>
                            {busyId === j.id ? "Opening…" : j.format === "PDF" ? "Open" : "Download"}
                          </button>
                        )}
                        {(j.status === "FAILED" || j.status === "EXPIRED") && (
                          <button type="button" className="button button-ghost button-small" disabled={busyId !== null} onClick={() => retry(j)}>
                            {busyId === j.id ? "Retrying…" : j.status === "EXPIRED" ? "Generate again" : "Retry"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={10} total={history.meta.total} onPage={setPage} />
          </>
        ))}
      </section>
    </div>
  );
}
