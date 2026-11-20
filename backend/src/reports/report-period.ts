import { Prisma } from "@prisma/client";

/** Inclusive calendar-date range in the store's time zone, as YYYY-MM-DD. */
export interface Period {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function daysInPeriod(period: Period) {
  return Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / DAY_MS) + 1;
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the given time zone. */
export function todayIn(timeZone: string, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * SQL bounds for a timestamptz column: [start of `from`, start of the day
 * after `to`) in the store time zone, so a sale at 23:30 Colombo time lands
 * on the right day even though it is stored in UTC.
 */
export function periodBounds(period: Period, timeZone: string) {
  return {
    start: Prisma.sql`((${period.from}::date)::timestamp AT TIME ZONE ${timeZone})`,
    end: Prisma.sql`(((${period.to}::date) + 1)::timestamp AT TIME ZONE ${timeZone})`,
  };
}

export const describePeriod = (period: Period) =>
  period.from === period.to ? period.from : `${period.from} to ${period.to}`;
