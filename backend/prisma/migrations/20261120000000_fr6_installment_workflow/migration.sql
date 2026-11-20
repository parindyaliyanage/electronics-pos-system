-- CreateEnum
CREATE TYPE "installment_notification_type" AS ENUM ('REMINDER');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "installment_policy" ADD COLUMN     "grace_period_days" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "reminder_days_before" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "installment_schedules" ADD COLUMN     "overdue_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "installment_notifications" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "type" "installment_notification_type" NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_installment_notifications_status" ON "installment_notifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "installment_notifications_schedule_id_type_key" ON "installment_notifications"("schedule_id", "type");

-- AddForeignKey
ALTER TABLE "installment_notifications" ADD CONSTRAINT "installment_notifications_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "installment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- FR6 workflow timing bounds (days)
ALTER TABLE "installment_policy"
ADD CONSTRAINT "chk_installment_policy_workflow_days"
CHECK ("reminder_days_before" BETWEEN 0 AND 30 AND "grace_period_days" BETWEEN 0 AND 60);
