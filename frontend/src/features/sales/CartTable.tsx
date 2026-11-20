import type { Dispatch } from "react";
import { Icon } from "../../components/Icon";
import { formatCents } from "../../lib/money";
import { checkLine, type CartAction, type CartLine } from "./cart";

interface Props {
  lines: CartLine[];
  dispatch: Dispatch<CartAction>;
  disabled?: boolean;
}

export function CartTable({ lines, dispatch, disabled }: Props) {
  if (!lines.length) {
    return (
      <div className="cart-empty">
        <Icon name="pos" size={28} />
        <p>The cart is empty. Search for a product above to add it.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="cart-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Price</th>
            <th className="num">Qty</th>
            <th className="num">Discount / unit</th>
            <th className="num">Total</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const check = checkLine(line);
            return (
              <tr key={line.key}>
                <td data-label="Item">
                  <div className="line-name">{line.name}</div>
                  <div className="line-meta">
                    {line.serialNumber ? <span className="mono">S/N {line.serialNumber}</span> : line.category}
                  </div>
                </td>
                <td className="num" data-label="Price">{formatCents(line.unitPrice, false)}</td>
                <td className="num" data-label="Qty">
                  {line.isSerialized ? (
                    <span className="qty-fixed" title="Serialized items are sold one unit per line">1</span>
                  ) : (
                    <div className={`qty-input${check.quantityError ? " has-error" : ""}`}>
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${line.name}`}
                        disabled={disabled || line.quantity <= 1}
                        onClick={() => dispatch({ type: "setQuantity", key: line.key, quantity: line.quantity - 1 })}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.max(line.stock, 1)}
                        aria-label={`Quantity of ${line.name}`}
                        value={line.quantity}
                        disabled={disabled}
                        onChange={(e) => dispatch({ type: "setQuantity", key: line.key, quantity: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${line.name}`}
                        disabled={disabled || line.quantity >= line.stock}
                        onClick={() => dispatch({ type: "setQuantity", key: line.key, quantity: line.quantity + 1 })}
                      >
                        +
                      </button>
                    </div>
                  )}
                  {check.quantityError && <p className="field-error">{check.quantityError}</p>}
                </td>
                <td className="num" data-label="Discount / unit">
                  <input
                    className={`discount-input${check.discountError ? " has-error" : ""}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Discount per unit for ${line.name}`}
                    value={line.discountInput}
                    disabled={disabled}
                    onChange={(e) => dispatch({ type: "setDiscount", key: line.key, input: e.target.value })}
                  />
                  {check.discountError && <p className="field-error">{check.discountError}</p>}
                </td>
                <td className="num line-total" data-label="Total">{formatCents(check.lineTotal, false)}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove ${line.name}`}
                    disabled={disabled}
                    onClick={() => dispatch({ type: "remove", key: line.key })}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
