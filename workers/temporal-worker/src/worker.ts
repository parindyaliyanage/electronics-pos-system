import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { closeDb } from "./activities/db";
import { DEFAULT_TASK_QUEUE } from "./shared";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    workflowsPath: require.resolve("./workflows/installment-reminder.workflow"),
    activities,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TASK_QUEUE,
  });
  try {
    await worker.run(); // resolves after SIGINT/SIGTERM graceful shutdown
  } finally {
    await connection.close();
    await closeDb();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
