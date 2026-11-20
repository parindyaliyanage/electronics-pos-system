// Integration test of the real workflow code against Temporal's time-skipping
// test server (downloaded on first run). Activities are mocked.
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type * as activities from "../activities";
import {
  RECHECK_SIGNAL,
  workflowIdFor,
  type InstallmentReminderInput,
  type PaymentStatus,
} from "../shared";

jest.setTimeout(120_000);

const DAY = 1_000; // compressed day: the whole timeline spans ~seconds of virtual time

let env: TestWorkflowEnvironment;

beforeAll(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await env?.teardown();
});

// The test server's virtual clock moves ahead as tests skip time, so all
// inputs are relative to server time rather than the wall clock.
async function input(scheduleId: string): Promise<InstallmentReminderInput> {
  const now = await env.currentTimeMs();
  const due = new Date(now);
  due.setUTCHours(0, 0, 0, 0);
  due.setUTCDate(due.getUTCDate() + 7);
  return {
    scheduleId,
    dueDate: due.toISOString().slice(0, 10),
    startedAt: new Date(now).toISOString(),
    reminderDaysBefore: 3,
    gracePeriodDays: 5,
    dayDurationMs: DAY,
  };
}

function setup(mocks: Partial<typeof activities>) {
  const calls = { sendReminder: 0, escalateOverdue: 0, checkPaymentStatus: 0 };
  let status: PaymentStatus = { scheduleStatus: "PENDING", planStatus: "ACTIVE" };
  const acts: typeof activities = {
    checkPaymentStatus: async () => {
      calls.checkPaymentStatus += 1;
      return status;
    },
    sendReminder: async () => {
      calls.sendReminder += 1;
      return "SENT";
    },
    escalateOverdue: async () => {
      calls.escalateOverdue += 1;
      return true;
    },
    ...mocks,
  };
  return {
    calls,
    setStatus: (next: PaymentStatus) => {
      status = next;
    },
    run: async <T>(fn: (scheduleId: string, taskQueue: string) => Promise<T>) => {
      const taskQueue = `test-${Math.random()}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        taskQueue,
        workflowsPath: require.resolve("./installment-reminder.workflow"),
        activities: acts,
      });
      return worker.runUntil(fn(`sched-${Math.random()}`, taskQueue));
    },
  };
}

it("sends one reminder and escalates an installment that is never paid", async () => {
  const t = setup({});
  const result = await t.run(async (id, taskQueue) => env.client.workflow.execute("installmentReminderWorkflow", {
    taskQueue,
    workflowId: workflowIdFor(id),
    args: [await input(id)],
  }));
  expect(result).toBe("ESCALATED");
  expect(t.calls.sendReminder).toBe(1);
  expect(t.calls.escalateOverdue).toBe(1);
});

it("stops without escalating when the installment is paid by the due date", async () => {
  const t = setup({
    sendReminder: async () => {
      t.setStatus({ scheduleStatus: "PAID", planStatus: "ACTIVE" }); // customer pays after the reminder
      return "SENT";
    },
  });
  const result = await t.run(async (id, taskQueue) => env.client.workflow.execute("installmentReminderWorkflow", {
    taskQueue,
    workflowId: workflowIdFor(id),
    args: [await input(id)],
  }));
  expect(result).toBe("SETTLED");
  expect(t.calls.escalateOverdue).toBe(0);
});

it("detects a payment signalled during the grace period and stops immediately", async () => {
  const t = setup({});
  const result = await t.run(async (id, taskQueue) => {
    const handle = await env.client.workflow.start("installmentReminderWorkflow", {
      taskQueue,
      workflowId: workflowIdFor(id),
      args: [await input(id)],
    });
    await env.sleep(8 * DAY); // past the due date, inside the 5-day grace period
    t.setStatus({ scheduleStatus: "PAID", planStatus: "ACTIVE" });
    await handle.signal(RECHECK_SIGNAL);
    return handle.result();
  });
  expect(result).toBe("SETTLED");
  expect(t.calls.sendReminder).toBe(1);
  expect(t.calls.escalateOverdue).toBe(0);
});

it("retries a failing reminder a limited number of times, then still escalates", async () => {
  const t = setup({
    sendReminder: async () => {
      t.calls.sendReminder += 1;
      throw new Error("SMTP provider unavailable");
    },
  });
  const result = await t.run(async (id, taskQueue) => env.client.workflow.execute("installmentReminderWorkflow", {
    taskQueue,
    workflowId: workflowIdFor(id),
    args: [await input(id)],
  }));
  expect(result).toBe("ESCALATED");
  expect(t.calls.sendReminder).toBe(5); // maximumAttempts
  expect(t.calls.escalateOverdue).toBe(1);
});
