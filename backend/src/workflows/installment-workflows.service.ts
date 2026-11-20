import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from "@nestjs/common";
import { InstallmentPlanStatus, InstallmentScheduleStatus } from "@prisma/client";
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client";
import { INSTALLMENT_POLICY_ID } from "../installments/installment.constants";
import { PrismaService } from "../prisma/prisma.service";
import { TemporalService } from "./temporal.service";
import {
  RECHECK_SIGNAL,
  STATE_QUERY,
  WORKFLOW_TYPE,
  workflowIdFor,
  type InstallmentReminderInput,
} from "./workflow.contract";

const OPEN_SCHEDULE_STATUSES = [
  InstallmentScheduleStatus.PENDING,
  InstallmentScheduleStatus.PARTIALLY_PAID,
];

export interface StartSummary {
  started: number;
  alreadyRunning: number;
  failed: number;
}

/**
 * FR6 — the backend's side of the installment reminder workflow: starts one
 * workflow per installment, and signals them when a payment or cancellation
 * should be picked up straight away. Execution happens in workers/temporal-worker.
 */
@Injectable()
export class InstallmentWorkflowsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InstallmentWorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly temporal: TemporalService,
  ) {}

  /** Catch up on workflows that could not be started while Temporal was down. */
  onApplicationBootstrap() {
    if (process.env.TEMPORAL_SYNC_ON_STARTUP === "false") return;
    void this.sync()
      .then((summary) => this.logger.log(`Startup workflow sync: ${JSON.stringify(summary)}`))
      .catch((error: unknown) => this.logger.warn(`Startup workflow sync skipped: ${String(error)}`));
  }

  /** Fire-and-forget variant used after checkout, so checkout never waits on Temporal. */
  startForPlanInBackground(planId: string) {
    void this.startForPlan(planId).catch((error: unknown) => {
      this.logger.warn(`Could not start workflows for plan ${planId}; POST /workflows/installments/sync will retry: ${String(error)}`);
    });
  }

  /** Fire-and-forget: wake every workflow of a plan so it re-checks payment status now. */
  signalPlanInBackground(planId: string) {
    void this.signalPlan(planId).catch((error: unknown) => {
      this.logger.warn(`Could not signal workflows for plan ${planId}; they will re-check at their next checkpoint: ${String(error)}`);
    });
  }

  async startForPlan(planId: string): Promise<StartSummary> {
    const schedules = await this.prisma.installmentSchedule.findMany({
      where: { planId, status: { in: OPEN_SCHEDULE_STATUSES }, plan: { status: InstallmentPlanStatus.ACTIVE } },
      select: { id: true, dueDate: true },
    });
    return this.startForSchedules(schedules);
  }

  /** Starts any missing workflow for every open installment on an active plan. */
  async sync(): Promise<StartSummary & { checked: number }> {
    const schedules = await this.prisma.installmentSchedule.findMany({
      where: { status: { in: OPEN_SCHEDULE_STATUSES }, plan: { status: InstallmentPlanStatus.ACTIVE } },
      select: { id: true, dueDate: true },
    });
    const summary = await this.startForSchedules(schedules);
    return { checked: schedules.length, ...summary };
  }

  async signalPlan(planId: string) {
    const schedules = await this.prisma.installmentSchedule.findMany({
      where: { planId },
      select: { id: true },
    });
    const client = await this.temporal.client();
    let signalled = 0;
    for (const { id } of schedules) {
      try {
        await client.workflow.getHandle(workflowIdFor(id)).signal(RECHECK_SIGNAL);
        signalled += 1;
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) throw error; // already finished
      }
    }
    return { signalled };
  }

  async recheckSchedule(scheduleId: string) {
    await this.findScheduleOrThrow(scheduleId);
    const client = await this.connectedClient();
    try {
      await client.workflow.getHandle(workflowIdFor(scheduleId)).signal(RECHECK_SIGNAL);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw new NotFoundException("No running workflow for this installment");
      }
      throw error;
    }
    return { scheduleId, workflowId: workflowIdFor(scheduleId), signalled: true };
  }

  async describeSchedule(scheduleId: string) {
    const schedule = await this.findScheduleOrThrow(scheduleId);
    const client = await this.connectedClient();
    const handle = client.workflow.getHandle(workflowIdFor(scheduleId));
    let description;
    try {
      description = await handle.describe();
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw new NotFoundException("No workflow has been started for this installment yet");
      }
      throw error;
    }
    const workflowStatus = description.status.name;
    const state = await handle.query(STATE_QUERY).catch(() => null);
    const result = workflowStatus === "COMPLETED" ? await handle.result().catch(() => null) : null;
    return {
      scheduleId,
      scheduleStatus: schedule.status,
      planId: schedule.planId,
      workflowId: description.workflowId,
      runId: description.runId,
      workflowStatus,
      startTime: description.startTime,
      closeTime: description.closeTime ?? null,
      result,
      state,
    };
  }

  async health() {
    try {
      const client = await this.temporal.client();
      await client.connection.workflowService.getSystemInfo({});
      return {
        temporal: "UP",
        address: this.temporal.address,
        namespace: this.temporal.namespace,
        taskQueue: this.temporal.taskQueue,
        dayDurationMs: this.temporal.dayDurationMs,
      };
    } catch (error) {
      return { temporal: "DOWN", address: this.temporal.address, error: String(error) };
    }
  }

  private async startForSchedules(schedules: Array<{ id: string; dueDate: Date }>): Promise<StartSummary> {
    const summary: StartSummary = { started: 0, alreadyRunning: 0, failed: 0 };
    if (!schedules.length) return summary;

    const [client, policy] = await Promise.all([
      this.connectedClient(),
      this.prisma.installmentPolicy.findUnique({ where: { id: INSTALLMENT_POLICY_ID } }),
    ]);
    const startedAt = new Date().toISOString();
    for (const schedule of schedules) {
      const input: InstallmentReminderInput = {
        scheduleId: schedule.id,
        dueDate: schedule.dueDate.toISOString().slice(0, 10),
        startedAt,
        reminderDaysBefore: policy?.reminderDaysBefore ?? 3,
        gracePeriodDays: policy?.gracePeriodDays ?? 5,
        dayDurationMs: this.temporal.dayDurationMs,
      };
      try {
        await client.workflow.start(WORKFLOW_TYPE, {
          taskQueue: this.temporal.taskQueue,
          workflowId: workflowIdFor(schedule.id),
          args: [input],
          // One workflow per installment, ever: a finished one is not restarted,
          // only one that failed or was terminated.
          workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
        });
        summary.started += 1;
      } catch (error) {
        if (error instanceof WorkflowExecutionAlreadyStartedError) {
          summary.alreadyRunning += 1;
        } else {
          summary.failed += 1;
          this.logger.warn(`Failed to start workflow for schedule ${schedule.id}: ${String(error)}`);
        }
      }
    }
    return summary;
  }

  private async connectedClient() {
    try {
      return await this.temporal.client();
    } catch {
      throw new ServiceUnavailableException("Temporal is unavailable; try again once it is running");
    }
  }

  private async findScheduleOrThrow(scheduleId: string) {
    const schedule = await this.prisma.installmentSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, planId: true, status: true },
    });
    if (!schedule) throw new NotFoundException("Installment schedule not found");
    return schedule;
  }
}
