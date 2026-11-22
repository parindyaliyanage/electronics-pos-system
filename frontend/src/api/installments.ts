import { apiClient } from "./client";
import type { CancelReason, OverdueItem, PolicyDetail, Page, PaymentMethod, Plan, PlanStatus, ReceiptListItem, RecordPaymentResponse, ReminderRecord } from "./types";

export async function listPlans(params: { status?: PlanStatus; customerId?: string; page: number; limit: number }, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Plan>>("/installments", { params, signal });
  return data;
}

/** Administrator only (FR6): overdue installments on active plans, oldest first. */
export async function listOverdue(params: { page: number; limit: number }, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<OverdueItem>>("/installments/overdue", { params, signal });
  return data;
}

export async function getPlan(id: string) {
  const { data } = await apiClient.get<Plan>(`/installments/${id}`);
  return data;
}

export async function getReminders(id: string) {
  const { data } = await apiClient.get<ReminderRecord[]>(`/installments/${id}/reminders`);
  return data;
}

/** Receipts of a sale. Workers only get the ones they issued (same rule as downloads). */
export async function listReceipts(saleId: string) {
  const { data } = await apiClient.get<Page<ReceiptListItem>>("/invoices", { params: { saleId, type: "RECEIPT", limit: 100 } });
  return data.data;
}

export async function recordPayment(
  planId: string,
  body: { scheduleId: string; amount: number; method: PaymentMethod },
  idempotencyKey: string,
) {
  const { data } = await apiClient.post<RecordPaymentResponse>(`/installments/${planId}/payments`, body, {
    headers: { "Idempotency-Key": idempotencyKey },
    timeout: 30_000,
  });
  return data;
}

export async function cancelPlan(id: string, body: { reason: CancelReason; note?: string }) {
  const { data } = await apiClient.patch<Plan>(`/installments/${id}/cancel`, body);
  return data;
}

export async function fetchReceipt(paymentId: string) {
  const { data } = await apiClient.get<Blob>(`/payments/${paymentId}/receipt`, { responseType: "blob" });
  return data;
}

export async function getPolicyDetail() {
  const { data } = await apiClient.get<PolicyDetail>("/installments/policy");
  return data;
}

/** Administrator only. interestRate is a fraction (0.10 = 10%). */
export async function updatePolicy(input: { interestRate: number; reminderDaysBefore: number; gracePeriodDays: number }) {
  const { data } = await apiClient.put<PolicyDetail>("/installments/policy", input);
  return data;
}
