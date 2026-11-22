import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { createMovement } from "../../api/catalog";
import type { Product } from "../../api/types";
import { Modal } from "../../components/Modal";

type ManualType = "PURCHASE" | "RETURN" | "DAMAGED" | "ADJUSTMENT";

// Sign rules from InventoryService.validateMovementSign. SALE movements only
// come from POS checkout, so they aren't offered here.
const TYPES: Record<ManualType, { label: string; help: string; sign: 1 | -1 | 0 }> = {
  PURCHASE: { label: "Stock received (purchase)", help: "Adds units to stock.", sign: 1 },
  RETURN: { label: "Customer return", help: "A returned item goes back into stock.", sign: 1 },
  DAMAGED: { label: "Damaged / written off", help: "Removes units from stock.", sign: -1 },
  ADJUSTMENT: { label: "Stock count correction", help: "Add or remove units to match a physical count.", sign: 0 },
};

export function StockMovementDialog({ product, onSaved, onClose }: { product: Product; onSaved: () => void; onClose: () => void }) {
  const [type, setType] = useState<ManualType>("PURCHASE");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const rule = TYPES[type];
  const sign = rule.sign === 0 ? direction : rule.sign;
  const n = Number(quantity);
  let quantityError: string | undefined;
  if (!/^\d+$/.test(quantity.trim()) || n < 1) quantityError = "Enter a whole number of units (1 or more).";
  else if (sign < 0 && n > product.currentStock) quantityError = `Only ${product.currentStock} in stock; stock can't go below zero.`;
  const after = quantityError ? null : product.currentStock + sign * n;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (quantityError) return;
    setSaving(true);
    setError(null);
    try {
      await createMovement({ productId: product.id, type, quantity: sign * n });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Update stock · ${product.name}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="movement-form" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>
      )}
    >
      <form id="movement-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="m-type">What happened?</label>
          <select id="m-type" value={type} onChange={(e) => setType(e.target.value as ManualType)}>
            {(Object.keys(TYPES) as ManualType[]).map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
          </select>
          <p className="muted small">{rule.help}</p>
        </div>
        {rule.sign === 0 && (
          <div className="segmented">
            <button type="button" className={direction === 1 ? "active" : ""} onClick={() => setDirection(1)}>Add units</button>
            <button type="button" className={direction === -1 ? "active" : ""} onClick={() => setDirection(-1)}>Remove units</button>
          </div>
        )}
        <div className={`field${attempted && quantityError ? " has-error" : ""}`}>
          <label htmlFor="m-qty">Units</label>
          <input id="m-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          {(attempted || quantity) && quantityError && <p className="field-error">{quantityError}</p>}
        </div>
        <p className="muted">
          In stock now: <strong>{product.currentStock}</strong>
          {after !== null && <> → after this: <strong>{after}</strong></>}
        </p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
