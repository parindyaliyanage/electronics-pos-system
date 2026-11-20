import { InvoiceType, type Prisma } from "@prisma/client";

const PREFIX: Record<InvoiceType, string> = {
  [InvoiceType.INVOICE]: "INV",
  [InvoiceType.RECEIPT]: "RCP",
};

export function formatDocumentNumber(type: InvoiceType, sequence: number) {
  return `${PREFIX[type]}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Next gap-free number for a document type, e.g. INV-000042.
 *
 * Must run inside the sale/payment transaction: the counter row is locked by
 * the UPDATE, and if the transaction rolls back the increment rolls back too,
 * so no number is skipped (a Postgres SEQUENCE would leave gaps).
 */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, type: InvoiceType) {
  const [row] = await tx.$queryRaw<Array<{ last_number: number }>>`
    INSERT INTO document_counters (type, last_number)
    VALUES (${type}::invoice_type, 1)
    ON CONFLICT (type) DO UPDATE SET last_number = document_counters.last_number + 1
    RETURNING last_number`;
  return formatDocumentNumber(type, Number(row.last_number));
}
