import { apiClient } from "./client";
import type {
  CheckoutRequest, CheckoutResponse, CreateCustomerResult, Customer, InstallmentPolicy, Page, Product, SerializedUnit,
} from "./types";

export async function searchProducts(search: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Product>>("/products", { params: { search, limit: 8 }, signal });
  return data.data;
}

export async function getProduct(id: string) {
  const { data } = await apiClient.get<Product>(`/products/${id}`);
  return data;
}

/** Units of a serialized product that can still be sold. */
export async function inStockUnits(productId: string, search = "") {
  const { data } = await apiClient.get<Page<SerializedUnit>>("/inventory/serialized-units", {
    params: { productId, status: "IN_STOCK", limit: 100, ...(search ? { search } : {}) },
  });
  return data;
}

export async function searchCustomers(search: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Customer>>("/customers", { params: { search, limit: 8 }, signal });
  return data.data;
}

export async function createCustomer(input: { fullName: string; phone: string; email?: string; address?: string }) {
  const { data } = await apiClient.post<CreateCustomerResult>("/customers", input);
  return data;
}

export async function getInstallmentPolicy() {
  const { data } = await apiClient.get<InstallmentPolicy>("/installments/policy");
  return data;
}

/** The same idempotency key must be reused when retrying the same sale. */
export async function checkout(request: CheckoutRequest, idempotencyKey: string) {
  const { data } = await apiClient.post<CheckoutResponse>("/sales/checkout", request, {
    headers: { "Idempotency-Key": idempotencyKey },
    timeout: 30_000,
  });
  return data;
}

export async function fetchSaleInvoice(saleId: string) {
  const { data } = await apiClient.get<Blob>(`/sales/${saleId}/invoice`, { responseType: "blob" });
  return data;
}
