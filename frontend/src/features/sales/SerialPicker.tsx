import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { inStockUnits } from "../../api/pos";
import type { Product, SerializedUnit } from "../../api/types";
import { Modal } from "../../components/Modal";
import { useDebounced } from "../../hooks/useDebounced";

interface Props {
  product: Product;
  /** Units already in the cart, hidden from the list. */
  excludeIds: Set<string>;
  onPick: (unit: SerializedUnit) => void;
  onClose: () => void;
}

/** Serialized products are sold one physical unit at a time: pick its serial / IMEI. */
export function SerialPicker({ product, excludeIds, onPick, onClose }: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 200);
  const [units, setUnits] = useState<SerializedUnit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    inStockUnits(product.id, debounced)
      .then((page) => {
        if (cancelled) return;
        setUnits(page.data);
        setTotal(page.meta.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [product.id, debounced]);

  const visible = (units ?? []).filter((unit) => !excludeIds.has(unit.id));

  return (
    <Modal title={`Choose a unit — ${product.name}`} onClose={onClose}>
      <div className="field">
        <label htmlFor="serial-search">Serial / IMEI</label>
        <input
          id="serial-search"
          type="search"
          autoComplete="off"
          placeholder="Type or scan the serial number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible.length === 1) onPick(visible[0]);
          }}
        />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {units === null && !error && <p className="muted">Loading units…</p>}
      {units !== null && visible.length === 0 && (
        <p className="muted">{debounced ? "No unit in stock matches that serial number." : "No units of this product are in stock."}</p>
      )}
      {visible.length > 0 && (
        <ul className="unit-list">
          {visible.map((unit) => (
            <li key={unit.id}>
              <button type="button" className="unit-option" onClick={() => onPick(unit)}>
                <span className="mono">{unit.serialNumber}</span>
                <span className="muted">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > (units?.length ?? 0) && (
        <p className="muted small">Showing the first {units?.length} of {total}. Type part of the serial number to narrow the list.</p>
      )}
    </Modal>
  );
}
