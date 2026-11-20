import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, ReportFormat, ReportJobStatus, ReportJobType, type ReportJob } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentStorageService } from "../storage/document-storage.service";
import { buildFinancialReport } from "./builders/financial-report";
import { buildInstallmentsReport } from "./builders/installments-report";
import { buildInventoryReport } from "./builders/inventory-report";
import { buildSalesReport } from "./builders/sales-report";
import type { BuildContext, ReportFilters } from "./builders/types";
import type { CreateReportDto } from "./dto/create-report.dto";
import type { ReportQueryDto } from "./dto/report-query.dto";
import { renderReportCsv } from "./report-csv";
import type { ReportDocument } from "./report-document";
import { renderReportPdf } from "./report-pdf";
import { daysInPeriod, isIsoDate } from "./report-period";

/** Filters allowed per report type (SRS FR8 table). */
const ALLOWED_FILTERS: Record<ReportJobType, Array<keyof ReportFilters>> = {
  SALES: ["from", "to", "categoryId", "cashierId", "groupBy"],
  INVENTORY: ["categoryId", "stockThreshold", "lowStockOnly"],
  INSTALLMENTS: ["from", "to", "status"],
  FINANCIAL: ["from", "to", "paymentMethod"],
};
const DATE_RANGE_REQUIRED: ReportJobType[] = [ReportJobType.SALES, ReportJobType.FINANCIAL];
const MAX_RANGE_DAYS = 3660; // ~10 years

const jobSelect = {
  id: true,
  type: true,
  format: true,
  filters: true,
  status: true,
  fileName: true,
  errorMessage: true,
  attempts: true,
  startedAt: true,
  completedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, email: true, fullName: true } },
} as const;

