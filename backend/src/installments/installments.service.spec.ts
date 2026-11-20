import { ConflictException } from "@nestjs/common";
import {
  InstallmentCancelReason,
  InstallmentPlanStatus,
  InstallmentScheduleStatus,
  PaymentMethod,
  PaymentType,
  Prisma,
} from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { InstallmentWorkflowsService } from "../workflows/installment-workflows.service";
import type { InvoicesService } from "../invoices/invoices.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CancelInstallmentPlanDto } from "./dto/cancel-installment-plan.dto";
import { InstallmentsService } from "./installments.service";

describe("InstallmentsService.recordPayment", () => {
  const planId = "8c3f3a52-6f0e-4a8f-9a55-0c1f2d1b9e01";
  const saleId = "0b6a1c1e-2f3d-4e5f-8a9b-1c2d3e4f5a6b";
  const actorId = "4f91608d-0bb9-4dd6-b726-b0376e084547";
  const idempotencyKey = "6510c697-726c-46ba-8625-a091ef830b01";
  const schedules = [
    { id: "schedule-1", dueDate: new Date("2026-12-20"), amount: new Prisma.Decimal(100), status: InstallmentScheduleStatus.PENDING },
    { id: "schedule-2", dueDate: new Date("2027-01-20"), amount: new Prisma.Decimal(100), status: InstallmentScheduleStatus.PENDING },
  ];

  const tx = {
    installmentPlan: { findUnique: jest.fn(), update: jest.fn() },
    paymentAllocation: { groupBy: jest.fn(), create: jest.fn() },
    payment: { create: jest.fn() },
    installmentSchedule: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const paymentFindUnique = jest.fn();
  const planFindUnique = jest.fn();
  const transaction = jest.fn((operation: (client: typeof tx) => unknown) => operation(tx));
  const prisma = {
    payment: { findUnique: paymentFindUnique },
    installmentPlan: { findUnique: planFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const workflows = { signalPlanInBackground: jest.fn() } as unknown as InstallmentWorkflowsService;
  const invoices = {
    createPaymentReceipt: jest.fn().mockResolvedValue({ id: "invoice-1", invoiceNumber: "RCP-000001" }),
    generateInBackground: jest.fn(),
  } as unknown as InvoicesService;
  const service = new InstallmentsService(prisma, workflows, invoices);
  const input = { scheduleId: "schedule-1", amount: 150, method: PaymentMethod.CASH };

  beforeEach(() => {
    jest.clearAllMocks();
    paymentFindUnique.mockResolvedValue(null);
    tx.installmentPlan.findUnique.mockResolvedValue({
      id: planId,
      saleId,
      status: InstallmentPlanStatus.ACTIVE,
      schedules,
    });
    tx.paymentAllocation.groupBy.mockResolvedValue([]);
    tx.payment.create.mockResolvedValue({ id: "payment-1", amount: new Prisma.Decimal(150) });
    planFindUnique.mockResolvedValue({
      id: planId,
      schedules: schedules.map((schedule) => ({ ...schedule, allocations: [] })),
    });
  });

  it("stores the idempotency key and spreads an overpayment into the next installment", async () => {
    await service.recordPayment(planId, input, actorId, idempotencyKey);

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        saleId,
        type: PaymentType.INSTALLMENT,
        idempotencyKey,
      }),
    });
    expect(tx.paymentAllocation.create).toHaveBeenNthCalledWith(1, {
      data: { paymentId: "payment-1", scheduleId: "schedule-1", amountApplied: new Prisma.Decimal(100) },
    });
    expect(tx.paymentAllocation.create).toHaveBeenNthCalledWith(2, {
      data: { paymentId: "payment-1", scheduleId: "schedule-2", amountApplied: new Prisma.Decimal(50) },
    });
    expect(tx.installmentSchedule.update).toHaveBeenNthCalledWith(1, {
      where: { id: "schedule-1" },
      data: { status: InstallmentScheduleStatus.PAID },
    });
    expect(tx.installmentSchedule.update).toHaveBeenNthCalledWith(2, {
      where: { id: "schedule-2" },
      data: { status: InstallmentScheduleStatus.PARTIALLY_PAID },
    });
  });

  it("rejects a repeated idempotency key before starting another transaction", async () => {
    paymentFindUnique.mockResolvedValue({ id: "existing-payment" });

    await expect(service.recordPayment(planId, input, actorId, idempotencyKey))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
    expect(workflows.signalPlanInBackground).not.toHaveBeenCalled();
  });

  it("turns a unique-key race on the payment into a conflict", async () => {
    tx.payment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`idempotency_key`)",
      { code: "P2002", clientVersion: "test" },
    ));

    await expect(service.recordPayment(planId, input, actorId, idempotencyKey))
      .rejects.toThrow("This payment request has already been processed");
    expect(workflows.signalPlanInBackground).not.toHaveBeenCalled();
  });
});

