-- AlterTable
ALTER TABLE "sales" ADD COLUMN "idempotency_key" UUID;

-- Existing development rows predate FR3 idempotency support. Give each one a
-- stable unique value before making the column mandatory.
UPDATE "sales" SET "idempotency_key" = gen_random_uuid() WHERE "idempotency_key" IS NULL;

ALTER TABLE "sales" ALTER COLUMN "idempotency_key" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");
