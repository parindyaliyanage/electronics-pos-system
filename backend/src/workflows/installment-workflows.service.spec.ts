import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import type { PrismaService } from "../prisma/prisma.service";
import { InstallmentWorkflowsService } from "./installment-workflows.service";
import type { TemporalService } from "./temporal.service";

describe("InstallmentWorkflowsService", () => {
  const start = jest.fn();
  const signal = jest.fn();
  const client = { workflow: { start, getHandle: jest.fn(() => ({ signal })) } };
  const temporal = {
    client: jest.fn(),
    taskQueue: "smartretail-installments",
    dayDurationMs: 86_400_000,
  } as unknown as TemporalService & { client: jest.Mock };
  const prisma = {
    installmentSchedule: { findMany: jest.fn() },
    installmentPolicy: { findUnique: jest.fn() },
  } as unknown as PrismaService & {
    installmentSchedule: { findMany: jest.Mock };
    installmentPolicy: { findUnique: jest.Mock };
  };
  const service = new InstallmentWorkflowsService(prisma, temporal);

  beforeEach(() => {
    jest.clearAllMocks();
    temporal.client.mockResolvedValue(client);
    prisma.installmentPolicy.findUnique.mockResolvedValue({ reminderDaysBefore: 2, gracePeriodDays: 4 });
    prisma.installmentSchedule.findMany.mockResolvedValue([
      { id: "s1", dueDate: new Date("2026-12-20T00:00:00.000Z") },
      { id: "s2", dueDate: new Date("2027-01-20T00:00:00.000Z") },
    ]);
  });

  it("starts one workflow per open installment with the policy timing", async () => {
    start.mockResolvedValue({});
    await expect(service.startForPlan("plan-1")).resolves.toEqual({ started: 2, alreadyRunning: 0, failed: 0 });
    expect(start).toHaveBeenCalledWith("installmentReminderWorkflow", expect.objectContaining({
      workflowId: "installment-reminder-s1",
      taskQueue: "smartretail-installments",
      workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
      args: [expect.objectContaining({
        scheduleId: "s1",
        dueDate: "2026-12-20",
        reminderDaysBefore: 2,
        gracePeriodDays: 4,
      })],
    }));
  });

  it("counts workflows that are already running during sync instead of duplicating them", async () => {
    start
      .mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("exists", "installment-reminder-s1", "installmentReminderWorkflow"))
      .mockResolvedValueOnce({});
    await expect(service.sync()).resolves.toEqual({ checked: 2, started: 1, alreadyRunning: 1, failed: 0 });
  });

  it("never throws from the background start used by checkout when Temporal is down", async () => {
    temporal.client.mockRejectedValue(new Error("connection refused"));
    expect(() => service.startForPlanInBackground("plan-1")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(start).not.toHaveBeenCalled();
  });
});
