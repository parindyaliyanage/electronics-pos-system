import type { InstallmentPolicy, PaymentFrequency, PaymentMethod } from "../../api/types";
import { parseAmountInput, type Cents } from "../../lib/money";
import { previewInstallments, type InstallmentPreview } from "./installment-preview";

export interface PaymentState {
  type: "FULL" | "DEPOSIT";
  method: PaymentMethod;
  /** Cash handed over (full cash payments only; used to show change, never sent). */
  cashReceived: string;
  deposit: string;
  termCount: string;
  frequency: PaymentFrequency;
}

export const initialPayment: PaymentState = {
  type: "FULL",
  method: "CASH",
  cashReceived: "",
  deposit: "",
  termCount: "6",
  frequency: "MONTHLY",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export interface PaymentCheck {
  /** Amount sent as payment.amount: the grand total, or the deposit. */
  amount: Cents | null;
  change: Cents | null;
  preview: InstallmentPreview | null;
  errors: { deposit?: string; termCount?: string; cashReceived?: string; policy?: string };
  ready: boolean;
}

/** The backend's validatePayment rules, checked before sending. */
export function checkPayment(state: PaymentState, grandTotal: Cents, policy: InstallmentPolicy | null, policyError: string | null): PaymentCheck {
  const errors: PaymentCheck["errors"] = {};

  if (state.type === "FULL") {
    const cash = parseAmountInput(state.cashReceived);
    let change: Cents | null = null;
    if (state.method === "CASH" && cash.cents !== null) {
      if (cash.cents < grandTotal) errors.cashReceived = "Cash received is less than the total.";
      else change = cash.cents - grandTotal;
    }
    if (cash.error && state.method === "CASH") errors.cashReceived = cash.error;
    return { amount: grandTotal, change, preview: null, errors, ready: grandTotal > 0 && !errors.cashReceived };
  }

  const deposit = parseAmountInput(state.deposit);
  if (deposit.error) errors.deposit = deposit.error;
  else if (deposit.cents === null) errors.deposit = "Enter the deposit amount.";
  else if (deposit.cents <= 0) errors.deposit = "The deposit must be more than zero.";
  else if (deposit.cents >= grandTotal) errors.deposit = "The deposit must be less than the total. For the full amount, choose Full payment.";

  const terms = Number(state.termCount);
  if (!/^\d+$/.test(state.termCount.trim()) || terms < 1 || terms > 60) errors.termCount = "Choose between 1 and 60 installments.";

  if (!policy) errors.policy = policyError ?? "Loading the installment policy…";

  const preview = !errors.deposit && !errors.termCount && policy && deposit.cents !== null
    ? previewInstallments(grandTotal - deposit.cents, policy.interestRate, terms, state.frequency)
    : null;

  return {
    amount: deposit.cents,
    change: null,
    preview,
    errors,
    ready: grandTotal > 0 && !errors.deposit && !errors.termCount && !errors.policy,
  };
}
