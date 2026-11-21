// FR2 — one product: details, stock, serial units, movement history
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { deactivateProduct, getProductDetail, listMovements, listUnits } from "../api/catalog";
import type { Page, ProductDetail, SerializedUnit, SerializedUnitStatus, StockMovement } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { StatusBadge, type Tone } from "../components/StatusBadge";
import { AddUnitDialog } from "../features/catalog/AddUnitDialog";
import { ProductFormDialog } from "../features/catalog/ProductFormDialog";
import { StockBadge } from "../features/catalog/StockBadge";
import { StockMovementDialog } from "../features/catalog/StockMovementDialog";
import { useAuth } from "../lib/auth-context";
import { formatDate, formatDateTime } from "../lib/documents";
import { formatCents, toCents } from "../lib/money";

const MOVEMENT_LABEL: Record<StockMovement["type"], string> = {
  PURCHASE: "Stock received", SALE: "Sale", RETURN: "Return", DAMAGED: "Damaged", ADJUSTMENT: "Count correction",
};
const UNIT_STATUS: Record<SerializedUnitStatus, { label: string; tone: Tone }> = {
  IN_STOCK: { label: "In stock", tone: "success" }, SOLD: { label: "Sold", tone: "neutral" }, RETURNED: { label: "Returned", tone: "warning" },
};

