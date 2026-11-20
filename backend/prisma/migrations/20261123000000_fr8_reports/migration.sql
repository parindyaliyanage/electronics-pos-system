-- CreateEnum
CREATE TYPE "report_format" AS ENUM ('PDF', 'CSV');

-- AlterEnum
ALTER TYPE "report_job_status" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "report_jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completed_at" TIMESTAMPTZ,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "filters" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "format" "report_format" NOT NULL DEFAULT 'PDF',
ADD COLUMN     "started_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "idx_report_jobs_status_created" ON "report_jobs"("status", "created_at");

