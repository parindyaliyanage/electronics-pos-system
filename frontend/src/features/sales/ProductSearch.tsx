import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "../../api/client";
import { searchProducts } from "../../api/pos";
import type { Product } from "../../api/types";
import { Icon } from "../../components/Icon";
import { useDebounced } from "../../hooks/useDebounced";
import { formatCents, toCents } from "../../lib/money";

interface Props {
  /** Units of this product still available after what's already in the cart. */
  available: (product: Product) => number;
  onSelect: (product: Product, query: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/** Search by product name, category or serial number; Enter adds the highlighted result. */
export function ProductSearch({ available, onSelect, inputRef }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query.trim(), 200);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    searchProducts(debounced, controller.signal)
      .then((products) => {
        setResults(products);
        setHighlight(Math.max(products.findIndex((p) => available(p) > 0), 0));
        setError(null);
        setOpen(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `available` changes with every cart edit; re-searching then isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const choose = (product: Product) => {
    if (available(product) <= 0) return;
    onSelect(product, query.trim());
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Searching is debounced; ignore Enter until results match what was typed.
      if (debounced === query.trim() && results[highlight]) choose(results[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const showList = open && query.trim() !== "" && debounced === query.trim();

  return (
    <div className="search-box">
      <label htmlFor="product-search" className="visually-hidden">Search products</label>
      <div className="search-input">
        <Icon name="search" size={18} />
        <input
          id="product-search"
          ref={inputRef}
          type="search"
          placeholder="Search products by name, category or serial number"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-expanded={showList}
          aria-controls="product-results"
          aria-activedescendant={showList && results[highlight] ? `product-${results[highlight].id}` : undefined}
        />
        {loading && <span className="spinner" aria-label="Searching" />}
      </div>
      {error && <p className="field-error">{error}</p>}
      {showList && (
        <ul className="search-results" id="product-results" role="listbox" ref={listRef}>
          {results.length === 0 && !loading && <li className="search-empty">No products match “{query.trim()}”.</li>}
          {results.map((product, index) => {
            const left = available(product);
            return (
              <li
                key={product.id}
                id={`product-${product.id}`}
                data-index={index}
                role="option"
                aria-selected={index === highlight}
                aria-disabled={left <= 0}
                className={`search-result${index === highlight ? " highlighted" : ""}${left <= 0 ? " disabled" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(product)}
              >
                <span className="result-main">
                  <span className="result-name">{product.name}</span>
                  <span className="result-meta">
                    {product.category?.name}
                    {product.isSerialized && <span className="chip">Serial no.</span>}
                  </span>
                </span>
                <span className="result-side">
                  <span className="result-price">{formatCents(toCents(product.sellingPrice))}</span>
                  <span className={`stock ${left <= 0 ? "stock-out" : product.lowStock ? "stock-low" : ""}`}>
                    {left <= 0 ? (product.currentStock > 0 ? "All in cart" : "Out of stock") : `${left} in stock`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
