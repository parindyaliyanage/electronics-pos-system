const lkr = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amounts arrive from the API as decimal strings ("125800.00"). */
export function formatCurrency(amount: number | string | null | undefined): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `LKR ${lkr.format(value)}`;
}

export const displayName = (user: { fullName: string | null; email: string }) => user.fullName || user.email;

export function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}
