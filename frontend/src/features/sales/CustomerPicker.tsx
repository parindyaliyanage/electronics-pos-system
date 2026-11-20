import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { searchCustomers } from "../../api/customers";
import type { CreateCustomerResult, Customer } from "../../api/types";
import { Icon } from "../../components/Icon";
import { useDebounced } from "../../hooks/useDebounced";
import { NewCustomerDialog } from "../customers/NewCustomerDialog";

interface Props {
  customer: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
}

/** Find a customer by name or phone, or register a new one without leaving the sale. */
export function CustomerPicker({ customer, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const [results, setResults] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    searchCustomers(debounced, controller.signal)
      .then((rows) => {
        setResults(rows);
        setError(null);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [debounced]);

  const pick = (selected: Customer) => {
    onChange(selected);
    setQuery("");
    setResults([]);
    setWarning(null);
  };

  const onCreated = (result: CreateCustomerResult) => {
    setCreating(false);
    pick(result.customer);
    // Registration still succeeds; the cashier is just told about the duplicate.
    const duplicate = result.warnings.find((w) => w.code === "DUPLICATE_PHONE");
    if (duplicate) {
      setWarning(`${duplicate.message}: ${duplicate.matches.map((m) => m.fullName).join(", ")}.`);
    }
  };

  if (customer) {
    return (
      <div className="customer-selected">
        <span className="avatar" aria-hidden="true"><Icon name="customers" size={18} /></span>
        <div className="customer-text">
          <div className="customer-name">{customer.fullName}</div>
          <div className="muted small">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</div>
          {warning && <p className="warning-text small">{warning}</p>}
        </div>
        <button type="button" className="button button-ghost button-small" disabled={disabled} onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  const showResults = debounced !== "" && debounced === query.trim();

  return (
    <div className="customer-picker">
      <div className="search-input">
        <Icon name="search" size={18} />
        <input
          type="search"
          aria-label="Search customers by name or phone"
          placeholder="Search by name or phone"
          autoComplete="off"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showResults && results.length === 1) {
              e.preventDefault();
              pick(results[0]);
            }
          }}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
      {showResults && (
        <ul className="customer-results">
          {results.map((row) => (
            <li key={row.id}>
              <button type="button" className="customer-option" onClick={() => pick(row)}>
                <span className="customer-name">{row.fullName}</span>
                <span className="muted small">{row.phone}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="search-empty">No customer matches “{debounced}”.</li>}
        </ul>
      )}
      <button type="button" className="button button-ghost button-small add-customer" disabled={disabled} onClick={() => setCreating(true)}>
        <Icon name="plus" size={16} /> New customer
      </button>
      {creating && (
        <NewCustomerDialog initialName={query.trim()} onCreated={onCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
