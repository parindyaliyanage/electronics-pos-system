-- FR5: reject a resubmitted installment payment instead of recording it twice.
-- Nullable because deposit/full payments are covered by sales.idempotency_key
-- and existing rows predate this column.
ALTER TABLE "payments" ADD COLUMN "idempotency_key" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
