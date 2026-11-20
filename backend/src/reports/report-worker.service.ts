import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ReportsService } from "./reports.service";

/**
 * FR8 — background report worker. Polls report_jobs for QUEUED rows and
 * generates them one at a time, outside any HTTP request. The table is the
 * queue (claimed with FOR UPDATE SKIP LOCKED), so jobs survive restarts and
 * several backend instances can run this safely side by side.
 */
@Injectable()
export class ReportWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly staleMinutes: number;

  constructor(private readonly reports: ReportsService, config: ConfigService) {
    this.enabled = config.get("REPORT_WORKER_ENABLED") !== "false";
    this.intervalMs = Number(config.get("REPORT_POLL_INTERVAL_MS") ?? 5000);
    this.staleMinutes = Number(config.get("REPORT_STALE_MINUTES") ?? 10);
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    this.logger.log(`Report worker polling every ${this.intervalMs} ms`);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One polling cycle; overlapping ticks are skipped. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.reports.recoverStale(this.staleMinutes);
      await this.reports.expireOld();
      for (let processed = 0; processed < 10; processed += 1) {
        const id = await this.reports.claimNext();
        if (!id) break;
        this.logger.log(`Generating report ${id}`);
        await this.reports.process(id);
      }
    } catch (error) {
      this.logger.warn(`Report worker cycle failed; will retry: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
