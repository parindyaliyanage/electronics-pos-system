// FR4 — customers: search and register
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { listCustomers } from "../api/customers";
import type { CreateCustomerResult, Customer, Page } from "../api/types";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { NewCustomerDialog } from "../features/customers/NewCustomerDialog";
import { useDebounced } from "../hooks/useDebounced";
import { formatDate } from "../lib/documents";

const LIMIT = 20;

export default function CustomersPage() {
  const navigate = useNavigate();
  // Search and page live in the URL, so Back from a customer returns to the same list.
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const search = useDebounced(query.trim(), 250);
  const [result, setResult] = useState<Page<Customer> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (search === (params.get("q") ?? "")) return;
    setParams(search ? { q: search } : {}, { replace: true });
  }, [search, params, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listCustomers({ search: params.get("q") ?? "", page, limit: LIMIT }, controller.signal)
      .then((data) => {
        setResult(data);
        setError(null);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [params, page]);

  const goToPage = (next: number) => {
    const q = params.get("q");
    setParams({ ...(q ? { q } : {}), ...(next > 1 ? { page: String(next) } : {}) });
  };

  const onCreated = (created: CreateCustomerResult) => {
    setCreating(false);
    navigate(`/customers/${created.customer.id}`, { state: { warnings: created.warnings } });
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search-input toolbar-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="Search customers by name or phone"
            placeholder="Search by name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {loading && <span className="spinner" aria-label="Loading" />}
        </div>
        <button type="button" className="button button-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} /> New customer
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {result && result.data.length === 0 && !loading && (
        <div className="empty-inline">
          {params.get("q")
            ? <>No customer matches “{params.get("q")}”. <button type="button" className="link-button" onClick={() => setCreating(true)}>Register a new customer</button></>
            : "No customers yet. Register the first one with New customer."}
        </div>
      )}

      {result && result.data.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="hide-sm">Email</th>
                  <th className="num">Sales</th>
                  <th className="hide-sm">Registered</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((customer) => (
                  <tr key={customer.id} onClick={() => navigate(`/customers/${customer.id}`)}>
                    <td><Link to={`/customers/${customer.id}`} onClick={(e) => e.stopPropagation()}>{customer.fullName}</Link></td>
                    <td className="nowrap">{customer.phone}</td>
                    <td className="hide-sm">{customer.email ?? <span className="muted">—</span>}</td>
                    <td className="num">{customer._count?.sales ?? 0}</td>
                    <td className="hide-sm nowrap">{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={result.meta.total} onPage={goToPage} />
        </>
      )}

      {creating && (
        <NewCustomerDialog initialName={query.trim()} onCreated={onCreated} onClose={() => setCreating(false)} />
      )}
    </section>
  );
}
