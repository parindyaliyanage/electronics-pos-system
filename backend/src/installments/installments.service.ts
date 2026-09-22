import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InstallmentPlanStatus,
  InstallmentScheduleStatus,
  PaymentType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { InstallmentQueryDto } from "./dto/installment-query.dto";
import type { RecordInstallmentPaymentDto } from "./dto/record-installment-payment.dto";
import type { UpdateInstallmentPolicyDto } from "./dto/update-installment-policy.dto";
import { INSTALLMENT_POLICY_ID } from "./installment.constants";

const planInclude = {
  sale: {
    include: {
      customer: true,
      cashier: { select: { id: true, email: true, role: true } },
      saleItems: { include: { product: { select: { id: true, name: true } } } },
      payments: true,
    },
  },
  schedules: {
    orderBy: { dueDate: "asc" as const },
    include: { allocations: true },
  },
} as const;

@Injectable()
export class InstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy() {
    const policy = await this.prisma.installmentPolicy.findUnique({
      where: { id: INSTALLMENT_POLICY_ID },
      include: { updatedBy: { select: { id: true, email: true } } },
    });
    if (!policy) throw new NotFoundException("Installment policy is not configured");
    return policy;
  }

  updatePolicy(input: UpdateInstallmentPolicyDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.installmentPolicy.upsert({
        where: { id: INSTALLMENT_POLICY_ID },
        update: {
          interestRate: new Prisma.Decimal(input.interestRate),
          updatedById: actorId,
        },
        create: {
          id: INSTALLMENT_POLICY_ID,
          interestRate: new Prisma.Decimal(input.interestRate),
          updatedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "CONFIGURE",
          entity: "INSTALLMENT_POLICY",
          entityId: policy.id,
        },
      });
      return policy;
    });
  }

  async findAll(query: InstallmentQueryDto) {
    const where: Prisma.InstallmentPlanWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { sale: { customerId: query.customerId } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [plans, total] = await this.prisma.$transaction([
      this.prisma.installmentPlan.findMany({
        where,
        include: planInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.installmentPlan.count({ where }),
    ]);
    return {
      data: plans.map((plan) => this.withSummary(plan)),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async findOne(id: string) {
    const plan = await this.prisma.installmentPlan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException("Installment plan not found");
    return this.withSummary(plan);
  }

  async recordPayment(planId: string, input: RecordInstallmentPaymentDto, actorId: string) {
    return this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
      const plan = await tx.installmentPlan.findUnique({
        where: { id: planId },
        include: { schedules: { orderBy: { dueDate: "asc" } } },
      });
      if (!plan) throw new NotFoundException("Installment plan not found");
      if (plan.status !== InstallmentPlanStatus.ACTIVE) {
        throw new ConflictException("Only an active installment plan can receive payments");
      }

      const selectedIndex = plan.schedules.findIndex(({ id }) => id === input.scheduleId);
      if (selectedIndex < 0) {
        throw new BadRequestException("Schedule does not belong to this installment plan");
      }
      const scheduleIds = plan.schedules.map(({ id }) => id);
      const totals = await tx.paymentAllocation.groupBy({
        by: ["scheduleId"],
        where: { scheduleId: { in: scheduleIds } },
        _sum: { amountApplied: true },
      });
      const paidBySchedule = new Map(
        totals.map((row) => [row.scheduleId, row._sum.amountApplied ?? new Prisma.Decimal(0)]),
      );
      const candidates = plan.schedules.slice(selectedIndex);
      const available = candidates.reduce((sum, schedule) => {
        const remaining = schedule.amount.minus(
          paidBySchedule.get(schedule.id) ?? new Prisma.Decimal(0),
        );
        return sum.plus(Prisma.Decimal.max(remaining, 0));
      }, new Prisma.Decimal(0));
      const paymentAmount = new Prisma.Decimal(input.amount);
      if (available.equals(0)) throw new ConflictException("Selected installment is already settled");
      if (paymentAmount.greaterThan(available)) {
        throw new BadRequestException("Payment exceeds the remaining scheduled balance");
      }

      const payment = await tx.payment.create({
        data: {
          saleId: plan.saleId,
          amount: paymentAmount,
          method: input.method,
          type: PaymentType.INSTALLMENT,
        },
      });
      let unapplied = paymentAmount;
      for (const schedule of candidates) {
        if (unapplied.equals(0)) break;
        const previouslyPaid = paidBySchedule.get(schedule.id) ?? new Prisma.Decimal(0);
        const remaining = Prisma.Decimal.max(schedule.amount.minus(previouslyPaid), 0);
        if (remaining.equals(0)) continue;
        const amountApplied = Prisma.Decimal.min(unapplied, remaining);
        await tx.paymentAllocation.create({
          data: { paymentId: payment.id, scheduleId: schedule.id, amountApplied },
        });
        const nowPaid = previouslyPaid.plus(amountApplied);
        await tx.installmentSchedule.update({
          where: { id: schedule.id },
          data: {
            status: nowPaid.greaterThanOrEqualTo(schedule.amount)
              ? InstallmentScheduleStatus.PAID
              : InstallmentScheduleStatus.PARTIALLY_PAID,
          },
        });
        paidBySchedule.set(schedule.id, nowPaid);
        unapplied = unapplied.minus(amountApplied);
      }

      const outstanding = plan.schedules.reduce((sum, schedule) => sum.plus(
        Prisma.Decimal.max(
          schedule.amount.minus(paidBySchedule.get(schedule.id) ?? new Prisma.Decimal(0)),
          0,
        ),
      ), new Prisma.Decimal(0));
      if (outstanding.equals(0)) {
        await tx.installmentPlan.update({
          where: { id: plan.id },
          data: { status: InstallmentPlanStatus.COMPLETED, completedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PAYMENT",
          entity: "INSTALLMENT_PLAN",
          entityId: plan.id,
        },
      });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })).then(async (payment) => ({
      payment,
      plan: await this.findOne(planId),
    }));
  }

  async cancel(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.installmentPlan.updateMany({
        where: { id, status: InstallmentPlanStatus.ACTIVE },
        data: { status: InstallmentPlanStatus.CANCELLED, cancelledAt: new Date() },
      });
      if (changed.count !== 1) {
        const exists = await tx.installmentPlan.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException("Installment plan not found");
        throw new ConflictException("Only an active installment plan can be cancelled");
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: "CANCEL",
          entity: "INSTALLMENT_PLAN",
          entityId: id,
        },
      });
      return tx.installmentPlan.findUniqueOrThrow({ where: { id }, include: planInclude });
    });
  }

  private withSummary<T extends { schedules: Array<{
    id: string;
    dueDate: Date;
    amount: Prisma.Decimal;
    status: InstallmentScheduleStatus;
    allocations: Array<{ amountApplied: Prisma.Decimal }>;
  }> }>(plan: T) {
    const schedules = plan.schedules.map((schedule) => {
      const amountPaid = schedule.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.amountApplied),
        new Prisma.Decimal(0),
      );
      return {
        ...schedule,
        amountPaid,
        outstanding: Prisma.Decimal.max(schedule.amount.minus(amountPaid), 0),
      };
    });
    const outstandingBalance = schedules.reduce(
      (sum, schedule) => sum.plus(schedule.outstanding),
      new Prisma.Decimal(0),
    );
    const nextSchedule = schedules.find(({ outstanding }) => outstanding.greaterThan(0));
    return {
      ...plan,
      schedules,
      summary: {
        outstandingBalance,
        nextDueDate: nextSchedule?.dueDate ?? null,
        nextAmountDue: nextSchedule?.outstanding ?? new Prisma.Decimal(0),
      },
    };
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!retryable || attempt === attempts) throw error;
      }
    }
    throw new Error("Unreachable transaction retry state");
  }
}