/**
 * FR8 — report jobs. Small reports are generated during the request;
 * large date ranges (or runInBackground) are queued and picked up by
 * ReportWorkerService. Finished files are kept in object storage and served
 * as-is until the retention period ends.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly timeZone: string;
  private readonly storeName: string;
  readonly retentionDays: number;
  readonly syncMaxDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    config: ConfigService,
  ) {
    this.timeZone = config.get("STORE_TIMEZONE") ?? "Asia/Colombo";
    this.storeName = config.get("STORE_NAME") ?? "SmartRetail Electronics";
    this.retentionDays = Number(config.get("REPORT_RETENTION_DAYS") ?? 30);
    this.syncMaxDays = Number(config.get("REPORT_SYNC_MAX_DAYS") ?? 31);
  }

  // ---- API ------------------------------------------------------------------

  /** Returns the job and whether it was queued (202) or finished in-request (201). */
  async create(input: CreateReportDto, actorId: string) {
    const filters = await this.validateFilters(input);
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reportJob.create({
        data: {
          type: input.type,
          format: input.format,
          filters: filters as Prisma.InputJsonValue,
          requestedById: actorId,
        },
      });
      await tx.auditLog.create({ data: { actorId, action: "CREATE", entity: "REPORT", entityId: created.id } });
      return created;
    });

    const queued = input.runInBackground || this.needsBackground(input.type, filters);
    if (!queued && await this.claim(job.id)) {
      await this.process(job.id);
      return { queued: false, job: await this.findOne(job.id) };
    }
    return { queued: true, job: await this.findOne(job.id) };
  }

  async findAll(query: ReportQueryDto) {
    const where: Prisma.ReportJobWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reportJob.findMany({
        where, select: jobSelect, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit,
      }),
      this.prisma.reportJob.count({ where }),
    ]);
    return { data: rows.map((row) => this.present(row)), meta: { page: query.page, limit: query.limit, total } };
  }

  async findOne(id: string) {
    const job = await this.prisma.reportJob.findUnique({ where: { id }, select: jobSelect });
    if (!job) throw new NotFoundException("Report not found");
    return this.present(job);
  }

  async download(id: string) {
    const job = await this.prisma.reportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Report not found");
    switch (job.status) {
      case ReportJobStatus.COMPLETED:
        break;
      case ReportJobStatus.EXPIRED:
        throw new GoneException("This report has passed its retention period; use POST /reports/:id/retry to generate it again");
      case ReportJobStatus.FAILED:
        throw new ConflictException(`Report generation failed: ${job.errorMessage ?? "unknown error"}`);
      default:
        throw new ConflictException(`Report is not ready yet (status ${job.status}); check GET /reports/${job.id}`);
    }
    return {
      fileName: job.fileName ?? `${job.id}.${this.extension(job.format)}`,
      contentType: this.contentType(job.format),
      buffer: await this.storage.get(job.documentUrl!),
    };
  }

  /** Re-queue a FAILED or EXPIRED report with the same type, format and filters. */
  async retry(id: string, actorId: string) {
    const changed = await this.prisma.reportJob.updateMany({
      where: { id, status: { in: [ReportJobStatus.FAILED, ReportJobStatus.EXPIRED] } },
      data: {
        status: ReportJobStatus.QUEUED, attempts: 0, errorMessage: null, startedAt: null,
        completedAt: null, expiresAt: null, documentUrl: null, fileName: null,
      },
    });
    if (changed.count !== 1) {
      const exists = await this.prisma.reportJob.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw new NotFoundException("Report not found");
      throw new ConflictException(`Only FAILED or EXPIRED reports can be retried (status ${exists.status})`);
    }
    await this.prisma.auditLog.create({ data: { actorId, action: "RETRY", entity: "REPORT", entityId: id } });
    return this.findOne(id);
  }

  // ---- job processing (also used by ReportWorkerService) ---------------------

  /** QUEUED → GENERATING for one specific job; false if another process took it. */
  async claim(id: string) {
    const changed = await this.prisma.reportJob.updateMany({
      where: { id, status: ReportJobStatus.QUEUED },
      data: { status: ReportJobStatus.GENERATING, startedAt: new Date(), attempts: { increment: 1 } },
    });
    return changed.count === 1;
  }

  /** Claims the oldest QUEUED job, skipping rows another worker has locked. */
  async claimNext(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE report_jobs
         SET status = 'GENERATING', started_at = now(), attempts = attempts + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM report_jobs WHERE status = 'QUEUED'
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  /** Generates a claimed (GENERATING) job. Never throws: failures are recorded on the job. */
  async process(id: string) {
    const job = await this.prisma.reportJob.findUniqueOrThrow({ where: { id } });
    try {
      const document = await this.build(job);
      const buffer = job.format === ReportFormat.CSV ? renderReportCsv(document) : await renderReportPdf(document);
      const fileName = this.fileName(job);
      const key = `reports/${job.id}.${this.extension(job.format)}`;
      await this.storage.put(key, buffer, this.contentType(job.format));
      const completedAt = new Date();
      await this.prisma.reportJob.update({
        where: { id },
        data: {
          status: ReportJobStatus.COMPLETED,
          documentUrl: key,
          fileName,
          errorMessage: null,
          completedAt,
          expiresAt: new Date(completedAt.getTime() + this.retentionDays * 86_400_000),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Report ${id} failed: ${message}`);
      await this.prisma.reportJob.update({
        where: { id },
        data: { status: ReportJobStatus.FAILED, errorMessage: message.slice(0, 500) },
      });
    }
  }

  /** Jobs stuck in GENERATING (e.g. the server restarted mid-job) are re-queued, up to 3 attempts. */
  async recoverStale(staleMinutes: number) {
    return this.prisma.$executeRaw`
      UPDATE report_jobs
         SET status = CASE WHEN attempts >= 3 THEN 'FAILED'::report_job_status ELSE 'QUEUED'::report_job_status END,
             error_message = CASE WHEN attempts >= 3 THEN 'Generation was interrupted 3 times' ELSE error_message END,
             updated_at = now()
       WHERE status = 'GENERATING' AND started_at < now() - make_interval(mins => ${staleMinutes}::int)`;
  }

  /** Deletes files past their retention period and marks the jobs EXPIRED. */
  async expireOld() {
    const expired = await this.prisma.reportJob.findMany({
      where: { status: ReportJobStatus.COMPLETED, expiresAt: { lt: new Date() } },
      select: { id: true, documentUrl: true },
      take: 50,
    });
    for (const job of expired) {
      if (job.documentUrl) await this.storage.delete(job.documentUrl).catch(() => undefined);
      await this.prisma.reportJob.update({
        where: { id: job.id },
        data: { status: ReportJobStatus.EXPIRED, documentUrl: null },
      });
    }
    return expired.length;
  }

  // ---- helpers --------------------------------------------------------------

  private build(job: ReportJob): Promise<ReportDocument> {
    const filters = job.filters as ReportFilters;
    const ctx: BuildContext = { prisma: this.prisma, timeZone: this.timeZone, storeName: this.storeName, now: new Date() };
    switch (job.type) {
      case ReportJobType.SALES: return buildSalesReport(filters, ctx);
      case ReportJobType.INVENTORY: return buildInventoryReport(filters, ctx);
      case ReportJobType.INSTALLMENTS: return buildInstallmentsReport(filters, ctx);
      case ReportJobType.FINANCIAL: return buildFinancialReport(filters, ctx);
    }
  }

  private needsBackground(type: ReportJobType, filters: ReportFilters) {
    if (!filters.from || !filters.to) return false;
    return daysInPeriod({ from: filters.from, to: filters.to }) > this.syncMaxDays;
  }

  private async validateFilters(input: CreateReportDto): Promise<ReportFilters> {
    const allowed = ALLOWED_FILTERS[input.type];
    const candidate: ReportFilters = {
      from: input.from, to: input.to, categoryId: input.categoryId, cashierId: input.cashierId,
      groupBy: input.groupBy, stockThreshold: input.stockThreshold, lowStockOnly: input.lowStockOnly,
      status: input.status, paymentMethod: input.paymentMethod,
    };
    const filters: ReportFilters = {};
    for (const [key, value] of Object.entries(candidate) as Array<[keyof ReportFilters, unknown]>) {
      if (value === undefined) continue;
      if (!allowed.includes(key)) {
        throw new BadRequestException(`Filter "${key}" does not apply to ${input.type} reports (allowed: ${allowed.join(", ")})`);
      }
      (filters as Record<string, unknown>)[key] = value;
    }

    if (DATE_RANGE_REQUIRED.includes(input.type) && (!filters.from || !filters.to)) {
      throw new BadRequestException(`${input.type} reports require both "from" and "to" dates`);
    }
    if (Boolean(filters.from) !== Boolean(filters.to)) {
      throw new BadRequestException('Provide both "from" and "to", or neither');
    }
    if (filters.from && filters.to) {
      if (!isIsoDate(filters.from) || !isIsoDate(filters.to)) throw new BadRequestException("from/to must be real calendar dates");
      if (filters.to < filters.from) throw new BadRequestException('"to" must not be before "from"');
      if (daysInPeriod({ from: filters.from, to: filters.to }) > MAX_RANGE_DAYS) {
        throw new BadRequestException(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
      }
    }
    if (filters.categoryId && !(await this.prisma.category.findUnique({ where: { id: filters.categoryId }, select: { id: true } }))) {
      throw new BadRequestException("Category not found");
    }
    if (filters.cashierId && !(await this.prisma.user.findUnique({ where: { id: filters.cashierId }, select: { id: true } }))) {
      throw new BadRequestException("Cashier not found");
    }
    return filters;
  }

  private fileName(job: Pick<ReportJob, "type" | "format" | "filters" | "createdAt">) {
    const filters = job.filters as ReportFilters;
    const range = filters.from && filters.to ? `_${filters.from}_to_${filters.to}` : `_${job.createdAt.toISOString().slice(0, 10)}`;
    return `${job.type.toLowerCase()}-report${range}.${this.extension(job.format)}`;
  }

  private extension(format: ReportFormat) {
    return format === ReportFormat.CSV ? "csv" : "pdf";
  }

  private contentType(format: ReportFormat) {
    return format === ReportFormat.CSV ? "text/csv; charset=utf-8" : "application/pdf";
  }

  private present<T extends { id: string; status: ReportJobStatus }>(job: T) {
    return {
      ...job,
      downloadPath: job.status === ReportJobStatus.COMPLETED ? `/reports/${job.id}/download` : null,
    };
  }
}
