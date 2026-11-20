import { ConflictException } from "@nestjs/common";
import {
  InstallmentPlanStatus,
  InstallmentScheduleStatus,
  PaymentMethod,
  PaymentType,
  Prisma,
} from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { InstallmentWorkflowsService } from "../workflows/installment-workflows.service";
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
  const service = new InstallmentsService(prisma, workflows);
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
