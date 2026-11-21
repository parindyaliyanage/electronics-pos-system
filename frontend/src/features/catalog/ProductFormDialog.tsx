import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { createProduct, listCategories, updateProduct } from "../../api/catalog";
import type { CategoryRow, Product, ProductInput } from "../../api/types";
import { Modal } from "../../components/Modal";
import { formatCents, fromCents, parseAmountInput, toCents } from "../../lib/money";

interface Props {
  product?: Product;
  onSaved: (product: Product) => void;
  onClose: () => void;
}

interface Form {
  categoryId: string;
  name: string;
  costPrice: string;
  sellingPrice: string;
  isSerialized: boolean;
  lowStockThreshold: string;
  warrantyMonths: string;
}
type Errors = Partial<Record<keyof Form, string>>;

const money = (value: string) => (toCents(value) / 100).toFixed(2);

// Same rules as CreateProductDto / UpdateProductDto.
function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.categoryId) errors.categoryId = "Choose a category.";
  if (!form.name.trim()) errors.name = "Enter the product name.";
  else if (form.name.trim().length > 200) errors.name = "Keep the name under 200 characters.";
  for (const key of ["costPrice", "sellingPrice"] as const) {
    const parsed = parseAmountInput(form[key]);
    if (parsed.error) errors[key] = parsed.error;
    else if (parsed.cents === null) errors[key] = "Enter a price.";
  }
  if (!/^\d+$/.test(form.lowStockThreshold.trim())) errors.lowStockThreshold = "Enter a whole number (0 or more).";
  const w = form.warrantyMonths.trim();
  if (w && (!/^\d+$/.test(w) || Number(w) > 120)) errors.warrantyMonths = "Enter 0–120 months, or leave blank for no warranty.";
  return errors;
}

export function ProductFormDialog({ product, onSaved, onClose }: Props) {
  const editing = !!product;
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [form, setForm] = useState<Form>(() => ({
    categoryId: product?.categoryId ?? "",
    name: product?.name ?? "",
    costPrice: product ? money(product.costPrice) : "",
    sellingPrice: product ? money(product.sellingPrice) : "",
    isSerialized: product?.isSerialized ?? false,
    lowStockThreshold: String(product?.lowStockThreshold ?? 5),
    warrantyMonths: product?.warrantyMonths != null ? String(product.warrantyMonths) : "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    listCategories().then(setCategories).catch((err) => setServerError(errorMessage(err)));
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const cost = parseAmountInput(form.costPrice).cents;
  const sell = parseAmountInput(form.sellingPrice).cents;
  const belowCost = cost !== null && sell !== null && sell < cost;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const input: ProductInput = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      costPrice: fromCents(cost!),
      sellingPrice: fromCents(sell!),
      isSerialized: form.isSerialized,
      lowStockThreshold: Number(form.lowStockThreshold),
      warrantyMonths: form.warrantyMonths.trim() ? Number(form.warrantyMonths) : null,
    };
    setSaving(true);
    setServerError(null);
    try {
      if (!editing) {
        onSaved(await createProduct(input));
        return;
      }
      // Send only what changed, so an unchanged serialized flag can't trip the
      // "cannot change after stock history exists" rule.
      const changes: Partial<ProductInput> = {};
      if (input.categoryId !== product.categoryId) changes.categoryId = input.categoryId;
      if (input.name !== product.name) changes.name = input.name;
      if (toCents(input.costPrice) !== toCents(product.costPrice)) changes.costPrice = input.costPrice;
      if (toCents(input.sellingPrice) !== toCents(product.sellingPrice)) changes.sellingPrice = input.sellingPrice;
      if (input.isSerialized !== product.isSerialized) changes.isSerialized = input.isSerialized;
      if (input.lowStockThreshold !== product.lowStockThreshold) changes.lowStockThreshold = input.lowStockThreshold;
      if (input.warrantyMonths !== product.warrantyMonths) changes.warrantyMonths = input.warrantyMonths;
      onSaved(Object.keys(changes).length ? await updateProduct(product.id, changes) : product);
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const activeCategories = categories.filter((c) => c.active || c.id === form.categoryId);
  const err = (k: keyof Form) => errors[k] && <p className="field-error">{errors[k]}</p>;

  return (
    <Modal
      title={editing ? `Edit ${product.name}` : "New product"}
      onClose={onClose}
      width={560}
      footer={(
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="product-form" className="button button-primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create product"}
          </button>
        </>
      )}
    >
      <form id="product-form" onSubmit={submit} noValidate>
        {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
        <div className={`field${errors.name ? " has-error" : ""}`}>
          <label htmlFor="p-name">Name</label>
          <input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </div>
        <div className={`field${errors.categoryId ? " has-error" : ""}`}>
          <label htmlFor="p-category">Category</label>
          <select id="p-category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="" disabled>Choose a category…</option>
            {activeCategories.map((c) => <option key={c.id} value={c.id} disabled={!c.active}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
          </select>
          {err("categoryId")}
          {categories.length > 0 && !categories.some((c) => c.active) && <p className="muted small">No active categories yet: add one with Categories first.</p>}
        </div>
        <div className="field-row">
          <div className={`field${errors.costPrice ? " has-error" : ""}`}>
            <label htmlFor="p-cost">Cost price (LKR)</label>
            <input id="p-cost" inputMode="decimal" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} />
            {err("costPrice")}
          </div>
          <div className={`field${errors.sellingPrice ? " has-error" : ""}`}>
            <label htmlFor="p-price">Selling price (LKR)</label>
            <input id="p-price" inputMode="decimal" value={form.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value)} />
            {err("sellingPrice")}
          </div>
        </div>
        {belowCost && <p className="warning-text small form-note">The selling price is below the cost price ({formatCents(cost!)}).</p>}
        {editing && sell !== null && sell !== toCents(product.sellingPrice) && (
          <p className="muted small form-note">Carts already holding this product will be asked to refresh the price at checkout.</p>
        )}
        <div className="field-row">
          <div className={`field${errors.lowStockThreshold ? " has-error" : ""}`}>
            <label htmlFor="p-threshold">Low-stock alert below</label>
            <input id="p-threshold" inputMode="numeric" value={form.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} />
            {err("lowStockThreshold")}
          </div>
          <div className={`field${errors.warrantyMonths ? " has-error" : ""}`}>
            <label htmlFor="p-warranty">Warranty (months)</label>
            <input id="p-warranty" inputMode="numeric" placeholder="None" value={form.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} />
            {err("warrantyMonths")}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.isSerialized} onChange={(e) => set("isSerialized", e.target.checked)} />
          <span>
            <strong>Track serial / IMEI numbers</strong>
            <span className="muted small"> Each unit is registered and sold individually. Can't be changed once the product has stock history.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
