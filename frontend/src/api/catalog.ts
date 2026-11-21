import { apiClient } from "./client";
import type { CategoryRow, Page, Product, ProductDetail, ProductInput, SerializedUnit, SerializedUnitStatus, StockMovement, StockMovementType } from "./types";

export async function listProducts(params: { search?: string; categoryId?: string; active?: boolean; page: number; limit: number }, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<Product>>("/products", { params, signal });
  return data;
}

/** Includes the product's serial units when it is serialized. */
export async function getProductDetail(id: string) {
  const { data } = await apiClient.get<ProductDetail>(`/products/${id}`);
  return data;
}

export async function createProduct(input: ProductInput) {
  // warrantyMonths null means "no warranty"; the create DTO wants it omitted.
  const { warrantyMonths, ...rest } = input;
  const { data } = await apiClient.post<Product>("/products", { ...rest, ...(warrantyMonths !== null ? { warrantyMonths } : {}) });
  return data;
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const { data } = await apiClient.patch<Product>(`/products/${id}`, input);
  return data;
}

export async function deactivateProduct(id: string) {
  const { data } = await apiClient.patch<Product>(`/products/${id}/deactivate`);
  return data;
}

export async function listCategories() {
  const { data } = await apiClient.get<CategoryRow[]>("/categories");
  return data;
}

export async function createCategory(name: string) {
  const { data } = await apiClient.post<CategoryRow>("/categories", { name });
  return data;
}

export async function renameCategory(id: string, name: string) {
  const { data } = await apiClient.patch<CategoryRow>(`/categories/${id}`, { name });
  return data;
}

export async function deactivateCategory(id: string) {
  const { data } = await apiClient.patch<CategoryRow>(`/categories/${id}/deactivate`);
  return data;
}

/** Administrator only. */
export async function listMovements(productId: string, page: number, limit = 20) {
  const { data } = await apiClient.get<Page<StockMovement>>("/inventory/movements", { params: { productId, page, limit } });
  return data;
}

/** Administrator only; quantity is signed (+ adds stock, − removes it). */
export async function createMovement(input: { productId: string; type: Exclude<StockMovementType, "SALE">; quantity: number }) {
  const { data } = await apiClient.post<StockMovement>("/inventory/movements", input);
  return data;
}

export async function listUnits(params: { productId: string; status?: SerializedUnitStatus; search?: string; page: number; limit: number }) {
  const { data } = await apiClient.get<Page<SerializedUnit>>("/inventory/serialized-units", { params });
  return data;
}

/** Administrator only: registers one physical unit (adds 1 to stock). */
export async function registerUnit(input: { productId: string; serialNumber: string; warrantyStartDate?: string }) {
  const { data } = await apiClient.post<SerializedUnit>("/inventory/serialized-units", input);
  return data;
}
