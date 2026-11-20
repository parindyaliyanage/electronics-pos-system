import { apiClient } from "./client";
import type { CreateCustomerResult, Customer, CustomerHistory, Page } from "./types";

export async function searchCustomers(search: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Customer>>("/customers", { params: { search, limit: 8 }, signal });
  return data.data;
}

export async function listCustomers(params: { search?: string; page: number; limit: number }, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Customer>>("/customers", { params, signal });
  return data;
}

export async function getCustomer(id: string) {
  const { data } = await apiClient.get<Customer>(`/customers/${id}`);
  return data;
}

export async function createCustomer(input: { fullName: string; phone: string; email?: string; address?: string }) {
  const { data } = await apiClient.post<CreateCustomerResult>("/customers", input);
  return data;
}

/** Every sale of the customer, newest first (the API pages at most 100 at a time). */
export async function customerHistory(id: string) {
  const sales: CustomerHistory["sales"] = [];
  let page = 1;
  let first: CustomerHistory | null = null;
  for (;;) {
    const { data } = await apiClient.get<CustomerHistory>(`/customers/${id}/history`, { params: { page, limit: 100 } });
    first ??= data;
    sales.push(...data.sales);
    if (sales.length >= data.meta.total || data.sales.length === 0) break;
    page += 1;
  }
  return { ...first, sales };
}

export async function fetchDocument(id: string) {
  const { data } = await apiClient.get<Blob>(`/invoices/${id}/download`, { responseType: "blob" });
  return data;
}
