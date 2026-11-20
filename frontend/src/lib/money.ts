/**
 * Money is handled in whole cents (integers) so totals never drift, matching
 * the backend's Decimal(12,2) arithmetic. The API sends and accepts amounts
 * as decimal strings or numbers in LKR.
 */
export type Cents = number;

/** "125800.5" | 125800.5 -> 12580050. Returns NaN for anything that isn't a 2-dp amount. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    // Values from the API may carry more places ("0.1000"); round those.
    const n = Number(text);
    return text !== "" && Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** 12580050 -> 125800.5 (a number the API accepts with at most 2 decimals). */
export const fromCents = (cents: Cents) => Math.round(cents) / 100;

const lkr = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatCents(cents: Cents, withCurrency = true): string {
  if (!Number.isFinite(cents)) return "-";
  const text = lkr.format(cents / 100);
  return withCurrency ? `LKR ${text}` : text;
}

/** Validates an amount typed by a user: blank, or up to 2 decimal places. */
export function parseAmountInput(input: string): { cents: Cents | null; error?: string } {
  const text = input.trim().replace(/,/g, "");
  if (text === "") return { cents: null };
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return { cents: null, error: "Enter an amount like 1500 or 1500.50." };
  return { cents: toCents(text.endsWith(".") ? text.slice(0, -1) : text) };
}
