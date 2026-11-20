import type { InstallmentPolicy, PaymentFrequency, PaymentMethod } from "../../api/types";
import { formatCents } from "../../lib/money";
import { FREQUENCY_LABEL } from "./installment-preview";
import { METHOD_LABEL, type PaymentCheck, type PaymentState } from "./payment";

interface Props {
  state: PaymentState;
  onChange: (next: PaymentState) => void;
  check: PaymentCheck;
  grandTotal: number;
  policy: InstallmentPolicy | null;
  disabled?: boolean;
  /** Show field errors only after the cashier tried to confirm. */
  showErrors: boolean;
}

const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];
const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as PaymentFrequency[];

export function PaymentPanel({ state, onChange, check, grandTotal, policy, disabled, showErrors }: Props) {
  const set = <K extends keyof PaymentState>(key: K, value: PaymentState[K]) => onChange({ ...state, [key]: value });
  const rate = policy ? (Number(policy.interestRate) * 100).toLocaleString("en-LK", { maximumFractionDigits: 2 }) : null;
  const err = (message?: string) => (showErrors || state.deposit || state.cashReceived) && message;

  return (
    <div className="payment-panel">
      <div className="segmented" role="radiogroup" aria-label="Payment type">
        {(["FULL", "DEPOSIT"] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={state.type === type}
            className={state.type === type ? "active" : ""}
            disabled={disabled}
            onClick={() => set("type", type)}
          >
            {type === "FULL" ? "Full payment" : "Installment"}
          </button>
        ))}
      </div>

      <fieldset className="method-group" disabled={disabled}>
        <legend>{state.type === "FULL" ? "Payment method" : "Deposit paid by"}</legend>
        <div className="chips">
          {METHODS.map((method) => (
            <label key={method} className={`chip-option${state.method === method ? " active" : ""}`}>
              <input type="radio" name="payment-method" value={method} checked={state.method === method} onChange={() => set("method", method)} />
              {METHOD_LABEL[method]}
            </label>
          ))}
        </div>
      </fieldset>

      {state.type === "FULL" ? (
        state.method === "CASH" && (
          <div className={`field${err(check.errors.cashReceived) ? " has-error" : ""}`}>
            <label htmlFor="cash-received">Cash received (optional)</label>
            <input
              id="cash-received"
              inputMode="decimal"
              placeholder={formatCents(grandTotal, false)}
              value={state.cashReceived}
              disabled={disabled}
              onChange={(e) => set("cashReceived", e.target.value)}
            />
            {err(check.errors.cashReceived)
              ? <p className="field-error">{check.errors.cashReceived}</p>
              : check.change !== null && <p className="change-due">Change to give: <strong>{formatCents(check.change)}</strong></p>}
          </div>
        )
      ) : (
        <>
          <div className={`field${err(check.errors.deposit) ? " has-error" : ""}`}>
            <label htmlFor="deposit">Deposit (LKR)</label>
            <input
              id="deposit"
              inputMode="decimal"
              placeholder="e.g. 20000"
              value={state.deposit}
              disabled={disabled}
              onChange={(e) => set("deposit", e.target.value)}
              aria-invalid={!!err(check.errors.deposit)}
            />
            {err(check.errors.deposit) && <p className="field-error">{check.errors.deposit}</p>}
          </div>
          <div className="field-row">
            <div className={`field${showErrors && check.errors.termCount ? " has-error" : ""}`}>
              <label htmlFor="term-count">Installments</label>
              <input
                id="term-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={state.termCount}
                disabled={disabled}
                onChange={(e) => set("termCount", e.target.value)}
              />
              {check.errors.termCount && <p className="field-error">{check.errors.termCount}</p>}
            </div>
            <div className="field">
              <label htmlFor="frequency">Frequency</label>
              <select id="frequency" value={state.frequency} disabled={disabled} onChange={(e) => set("frequency", e.target.value as PaymentFrequency)}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
              </select>
            </div>
          </div>

          {check.errors.policy && policy === null && <p className="field-error">{check.errors.policy}</p>}
          {check.preview && (
            <div className="plan-preview" aria-live="polite">
              <dl>
                <div><dt>Financed</dt><dd>{formatCents(check.preview.financed)}</dd></div>
                <div><dt>Interest ({rate}% flat)</dt><dd>{formatCents(check.preview.interest)}</dd></div>
                <div className="strong"><dt>Total repayable</dt><dd>{formatCents(check.preview.totalRepayable)}</dd></div>
              </dl>
              <p className="plan-summary">
                {check.preview.schedule.length} × {formatCents(check.preview.regularAmount)}
                {check.preview.lastAmount !== check.preview.regularAmount && <> (last {formatCents(check.preview.lastAmount)})</>}
                {" · "}{FREQUENCY_LABEL[state.frequency].toLowerCase()}
              </p>
              <p className="muted small">
                First due {check.preview.schedule[0].dueDate}, last due {check.preview.schedule[check.preview.schedule.length - 1].dueDate}.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
