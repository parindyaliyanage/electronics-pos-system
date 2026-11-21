// FR2 — catalog and inventory
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { listCategories, listProducts } from "../api/catalog";
import type { CategoryRow, Page, Product } from "../api/types";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { CategoriesDialog } from "../features/catalog/CategoriesDialog";
import { ProductFormDialog } from "../features/catalog/ProductFormDialog";
import { StockBadge } from "../features/catalog/StockBadge";
import { useDebounced } from "../hooks/useDebounced";
import { useAuth } from "../lib/auth-context";
import { formatCents, toCents } from "../lib/money";

const LIMIT = 20;

export default function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMINISTRATOR";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const inactive = params.get("show") === "inactive";
  const categoryId = params.get("category") ?? "";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const search = useDebounced(query.trim(), 250);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [result, setResult] = useState<Page<Product> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const update = (next: Record<string, string | undefined>) => {
    const all: Record<string, string | undefined> = {
      q: params.get("q") ?? undefined, category: categoryId || undefined, show: inactive ? "inactive" : undefined, page: undefined, ...next,
    };
    setParams(Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as Record<string, string>);
  };

  useEffect(() => {
    if (search !== (params.get("q") ?? "")) update({ q: search || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    listCategories().then(setCategories).catch(() => undefined);
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listProducts({ search: params.get("q") || undefined, categoryId: categoryId || undefined, active: !inactive, page, limit: LIMIT }, controller.signal)
      .then((data) => {
        setResult(data);
        setError(null);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [params, page, categoryId, inactive, reloadKey]);

  return (
    <section className="panel">
      <div className="tabs" role="tablist" aria-label="Product status">
        <button type="button" role="tab" aria-selected={!inactive} className={`tab${!inactive ? " active" : ""}`} onClick={() => update({ show: undefined })}>Active</button>
        <button type="button" role="tab" aria-selected={inactive} className={`tab${inactive ? " active" : ""}`} onClick={() => update({ show: "inactive" })}>Inactive</button>
        {loading && <span className="spinner" aria-label="Loading" />}
      </div>

      <div className="toolbar">
        <div className="search-input toolbar-search">
          <Icon name="search" size={18} />
          <input type="search" aria-label="Search products" placeholder="Search by name, category or serial number" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="toolbar-select" aria-label="Filter by category" value={categoryId} onChange={(e) => update({ category: e.target.value || undefined })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
        </select>
        {isAdmin && (
          <>
            <button type="button" className="button button-ghost" onClick={() => setManaging(true)}>Categories</button>
            <button type="button" className="button button-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> New product
            </button>
          </>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {result && (result.data.length === 0 ? (
        <div className="empty-inline">{params.get("q") || categoryId ? "No products match these filters." : inactive ? "No inactive products." : "No products yet."}</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hide-sm">Category</th>
                  <th className="num">Price</th>
                  {isAdmin && <th className="num hide-sm">Cost</th>}
                  <th className="num">Stock</th>
                  <th className="hide-sm">Warranty</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/products/${p.id}`)}>
                    <td>
                      <Link to={`/products/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                      {p.isSerialized && <span className="chip">Serial no.</span>}
                    </td>
                    <td className="hide-sm">{p.category.name}</td>
                    <td className="num">{formatCents(toCents(p.sellingPrice), false)}</td>
                    {isAdmin && <td className="num hide-sm muted">{formatCents(toCents(p.costPrice), false)}</td>}
                    <td className="num"><StockBadge product={p} /></td>
                    <td className="hide-sm">{p.warrantyMonths ? `${p.warrantyMonths} mo` : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={result.meta.total} onPage={(n) => update({ page: n > 1 ? String(n) : undefined })} />
        </>
      ))}

      {creating && (
        <ProductFormDialog
          onSaved={(p) => {
            setCreating(false);
            navigate(`/products/${p.id}`, { state: { created: true } });
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {managing && <CategoriesDialog onClose={() => setManaging(false)} onChanged={() => setReloadKey((k) => k + 1)} />}
    </section>
  );
}
