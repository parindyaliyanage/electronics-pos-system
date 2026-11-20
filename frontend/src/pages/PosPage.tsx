// FR3 — checkout / point of sale
import axios from "axios";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { errorMessage } from "../api/client";
import { checkout, getInstallmentPolicy, getProduct, inStockUnits } from "../api/pos";
import type { CheckoutRequest, CheckoutResponse, Customer, InstallmentPolicy, Product, SerializedUnit } from "../api/types";
import { Icon } from "../components/Icon";
import { cartReducer, cartTotals, checkoutItems, remainingStock, type CartLine } from "../features/sales/cart";
import { CartTable } from "../features/sales/CartTable";
import { CustomerPicker } from "../features/sales/CustomerPicker";
import { checkPayment, initialPayment, type PaymentState } from "../features/sales/payment";
import { PaymentPanel } from "../features/sales/PaymentPanel";
import { ProductSearch } from "../features/sales/ProductSearch";
import { SaleComplete } from "../features/sales/SaleComplete";
import { SerialPicker } from "../features/sales/SerialPicker";
import { useAuth } from "../lib/auth-context";
import { fromCents, formatCents } from "../lib/money";
import { uuid } from "../lib/uuid";

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

interface Draft {
  lines: CartLine[];
  customer: Customer | null;
  payment: PaymentState;
}

