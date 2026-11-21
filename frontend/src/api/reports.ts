import { apiClient } from "./client";
import type { DashboardSummary, Page, ReportFilters, ReportFormat, ReportJob, ReportStatus, ReportType } from "./types";

/** 201 = finished during the request, 202 = queued for the background worker. */
export async function createReport(input: { type: ReportType; format: ReportFormat } & ReportFilters) {
  const response = await apiClient.post<ReportJob>("/reports", input, { timeout: 120_000 });
  return { job: response.data, queued: response.status === 202 };
}

export async function listReports(params: { type?: ReportType; status?: ReportStatus; page: number; limit: number }, signal?: AbortSignal) {
  const { data } = await apiClient.get<Page<ReportJob>>("/reports", { params, signal });
  return data;
}

export async function getReport(id: string) {
  const { data } = await apiClient.get<ReportJob>(`/reports/${id}`);
  return data;
}

export async function downloadReport(id: string) {
  const { data } = await apiClient.get<Blob>(`/reports/${id}/download`, { responseType: "blob" });
  return data;
}

export async function retryReport(id: string) {
  const { data } = await apiClient.post<ReportJob>(`/reports/${id}/retry`);
  return data;
}

export async function getDashboard() {
  const { data } = await apiClient.get<DashboardSummary>("/dashboard/summary");
  return data;
}
