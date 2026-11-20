-- AlterTable
ALTER TABLE "products" ADD COLUMN     "warranty_months" INTEGER;

-- AlterTable: issued_by is added nullable, back-filled from the sale's
-- cashier for any pre-existing rows, then made NOT NULL.
ALTER TABLE "invoices" ADD COLUMN     "issued_by" UUID,
ADD COLUMN     "payment_id" UUID;

UPDATE "invoices" i SET "issued_by" = s."cashier_id" FROM "sales" s WHERE s."id" = i."sale_id" AND i."issued_by" IS NULL;

ALTER TABLE "invoices" ALTER COLUMN "issued_by" SET NOT NULL;

-- CreateTable
CREATE TABLE "document_counters" (
    "type" "invoice_type" NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("type")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");

-- CreateIndex
CREATE INDEX "idx_invoices_issued_by" ON "invoices"("issued_by");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- FR7 integrity rules
ALTER TABLE "products"
ADD CONSTRAINT "chk_products_warranty_months"
CHECK ("warranty_months" IS NULL OR "warranty_months" BETWEEN 0 AND 120);

-- A RECEIPT always points at the payment it acknowledges; an INVOICE never does.
ALTER TABLE "invoices"
ADD CONSTRAINT "chk_invoices_receipt_payment"
CHECK (("type" = 'RECEIPT') = ("payment_id" IS NOT NULL));

-- Seed the counters so numbering starts at 000001.
INSERT INTO "document_counters" ("type", "last_number") VALUES ('INVOICE', 0), ('RECEIPT', 0)
ON CONFLICT ("type") DO NOTHING;
