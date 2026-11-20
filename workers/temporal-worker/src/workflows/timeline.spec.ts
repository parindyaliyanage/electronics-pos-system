import type { InstallmentReminderInput } from "../shared";
import { buildTimeline, isSettled, REAL_DAY_MS } from "./timeline";

const base: InstallmentReminderInput = {
  scheduleId: "s1",
  dueDate: "2026-12-20",
  startedAt: "2026-11-20T10:00:00.000Z",
  reminderDaysBefore: 3,
  gracePeriodDays: 5,
  dayDurationMs: REAL_DAY_MS,
};

describe("buildTimeline", () => {
  it("uses real calendar offsets in production mode", () => {
    const t = buildTimeline(base);
    expect(new Date(t.reminderAt).toISOString()).toBe("2026-12-17T00:00:00.000Z");
    expect(new Date(t.dueAt).toISOString()).toBe("2026-12-20T00:00:00.000Z");
    expect(new Date(t.overdueAt).toISOString()).toBe("2026-12-25T00:00:00.000Z");
  });

  it("compresses the timeline proportionally for demos", () => {
    // Due exactly 7 days after start; 1 day = 10 seconds.
    const t = buildTimeline({
      ...base,
      startedAt: "2026-11-20T00:00:00.000Z",
      dueDate: "2026-11-27",
      dayDurationMs: 10_000,
    });
    const start = Date.parse("2026-11-20T00:00:00.000Z");
    expect(t.reminderAt - start).toBe(40_000); // day 4
    expect(t.dueAt - start).toBe(70_000); // day 7
    expect(t.overdueAt - start).toBe(120_000); // day 12
  });

  it("puts the reminder in the past when the due date is closer than the reminder window", () => {
    const t = buildTimeline({ ...base, dueDate: "2026-11-21" });
    expect(t.reminderAt).toBeLessThan(Date.parse(base.startedAt));
  });

  it("rejects malformed dates", () => {
    expect(() => buildTimeline({ ...base, dueDate: "not-a-date" })).toThrow();
  });
});

describe("isSettled", () => {
  it("stops on payment, cancellation, completion or a missing schedule", () => {
    expect(isSettled({ scheduleStatus: "PAID", planStatus: "ACTIVE" })).toBe(true);
    expect(isSettled({ scheduleStatus: "PENDING", planStatus: "CANCELLED" })).toBe(true);
    expect(isSettled({ scheduleStatus: "PENDING", planStatus: "COMPLETED" })).toBe(true);
    expect(isSettled({ scheduleStatus: "MISSING", planStatus: "MISSING" })).toBe(true);
  });

  it("keeps going while unpaid on an active plan", () => {
    expect(isSettled({ scheduleStatus: "PENDING", planStatus: "ACTIVE" })).toBe(false);
    expect(isSettled({ scheduleStatus: "PARTIALLY_PAID", planStatus: "ACTIVE" })).toBe(false);
    expect(isSettled({ scheduleStatus: "OVERDUE", planStatus: "ACTIVE" })).toBe(false);
  });
});