describe("InstallmentsService.cancel", () => {
  const tx = {
    installmentPlan: { updateMany: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
  } as unknown as PrismaService;
  const workflows = { signalPlanInBackground: jest.fn() } as unknown as InstallmentWorkflowsService;
  const service = new InstallmentsService(prisma, workflows, {} as InvoicesService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.installmentPlan.updateMany.mockResolvedValue({ count: 1 });
    tx.installmentPlan.findUniqueOrThrow.mockResolvedValue({
      id: "plan-1",
      status: InstallmentPlanStatus.CANCELLED,
      schedules: [{
        id: "s1", dueDate: new Date("2026-12-20"), amount: new Prisma.Decimal(100), status: InstallmentScheduleStatus.PARTIALLY_PAID,
        allocations: [{ amountApplied: new Prisma.Decimal(40) }],
      }],
    });
  });

  it("stores the reason and note, audits, stops reminders, and returns the summary", async () => {
    const plan = await service.cancel("plan-1", { reason: InstallmentCancelReason.DEBT_WRITTEN_OFF, note: "Customer moved abroad" }, "admin");
    expect(tx.installmentPlan.updateMany).toHaveBeenCalledWith({
      where: { id: "plan-1", status: InstallmentPlanStatus.ACTIVE },
      data: expect.objectContaining({
        status: InstallmentPlanStatus.CANCELLED,
        cancelReason: InstallmentCancelReason.DEBT_WRITTEN_OFF,
        cancelNote: "Customer moved abroad",
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "CANCEL", entityId: "plan-1" }) });
    expect(workflows.signalPlanInBackground).toHaveBeenCalledWith("plan-1");
    expect(plan.summary.outstandingBalance.toString()).toBe("60");
  });

  it("refuses a plan that is not active", async () => {
    tx.installmentPlan.updateMany.mockResolvedValue({ count: 0 });
    tx.installmentPlan.findUnique.mockResolvedValue({ id: "plan-1", status: InstallmentPlanStatus.COMPLETED });
    await expect(service.cancel("plan-1", { reason: InstallmentCancelReason.OTHER, note: "x" }, "admin"))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe("CancelInstallmentPlanDto", () => {
  const check = (body: object) => validate(plainToInstance(CancelInstallmentPlanDto, body)).then((errors) => errors.map((e) => e.property));

  it("requires a valid reason", async () => {
    expect(await check({})).toContain("reason");
    expect(await check({ reason: "BORED" })).toContain("reason");
    expect(await check({ reason: "ITEM_RETURNED" })).toEqual([]);
  });

  it("requires a note only for OTHER, and limits its length", async () => {
    expect(await check({ reason: "OTHER" })).toContain("note");
    expect(await check({ reason: "OTHER", note: "   " })).toContain("note");
    expect(await check({ reason: "OTHER", note: "Shop closed the account" })).toEqual([]);
    expect(await check({ reason: "ITEM_RETURNED", note: "x".repeat(501) })).toContain("note");
    expect(await check({ reason: "ITEM_RETURNED", note: "   " })).toEqual([]); // blank note is fine
    expect(await check({ reason: "OTHER", note: 5 })).toContain("note");
  });

  it("gives one clear message when OTHER has no note", async () => {
    const [error] = await validate(plainToInstance(CancelInstallmentPlanDto, { reason: "OTHER" }));
    expect(Object.values(error.constraints ?? {})).toEqual(["note is required when the reason is OTHER"]);
  });
});
