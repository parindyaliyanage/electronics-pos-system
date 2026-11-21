import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { createCategory, deactivateCategory, listCategories, renameCategory } from "../../api/catalog";
import type { CategoryRow } from "../../api/types";
import { Modal } from "../../components/Modal";
import { StatusBadge } from "../../components/StatusBadge";

/** Administrator: add, rename and deactivate categories. */
export function CategoriesDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listCategories().then(setRows).catch((err) => setError(errorMessage(err)));
  useEffect(() => {
    void reload();
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a category name.");
    if (trimmed.length > 100) return setError("Keep the name under 100 characters.");
    if (await run(() => createCategory(trimmed))) setName("");
  };

  const saveRename = async () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return setError("Enter a category name.");
    if (await run(() => renameCategory(editing.id, trimmed))) setEditing(null);
  };

  return (
    <Modal title="Categories" onClose={onClose} width={600}>
      <form className="inline-form" onSubmit={add}>
        <input aria-label="New category name" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button button-primary" disabled={busy}>Add</button>
      </form>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {confirming && (
        <div className="alert alert-warning confirm-inline" role="alert">
          <div>
            <strong>Deactivate “{confirming.name}”?</strong> Its {confirming._count.products} product{confirming._count.products === 1 ? "" : "s"} will
            be deactivated too and can no longer be sold. This can't be undone.
          </div>
          <div className="button-row">
            <button type="button" className="button button-ghost button-small" onClick={() => setConfirming(null)}>Keep</button>
            <button
              type="button"
              className="button button-danger button-small"
              disabled={busy}
              onClick={async () => {
                if (await run(() => deactivateCategory(confirming.id))) setConfirming(null);
              }}
            >
              Deactivate
            </button>
          </div>
        </div>
      )}

      {rows === null ? <p className="muted">Loading…</p> : (
        <table className="data-table">
          <thead><tr><th>Name</th><th className="num">Products</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  {editing?.id === c.id ? (
                    <input
                      className="inline-input"
                      aria-label="Category name"
                      value={editing.name}
                      autoFocus
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename();
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  ) : c.name}
                </td>
                <td className="num">{c._count.products}</td>
                <td><StatusBadge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</StatusBadge></td>
                <td className="actions nowrap">
                  {editing?.id === c.id ? (
                    <>
                      <button type="button" className="link-button small" disabled={busy} onClick={saveRename}>Save</button>{" "}
                      <button type="button" className="link-button small" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : c.active && (
                    <>
                      <button type="button" className="link-button small" onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</button>{" "}
                      <button type="button" className="link-button small danger-link" onClick={() => setConfirming(c)}>Deactivate</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">No categories yet.</td></tr>}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
