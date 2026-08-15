import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/send-reminder.activity";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    workflowsPath: require.resolve("./workflows/installment-reminder.workflow"),
    activities,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "smartretail-installments",
  });
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
