import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InstallmentPlanStatus,
  InstallmentScheduleStatus,
  PaymentType,
  Prisma,
} from "@prisma/client";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { InstallmentWorkflowsService } from "../workflows/installment-workflows.service";
import type { InstallmentQueryDto } from "./dto/installment-query.dto";
import type { CancelInstallmentPlanDto } from "./dto/cancel-installment-plan.dto";
import type { OverdueQueryDto } from "./dto/overdue-query.dto";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: InstallmentWorkflowsService,
    private readonly invoices: InvoicesService,
  ) {}

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
          ...(input.reminderDaysBefore !== undefined ? { reminderDaysBefore: input.reminderDaysBefore } : {}),
          ...(input.gracePeriodDays !== undefined ? { gracePeriodDays: input.gracePeriodDays } : {}),
          updatedById: actorId,
        },
        create: {
          id: INSTALLMENT_POLICY_ID,
          interestRate: new Prisma.Decimal(input.interestRate),
          reminderDaysBefore: input.reminderDaysBefore,
          gracePeriodDays: input.gracePeriodDays,
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

  async recordPayment(
    planId: string,
    input: RecordInstallmentPaymentDto,
    actorId: string,
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      throw new ConflictException("This payment request has already been processed");
    }

    try {
      return await this.recordPaymentOnce(planId, input, actorId, idempotencyKey);
    } catch (error) {
      // Two identical requests raced past the check above; the unique index
      // lets only one commit.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This payment request has already been processed");
      }
      throw error;
    }
  }

  private recordPaymentOnce(
    planId: string,
    input: RecordInstallmentPaymentDto,
    actorId: string,
    idempotencyKey: string,
  ) {
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
          idempotencyKey,
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
            // A partial payment on an OVERDUE installment keeps it on the
            // overdue list (FR6) until it is fully settled.
            status: nowPaid.greaterThanOrEqualTo(schedule.amount)
              ? InstallmentScheduleStatus.PAID
              : schedule.status === InstallmentScheduleStatus.OVERDUE
                ? InstallmentScheduleStatus.OVERDUE
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
      // FR7: a separate receipt for every installment payment, numbered in
      // the same transaction as the payment itself.
      const receipt = await this.invoices.createPaymentReceipt(tx, plan.saleId, payment.id, actorId);
      return { payment, receipt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })).then(async ({ payment, receipt }) => {
      // FR6: wake this plan's workflows so they see the payment immediately.
      this.workflows.signalPlanInBackground(planId);
      this.invoices.generateInBackground(receipt.id);
      return {
        payment,
        receipt: {
          id: receipt.id,
          invoiceNumber: receipt.invoiceNumber,
          downloadPath: `/payments/${payment.id}/receipt`,
        },
        plan: await this.findOne(planId),
      };
    });
  }

  async cancel(id: string, input: CancelInstallmentPlanDto, actorId: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.installmentPlan.updateMany({
        where: { id, status: InstallmentPlanStatus.ACTIVE },
        data: {
          status: InstallmentPlanStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: input.reason,
          cancelNote: input.note || null,
        },
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
    this.workflows.signalPlanInBackground(id); // FR6: stop reminders for a cancelled plan
    // Same shape as GET /installments/:id (per-installment paid/outstanding + summary).
    return this.withSummary(cancelled);
  }

  /** FR6 — overdue installments on active plans, oldest due date first (Administrator dashboard). */
  async findOverdue(query: OverdueQueryDto) {
    const where: Prisma.InstallmentScheduleWhereInput = {
      status: InstallmentScheduleStatus.OVERDUE,
      plan: {
        status: InstallmentPlanStatus.ACTIVE,
        ...(query.customerId ? { sale: { customerId: query.customerId } } : {}),
      },
    };
    const skip = (query.page - 1) * query.limit;
    const [schedules, total] = await this.prisma.$transaction([
      this.prisma.installmentSchedule.findMany({
        where,
        include: {
          allocations: { select: { amountApplied: true } },
          notifications: true,
          plan: {
            select: {
              id: true,
              saleId: true,
              sale: { select: { customer: { select: { id: true, fullName: true, phone: true, email: true } } } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
        skip,
        take: query.limit,
      }),
      this.prisma.installmentSchedule.count({ where }),
    ]);
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    return {
      data: schedules.map((schedule) => {
        const amountPaid = schedule.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amountApplied),
          new Prisma.Decimal(0),
        );
        return {
          scheduleId: schedule.id,
          planId: schedule.plan.id,
          saleId: schedule.plan.saleId,
          customer: schedule.plan.sale.customer,
          dueDate: schedule.dueDate,
          overdueAt: schedule.overdueAt,
          daysOverdue: Math.max(0, Math.floor((today - schedule.dueDate.getTime()) / 86_400_000)),
          amount: schedule.amount,
          amountPaid,
          outstanding: Prisma.Decimal.max(schedule.amount.minus(amountPaid), 0),
          reminder: schedule.notifications[0] ?? null,
        };
      }),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  /** FR6 — reminder notifications sent (or attempted) for one plan. */
  async findReminders(planId: string) {
    const plan = await this.prisma.installmentPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) throw new NotFoundException("Installment plan not found");
    return this.prisma.installmentNotification.findMany({
      where: { schedule: { planId } },
      include: { schedule: { select: { id: true, dueDate: true, amount: true, status: true } } },
      orderBy: { schedule: { dueDate: "asc" } },
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
