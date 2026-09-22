-- CreateTable
CREATE TABLE "installment_policy" (
    "id" UUID NOT NULL,
    "interest_rate" DECIMAL(5,4) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_policy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_installment_policy_interest_rate"
      CHECK ("interest_rate" >= 0 AND "interest_rate" <= 1)
);

-- AddForeignKey
ALTER TABLE "installment_policy"
ADD CONSTRAINT "installment_policy_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
