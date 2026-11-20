import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Connection } from "@temporalio/client";
import { DEFAULT_TASK_QUEUE, REAL_DAY_MS } from "./workflow.contract";

/**
 * Lazily connected Temporal client. The connection is opened on first use
 * and re-attempted on the next call after a failure, so the API starts (and
 * POS checkout keeps working) while Temporal is down — SRS 3.4.3.
 */
@Injectable()
export class TemporalService implements OnApplicationShutdown {
  private readonly logger = new Logger(TemporalService.name);
  private clientPromise?: Promise<Client>;
  private connection?: Connection;

  readonly address: string;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly dayDurationMs: number;

  constructor(config: ConfigService) {
    this.address = config.get("TEMPORAL_ADDRESS") ?? "localhost:7233";
    this.namespace = config.get("TEMPORAL_NAMESPACE") ?? "default";
    this.taskQueue = config.get("TEMPORAL_TASK_QUEUE") ?? DEFAULT_TASK_QUEUE;
    const dayMs = Number(config.get("WORKFLOW_DAY_DURATION_MS") ?? REAL_DAY_MS);
    this.dayDurationMs = Number.isFinite(dayMs) && dayMs >= 1000 ? dayMs : REAL_DAY_MS;
    if (this.dayDurationMs !== REAL_DAY_MS) {
      this.logger.warn(`WORKFLOW_DAY_DURATION_MS=${this.dayDurationMs}: installment workflows run on a compressed test timeline`);
    }
  }

  client(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = Connection.connect({ address: this.address, connectTimeout: "3 seconds" })
        .then((connection) => {
          this.connection = connection;
          return new Client({ connection, namespace: this.namespace });
        });
      this.clientPromise.catch((error: unknown) => {
        this.logger.warn(`Temporal unavailable at ${this.address}: ${String(error)}`);
        this.clientPromise = undefined;
      });
    }
    return this.clientPromise;
  }

  async onApplicationShutdown() {
    await this.connection?.close().catch(() => undefined);
  }
}