// The cart survives moving to another screen and back (e.g. to look up a
// customer), but only in this tab and only for the same user.
const draftKey = (userId: string) => `smartretail.pos-draft.${userId}`;
function loadDraft(userId: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function PosPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const draft = useMemo(() => loadDraft(userId), [userId]);

  const [lines, dispatch] = useReducer(cartReducer, draft?.lines ?? []);
  const [customer, setCustomer] = useState<Customer | null>(draft?.customer ?? null);
  const [payment, setPayment] = useState<PaymentState>(draft?.payment ?? initialPayment);
  const [policy, setPolicy] = useState<InstallmentPolicy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<{ message: string; refresh?: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{ sale: CheckoutResponse; change: number | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * One idempotency key per sale attempt. It is reused when the request may
   * have reached the server (network error, timeout, 5xx), so a retry can
   * never record the sale twice, and replaced as soon as anything in the sale
   * changes or the server gives a definite answer.
   */
  const idempotencyKey = useRef<string | null>(null);
  useEffect(() => {
    idempotencyKey.current = null;
  }, [lines, customer, payment]);

  useEffect(() => {
    try {
      if (completed || (!lines.length && !customer)) sessionStorage.removeItem(draftKey(userId));
      else sessionStorage.setItem(draftKey(userId), JSON.stringify({ lines, customer, payment }));
    } catch {
      // Storage unavailable: the cart just won't survive a page change.
    }
  }, [lines, customer, payment, completed, userId]);

  useEffect(() => {
    getInstallmentPolicy()
      .then(setPolicy)
      .catch((err) => setPolicyError(
        axios.isAxiosError(err) && err.response?.status === 404
          ? "Installment sales are unavailable: an Administrator must set the interest rate first."
          : errorMessage(err),
      ));
  }, []);

  // Warn before closing the tab with an unfinished sale.
  useEffect(() => {
    if (!lines.length || completed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [lines.length, completed]);

  const totals = cartTotals(lines);
  const paymentCheck = checkPayment(payment, totals.grandTotal, policy, policyError);
  const cartUnitIds = useMemo(() => new Set(lines.flatMap((l) => (l.serializedUnitId ? [l.serializedUnitId] : []))), [lines]);

  const blockers: string[] = [];
  if (!lines.length) blockers.push("Add at least one product.");
  if (totals.hasErrors) blockers.push("Fix the highlighted cart lines.");
  if (lines.length && totals.grandTotal <= 0) blockers.push("The total must be more than zero.");
  if (!customer) blockers.push("Select or add a customer.");
  if (lines.length && !paymentCheck.ready) blockers.push("Complete the payment details.");

  const available = useCallback((product: Product) => remainingStock(lines, product), [lines]);

  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus(), 0);

  const onSelectProduct = async (product: Product, query: string) => {
    setError(null);
    setNotice(null);
    if (!product.isSerialized) {
      dispatch({ type: "addProduct", product });
      focusSearch();
      return;
    }
    // A scanned/typed serial number that matches exactly one unit is added directly.
    if (query) {
      try {
        const page = await inStockUnits(product.id, query);
        const exact = page.data.filter((u) => u.serialNumber.toLowerCase() === query.toLowerCase() && !cartUnitIds.has(u.id));
        if (exact.length === 1) {
          dispatch({ type: "addUnit", product, unit: exact[0] });
          focusSearch();
          return;
        }
      } catch {
        // Fall back to the picker, which shows its own error.
      }
    }
    setPicking(product);
  };

  const onPickUnit = (unit: SerializedUnit) => {
    if (picking) dispatch({ type: "addUnit", product: picking, unit });
    setPicking(null);
    focusSearch();
  };

  /** Turns "Price changed for product <uuid>" into 'Price changed for "Galaxy A55"'. */
  const readable = (message: string) => {
    const names = new Map(lines.map((l) => [l.productId.toLowerCase(), l.name]));
    return message
      .replace(/\b[Pp]roduct ([0-9a-f-]{36})/g, (match, id: string) => {
        const name = names.get(id.toLowerCase());
        return name ? `"${name}"` : match;
      })
      .replace(UUID_IN_TEXT, (id) => names.get(id.toLowerCase()) ?? id);
  };

  /** Reloads price, stock and status of every product in the cart. */
  const refreshCart = async () => {
    setError(null);
    try {
      const ids = [...new Set(lines.map((l) => l.productId))];
      const products = await Promise.all(ids.map((id) => getProduct(id)));
      const before = cartTotals(lines).grandTotal;
      const refreshed = cartReducer(lines, { type: "refresh", products });
      dispatch({ type: "refresh", products });
      const inactive = products.filter((p) => !p.active).map((p) => p.name);
      const after = cartTotals(refreshed).grandTotal;
      setNotice([
        before !== after ? `Prices updated: the total is now ${formatCents(after)}. Check it with the customer.` : "Cart is up to date.",
        inactive.length ? `No longer sold: ${inactive.join(", ")}. Remove ${inactive.length > 1 ? "them" : "it"} from the cart.` : "",
      ].filter(Boolean).join(" "));
    } catch (err) {
      setError({ message: errorMessage(err) });
    }
  };

  const submit = async () => {
    setAttempted(true);
    setNotice(null);
    if (blockers.length || submitting || !customer || paymentCheck.amount === null) return;

    const request: CheckoutRequest = {
      customerId: customer.id,
      items: checkoutItems(lines),
      payment: { method: payment.method, type: payment.type, amount: fromCents(paymentCheck.amount) },
      ...(payment.type === "DEPOSIT"
        ? { installment: { termCount: Number(payment.termCount), paymentFrequency: payment.frequency } }
        : {}),
    };
    idempotencyKey.current ??= uuid();
    setSubmitting(true);
    setError(null);
    try {
      const sale = await checkout(request, idempotencyKey.current);
      idempotencyKey.current = null;
      setCompleted({ sale, change: paymentCheck.change });
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const message = errorMessage(err);
      if (status === undefined || status >= 500) {
        // The sale may or may not have been saved; keep the key so retrying is safe.
        setError({ message: `${message} Press Complete sale again to retry; it will not be charged twice.` });
      } else {
        idempotencyKey.current = null;
        if (status === 409 && /already been processed/i.test(message)) {
          setError({ message: "This sale was already recorded (the earlier attempt went through). Check the invoice list before selling again." });
        } else {
          const stale = status === 409 || /inactive|not found/i.test(message);
          setError({ message: readable(message), refresh: stale && lines.length > 0 });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const newSale = () => {
    dispatch({ type: "clear" });
    setCustomer(null);
    setPayment(initialPayment);
    setCompleted(null);
    setAttempted(false);
    setError(null);
    setNotice(null);
    focusSearch();
  };

  if (completed) {
    return (
      <div className="pos-complete">
        <SaleComplete sale={completed.sale} change={completed.change} onNewSale={newSale} />
      </div>
    );
  }

  const confirmLabel = payment.type === "DEPOSIT"
    ? `Take deposit ${paymentCheck.amount !== null && !paymentCheck.errors.deposit ? formatCents(paymentCheck.amount) : ""} & create plan`
    : `Complete sale · ${formatCents(totals.grandTotal)}`;

  return (
    <div className="pos">
      <section className="pos-cart panel">
        <ProductSearch available={available} onSelect={onSelectProduct} inputRef={searchRef} />
        <div className="cart-header">
          <h2>Cart</h2>
          {lines.length > 0 && (
            <span className="muted small">{totals.units} {totals.units === 1 ? "item" : "items"}</span>
          )}
        </div>
        <CartTable lines={lines} dispatch={dispatch} disabled={submitting} />
      </section>

      <aside className="pos-side">
        <section className="panel">
          <h2 className="panel-title">Customer</h2>
          <CustomerPicker customer={customer} onChange={setCustomer} disabled={submitting} />
          {attempted && !customer && <p className="field-error">Select or add a customer.</p>}
        </section>

        <section className="panel">
          <h2 className="panel-title">Payment</h2>
          <PaymentPanel
            state={payment}
            onChange={setPayment}
            check={paymentCheck}
            grandTotal={totals.grandTotal}
            policy={policy}
            disabled={submitting}
            showErrors={attempted}
          />
        </section>

        <section className="panel totals-panel">
          <dl className="summary-list">
            <div><dt>Subtotal</dt><dd>{formatCents(totals.subtotal)}</dd></div>
            <div><dt>Discount</dt><dd>{totals.totalDiscount ? `− ${formatCents(totals.totalDiscount)}` : formatCents(0)}</dd></div>
            <div className="grand"><dt>Total</dt><dd>{formatCents(totals.grandTotal)}</dd></div>
            {payment.type === "DEPOSIT" && paymentCheck.preview && (
              <div><dt>Balance on plan</dt><dd>{formatCents(paymentCheck.preview.totalRepayable)}</dd></div>
            )}
          </dl>

          {notice && <div className="alert alert-info" role="status">{notice}</div>}
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <div>
                <p>{error.message}</p>
                {error.refresh && (
                  <button type="button" className="button button-ghost button-small" onClick={refreshCart}>
                    Refresh cart prices and stock
                  </button>
                )}
              </div>
            </div>
          )}
          {attempted && blockers.length > 0 && (
            <ul className="blockers">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}

          <button
            type="button"
            className="button button-primary button-block button-large"
            onClick={submit}
            disabled={submitting || (attempted && blockers.length > 0)}
          >
            {submitting ? "Processing…" : confirmLabel}
          </button>
          {lines.length > 0 && !submitting && (
            <button type="button" className="button button-link" onClick={() => {
              if (window.confirm("Clear the cart and start over?")) newSale();
            }}
            >
              Clear sale
            </button>
          )}
        </section>
      </aside>

      {picking && (
        <SerialPicker
          product={picking}
          excludeIds={cartUnitIds}
          onPick={onPickUnit}
          onClose={() => {
            setPicking(null);
            focusSearch();
          }}
        />
      )}
    </div>
  );
}
