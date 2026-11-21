import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { registerUnit } from "../../api/catalog";
import type { Product } from "../../api/types";
import { Modal } from "../../components/Modal";

/** Registers one physical unit of a serialized product (+1 stock). Stays open for scanning several. */
export function AddUnitDialog({ product, onAdded, onClose }: { product: Product; onAdded: () => void; onClose: () => void }) {
  const [serial, setSerial] = useState("");
  const [warrantyStart, setWarrantyStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = serial.trim();
    if (!trimmed) return setError("Enter or scan the serial / IMEI number.");
    if (trimmed.length > 200) return setError("Keep the serial number under 200 characters.");
    setSaving(true);
    setError(null);
    try {
      const unit = await registerUnit({ productId: product.id, serialNumber: trimmed, ...(warrantyStart ? { warrantyStartDate: warrantyStart } : {}) });
      setAdded((list) => [unit.serialNumber, ...list]);
      setSerial("");
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Add units · ${product.name}`}
      onClose={onClose}
      footer={<button type="button" className="button button-primary" onClick={onClose}>Done</button>}
    >
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="u-serial">Serial / IMEI number</label>
          <div className="inline-form">
            <input id="u-serial" autoComplete="off" autoFocus value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Type or scan, then press Enter" />
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding…" : "Add"}</button>
          </div>
          <p className="muted small">Serial numbers are stored in capitals and must be unique.</p>
        </div>
        <div className="field">
          <label htmlFor="u-warranty">Warranty start (optional)</label>
          <input id="u-warranty" type="date" value={warrantyStart} onChange={(e) => setWarrantyStart(e.target.value)} />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {added.length > 0 && (
          <div className="plan-preview">
            <p className="small"><strong>Added {added.length} unit{added.length > 1 ? "s" : ""}:</strong></p>
            <p className="mono small">{added.join(", ")}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