export default function ProductDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMINISTRATOR";
  const navigate = useNavigate();
  const location = useLocation();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as { created?: boolean } | null)?.created ? "Product created." : null);
  const [dialog, setDialog] = useState<"edit" | "stock" | "units" | "deactivate" | null>(null);
  const [movements, setMovements] = useState<Page<StockMovement> | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [units, setUnits] = useState<Page<SerializedUnit> | null>(null);
  const [unitStatus, setUnitStatus] = useState<SerializedUnitStatus | "">("IN_STOCK");
  const [unitPage, setUnitPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    getProductDetail(id)
      .then((p) => !cancelled && setProduct(p))
      .catch((err) => {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError({ message: errorMessage(err), notFound: status === 404 || status === 400 });
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (!isAdmin || !product) return;
    listMovements(product.id, movementPage).then(setMovements).catch(() => undefined);
  }, [isAdmin, product, movementPage]);

  useEffect(() => {
    if (!product?.isSerialized) return;
    listUnits({ productId: product.id, status: unitStatus || undefined, page: unitPage, limit: 20 }).then(setUnits).catch(() => undefined);
  }, [product, unitStatus, unitPage]);

  if (error) {
    return (
      <div className="empty-state">
        <h2>{error.notFound ? "Product not found" : "Could not load this product"}</h2>
        <p>{error.notFound ? "This product doesn't exist or the link is wrong." : error.message}</p>
        <Link className="button button-primary" to="/products">Back to products</Link>
      </div>
    );
  }
  if (!product) return <p className="muted">Loading product…</p>;

  const margin = toCents(product.sellingPrice) - toCents(product.costPrice);

  return (
    <div className="stack">
      <button type="button" className="back-link" onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/products"))}>
        ← Products
      </button>
      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      {!product.active && <div className="cancel-banner"><strong>Inactive.</strong> This product can't be sold or restocked.</div>}

      <section className="panel customer-header">
        <div>
          <div className="title-row">
            <h2>{product.name}</h2>
            {product.isSerialized && <span className="chip">Serial no.</span>}
          </div>
          <p className="muted plan-subtitle">{product.category.name}</p>
          <dl className="contact-list">
            <div><dt>Selling price</dt><dd>{formatCents(toCents(product.sellingPrice))}</dd></div>
            {isAdmin && <div><dt>Cost price</dt><dd>{formatCents(toCents(product.costPrice))} <span className="muted small">({formatCents(margin, false)} margin)</span></dd></div>}
            <div><dt>Warranty</dt><dd>{product.warrantyMonths ? `${product.warrantyMonths} months` : "None"}</dd></div>
            <div><dt>Low-stock alert</dt><dd>below {product.lowStockThreshold}</dd></div>
          </dl>
        </div>
        {isAdmin && product.active && (
          <div className="header-actions">
            <button type="button" className="button button-ghost" onClick={() => setDialog("edit")}>Edit</button>
            <button type="button" className="button button-danger-ghost" onClick={() => setDialog("deactivate")}>Deactivate</button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Stock</h2>
          {isAdmin && product.active && (product.isSerialized ? (
            <button type="button" className="button button-primary button-small" onClick={() => setDialog("units")}><Icon name="plus" size={16} /> Add units</button>
          ) : (
            <button type="button" className="button button-primary button-small" onClick={() => setDialog("stock")}>Update stock</button>
          ))}
        </div>
        <p className="stock-line">
          <StockBadge product={product} /> <span className="muted">{product.isSerialized ? "units in stock" : "in stock"}</span>
        </p>

        {product.isSerialized && (
          <>
            <div className="tabs compact-tabs" role="tablist" aria-label="Unit status">
              {([["IN_STOCK", "In stock"], ["SOLD", "Sold"], ["RETURNED", "Returned"], ["", "All"]] as const).map(([value, label]) => (
                <button key={label} type="button" role="tab" aria-selected={unitStatus === value} className={`tab${unitStatus === value ? " active" : ""}`}
                  onClick={() => { setUnitStatus(value); setUnitPage(1); }}>{label}</button>
              ))}
            </div>
            {units && (units.data.length === 0 ? <p className="muted">No units here.</p> : (
              <>
                <table className="data-table compact">
                  <thead><tr><th>Serial / IMEI</th><th>Status</th><th className="hide-sm">Warranty start</th></tr></thead>
                  <tbody>
                    {units.data.map((u) => (
                      <tr key={u.id}>
                        <td className="mono">{u.serialNumber}</td>
                        <td><StatusBadge tone={UNIT_STATUS[u.status].tone}>{UNIT_STATUS[u.status].label}</StatusBadge></td>
                        <td className="hide-sm">{u.warrantyStartDate ? formatDate(u.warrantyStartDate) : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={unitPage} limit={20} total={units.meta.total} onPage={setUnitPage} />
              </>
            ))}
          </>
        )}
      </section>

      {isAdmin && (
        <section className="panel">
          <h2 className="panel-title">Stock history</h2>
          {movements && (movements.data.length === 0 ? <p className="muted">No stock movements yet.</p> : (
            <>
              <table className="data-table compact">
                <thead><tr><th>When</th><th>What</th><th className="num">Units</th><th className="hide-sm">By</th></tr></thead>
                <tbody>
                  {movements.data.map((m) => (
                    <tr key={m.id}>
                      <td className="nowrap">{formatDateTime(m.createdAt)}</td>
                      <td>{MOVEMENT_LABEL[m.type]}</td>
                      <td className={`num ${m.quantity > 0 ? "qty-in" : "qty-out"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className="hide-sm muted small">{m.createdBy.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={movementPage} limit={20} total={movements.meta.total} onPage={setMovementPage} />
            </>
          ))}
        </section>
      )}

      {dialog === "edit" && (
        <ProductFormDialog product={product} onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setNotice("Changes saved."); reload(); }} />
      )}
      {dialog === "stock" && (
        <StockMovementDialog product={product} onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setNotice("Stock updated."); setMovementPage(1); reload(); }} />
      )}
      {dialog === "units" && (
        <AddUnitDialog product={product} onClose={() => setDialog(null)} onAdded={() => { setMovementPage(1); reload(); }} />
      )}
      {dialog === "deactivate" && (
        <ConfirmDialog
          title={`Deactivate ${product.name}?`}
          confirmLabel="Deactivate"
          danger
          onConfirm={() => deactivateProduct(product.id)}
          onDone={() => { setDialog(null); setNotice("Product deactivated."); reload(); }}
          onClose={() => setDialog(null)}
        >
          <p>It will no longer appear in the POS and can't be sold or restocked. Past sales and stock history are kept.</p>
          <p className="muted small">There is no way to reactivate a product, so only do this for items you've stopped selling.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
