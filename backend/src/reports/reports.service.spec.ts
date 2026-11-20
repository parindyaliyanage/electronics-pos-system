import { BadRequestException, ConflictException, GoneException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { ReportFormat, ReportJobStatus, ReportJobType } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { DocumentStorageService } from "../storage/document-storage.service";
import type { CreateReportDto } from "./dto/create-report.dto";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  const tx = { reportJob: { create: jest.fn() }, auditLog: { create: jest.fn() } };
  const prisma = {
    $transaction: jest.fn((op: (client: typeof tx) => unknown) => op(tx)),
    reportJob: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    category: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const storage = { get: jest.fn(), put: jest.fn() };
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;
  const service = new ReportsService(
    prisma as unknown as PrismaService,
    storage as unknown as DocumentStorageService,
    config,
  );
  const dto = (input: Partial<CreateReportDto>) => ({ format: ReportFormat.PDF, ...input }) as CreateReportDto;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.reportJob.create.mockResolvedValue({ id: "job-1" });
    prisma.reportJob.findUnique.mockResolvedValue({ id: "job-1", status: ReportJobStatus.QUEUED });
    prisma.category.findUnique.mockResolvedValue({ id: "cat" });
  });

  describe("filter validation", () => {
    it("requires a date range for SALES and FINANCIAL", async () => {
      await expect(service.create(dto({ type: ReportJobType.SALES }), "admin")).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(dto({ type: ReportJobType.FINANCIAL, from: "2026-11-01" }), "admin"))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects to < from and impossible dates", async () => {
      await expect(service.create(dto({ type: ReportJobType.SALES, from: "2026-11-30", to: "2026-11-01" }), "admin"))
        .rejects.toThrow('"to" must not be before "from"');
      await expect(service.create(dto({ type: ReportJobType.SALES, from: "2026-02-30", to: "2026-03-01" }), "admin"))
        .rejects.toThrow("real calendar dates");
    });

    it("rejects a filter that does not belong to the report type", async () => {
      await expect(service.create(dto({ type: ReportJobType.INVENTORY, paymentMethod: "CASH" }), "admin"))
        .rejects.toThrow('Filter "paymentMethod" does not apply to INVENTORY reports');
    });

    it("rejects an unknown category", async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.create(dto({ type: ReportJobType.INVENTORY, categoryId: "c" }), "admin"))
        .rejects.toThrow("Category not found");
    });
  });

  describe("sync vs background", () => {
    it("queues a range longer than 31 days without generating it in the request", async () => {
      const result = await service.create(dto({ type: ReportJobType.SALES, from: "2026-01-01", to: "2026-03-31" }), "admin");
      expect(result.queued).toBe(true);
      expect(prisma.reportJob.updateMany).not.toHaveBeenCalled(); // not claimed in-request
      expect(tx.reportJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: ReportJobType.SALES,
          filters: { from: "2026-01-01", to: "2026-03-31" },
          requestedById: "admin",
        }),
      });
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it("queues when runInBackground is set even for a small range", async () => {
      const result = await service.create(dto({
        type: ReportJobType.SALES, from: "2026-11-01", to: "2026-11-02", runInBackground: true,
      }), "admin");
      expect(result.queued).toBe(true);
    });

    it("generates a small report in the request and records a failure on the job", async () => {
      prisma.reportJob.updateMany.mockResolvedValue({ count: 1 }); // claim succeeds
      prisma.reportJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1", type: ReportJobType.INVENTORY, format: ReportFormat.PDF, filters: {}, createdAt: new Date(),
      });
      // The builder's query fails -> job must end FAILED, not stuck in GENERATING.
      (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw = jest.fn().mockRejectedValue(new Error("db down"));
      const result = await service.create(dto({ type: ReportJobType.INVENTORY }), "admin");
      expect(result.queued).toBe(false);
      expect(prisma.reportJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: { status: ReportJobStatus.FAILED, errorMessage: "db down" },
      });
    });
  });

  describe("download", () => {
    it("serves the stored file for a COMPLETED report", async () => {
      prisma.reportJob.findUnique.mockResolvedValue({
        id: "job-1", status: ReportJobStatus.COMPLETED, documentUrl: "reports/job-1.csv",
        fileName: "sales-report.csv", format: ReportFormat.CSV,
      });
      storage.get.mockResolvedValue(Buffer.from("csv"));
      const file = await service.download("job-1");
      expect(file).toMatchObject({ fileName: "sales-report.csv", contentType: "text/csv; charset=utf-8" });
      expect(storage.get).toHaveBeenCalledWith("reports/job-1.csv");
    });

    it("409 while pending or failed, 410 once expired", async () => {
      prisma.reportJob.findUnique.mockResolvedValueOnce({ id: "j", status: ReportJobStatus.GENERATING });
      await expect(service.download("j")).rejects.toBeInstanceOf(ConflictException);
      prisma.reportJob.findUnique.mockResolvedValueOnce({ id: "j", status: ReportJobStatus.FAILED, errorMessage: "x" });
      await expect(service.download("j")).rejects.toBeInstanceOf(ConflictException);
      prisma.reportJob.findUnique.mockResolvedValueOnce({ id: "j", status: ReportJobStatus.EXPIRED });
      await expect(service.download("j")).rejects.toBeInstanceOf(GoneException);
    });
  });

  it("retry only re-queues FAILED/EXPIRED reports", async () => {
    prisma.reportJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.reportJob.findUnique.mockResolvedValueOnce({ status: ReportJobStatus.COMPLETED });
    await expect(service.retry("j", "admin")).rejects.toBeInstanceOf(ConflictException);
  });
});
