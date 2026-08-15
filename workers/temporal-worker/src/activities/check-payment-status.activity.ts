export async function checkPaymentStatus(
  scheduleId: string,
): Promise<"PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE"> {
  // TODO: read installment_schedule_status from Postgres via the backend/Prisma.
  return "PENDING";
}
