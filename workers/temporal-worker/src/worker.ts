import { Worker } from "@temporalio/worker";
import * as activities from "./activities/send-reminder.activity";

async function run() {
  const worker = await Worker.create({
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
