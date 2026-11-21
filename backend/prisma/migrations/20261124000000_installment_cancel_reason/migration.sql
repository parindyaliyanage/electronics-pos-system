-- FR5: record why an installment plan was cancelled.
-- Plans cancelled before this migration keep cancel_reason NULL ("not recorded").

-- CreateEnum
CREATE TYPE "installment_cancel_reason" AS ENUM ('ITEM_RETURNED', 'DEBT_WRITTEN_OFF', 'CUSTOMER_REQUEST', 'CREATED_IN_ERROR', 'OTHER');

-- AlterTable
ALTER TABLE "installment_plans" ADD COLUMN     "cancel_note" VARCHAR(500),
ADD COLUMN     "cancel_reason" "installment_cancel_reason";

-- A reason or note only makes sense on a cancelled plan.
ALTER TABLE "installment_plans" ADD CONSTRAINT "chk_installment_plans_cancel_reason"
    CHECK ((cancel_reason IS NULL AND cancel_note IS NULL) OR status = 'CANCELLED');
