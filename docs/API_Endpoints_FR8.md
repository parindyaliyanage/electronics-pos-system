# SmartRetail API — FR8 Reporting

Endpoint reference for FR8, taken from the code in `backend/src/reports/`. Same general rules as
[`API_Endpoints_FR1-FR5.md`](API_Endpoints_FR1-FR5.md). **All endpoints are Administrator-only**:
a Worker gets 403, and the attempt is audited.

Postman collection: [`postman/SmartRetail_FR8_Reports.postman_collection.json`](postman/SmartRetail_FR8_Reports.postman_collection.json).

## How FR8 works

```
POST /reports {type, format, filters}
   ├─ date range ≤ 31 days, or no date range ──► generated during the request ──► 201 status COMPLETED
   └─ date range > 31 days (or runInBackground) ──► 202 status QUEUED
                                                       │
            background report worker (inside the backend, polls every 5 s)
                                                       ▼
                                QUEUED → GENERATING → COMPLETED  (or FAILED, with errorMessage)

GET /reports/:id            → status + downloadPath once COMPLETED
GET /reports/:id/download   → the stored file (identical every time; never regenerated)
after 30 days               → file deleted, status EXPIRED (POST /reports/:id/retry regenerates it)
```

* **The queue is the `report_jobs` table.** Jobs survive a restart. A job stuck in GENERATING
  for more than 10 minutes, for example after a crash, is re-queued (up to 3 attempts, then FAILED).
* **A failure is visible, never silent.** It is marked `FAILED` with `errorMessage`, as SRS 3.4.3 requires.
* **PDF and CSV come from the same data,** so they always show the same figures.
* **Dates follow the store's time zone** (`STORE_TIMEZONE`, default `Asia/Colombo`). `from` and `to`
  are inclusive calendar dates, so a sale at 23:30 Colombo time counts on that day.
* **Amounts are LKR to 2 decimal places.** Revenue is net of line discounts.

## The four reports

| `type` | Contents | Allowed filters |
|---|---|---|
| `SALES` | Totals (sales, units, gross, discounts, net revenue, average sale); revenue by day or month; by product; by category; by cashier | `from`*, `to`*, `categoryId`, `cashierId`, `groupBy` (`DAY` default \| `MONTH`) |
| `INVENTORY` | Current stock of every active product, valuation at cost and at selling price, low-stock list with "short by" | `categoryId`, `stockThreshold` (overrides each product's own threshold), `lowStockOnly` |
| `INSTALLMENTS` | Upcoming payments in a due-date window, overdue accounts with days overdue, outstanding balance by customer, plan list | `from` + `to` (due-date window, default today to +30 days), `status` (`ACTIVE` \| `OVERDUE` \| `COMPLETED`) |
| `FINANCIAL` | Money received by payment type and method, daily cash summary (cash / card / bank / other), outstanding receivables aged as not yet due, 1–30, 31–60, 61–90 or 90+ days overdue | `from`*, `to`*, `paymentMethod` |

\* required. Sending a filter that doesn't belong to the type returns 400, so nothing is silently ignored.

Notes:
* With a `categoryId`, the Sales report counts only that category's lines. "Sales" then means
  sales that contain at least one such line.
* Installment `status=OVERDUE` means active plans with at least one installment that the FR6
  workflow has marked OVERDUE.
* The Inventory report and the receivables sections are live as of generation time; they don't depend on the date range.

## Endpoint summary

| # | Method | Path | Returns |
|---|---|---|---|
| 1 | POST | `/reports` | 201 (done) or 202 (queued) with the job |
| 2 | GET | `/reports` | Report history (filters: `type`, `status`, `page`, `limit`) |
| 3 | GET | `/reports/:id` | Job status |
| 4 | GET | `/reports/:id/download` | The PDF or CSV file |
| 5 | POST | `/reports/:id/retry` | 202: re-queues a FAILED or EXPIRED report |
| 6 | GET | `/dashboard/summary` | Admin dashboard cards and lists ([details](#administrator-dashboard-get-dashboardsummary)) |

---

### 1. `POST /reports`

```json
{
  "type": "SALES",
  "format": "PDF",
  "from": "2026-11-01",
  "to": "2026-11-30",
  "categoryId": "…optional…",
  "cashierId": "…optional…",
  "groupBy": "DAY"
}
```

| Field | Rule |
|---|---|
| `type` | `SALES`, `INVENTORY`, `INSTALLMENTS`, `FINANCIAL` |
| `format` | `PDF` (default) or `CSV` |
| `from`, `to` | `YYYY-MM-DD`, real dates, `to` ≥ `from`, at most 3,660 days. Both or neither |
| `runInBackground` | Optional `true`: queue even a small report (useful to see the pending flow) |

**201** (small report, finished during the request) or **202** (queued):
```json
{
  "id": "…", "type": "SALES", "format": "PDF",
  "filters": { "from": "2026-11-01", "to": "2026-11-30" },
  "status": "COMPLETED",
  "fileName": "sales-report_2026-11-01_to_2026-11-30.pdf",
  "errorMessage": null, "attempts": 1,
  "startedAt": "…", "completedAt": "…", "expiresAt": "…(+30 days)",
  "createdAt": "…", "updatedAt": "…",
  "requestedBy": { "id": "…", "email": "admin@…", "fullName": "System Administrator" },
  "downloadPath": "/reports/…/download"
}
```
**Errors:** 400 (missing or invalid dates, a filter not allowed for the type, unknown category or cashier,
invalid enum), 403 (worker).

### 2. `GET /reports`
Newest first, `{ data: [...jobs], meta: { page, limit, total } }`. This is the "Reports screen" history.

### 3. `GET /reports/:id`
| `status` | Meaning |
|---|---|
| `QUEUED` | Waiting for the background worker |
| `GENERATING` | Being built now |
| `COMPLETED` | Ready; `downloadPath` is set |
| `FAILED` | See `errorMessage`; use retry |
| `EXPIRED` | Retention period over, file deleted; use retry |

### 4. `GET /reports/:id/download`
Streams the stored file as an attachment (`application/pdf` or `text/csv`).
**409** while QUEUED or GENERATING, or when FAILED. **410** once EXPIRED. 404 for an unknown id.

CSV files are UTF-8 (with a BOM so Excel opens them correctly), with labelled sections and plain
numbers (no thousands separators). Cells that could run as spreadsheet formulas are escaped.

### 5. `POST /reports/:id/retry` → 202
Re-queues a `FAILED` or `EXPIRED` report with the same type, format and filters. **409** for any other status.

## Viewing reports in Postman
Run a **Download** request and open the **Body** tab: PDFs show a preview, and CSVs show as text.
To save the file, use **Send → Send and Download**.

## Administrator dashboard: `GET /dashboard/summary`

One call returns everything the Admin dashboard shows (SRS 3.9.1). It is **Administrator-only**:
a Worker gets 403. The figures are live, and they follow the same rules as the reports above,
so the dashboard and the reports always agree. "Today" is the store's calendar day (`STORE_TIMEZONE`).

```json
{
  "date": "2026-11-21", "timeZone": "Asia/Colombo", "generatedAt": "…",
  "todaySales":    { "count": 6, "units": 9, "netRevenue": "728400", "averageSale": "121400" },
  "receivedToday": { "total": "530000", "byMethod": { "CASH": "500000", "CARD": "30000", "BANK_TRANSFER": "0", "OTHER": "0" } },
  "installments":  { "activePlans": 5, "outstandingBalance": "299400", "overdueInstallments": 2,
                     "overdueAmount": "20466.66", "overdueCustomers": 1 },
  "lowStock": { "count": 7, "items": [
    { "productId": "…", "name": "Wireless Mouse", "category": "Computers", "stock": 0, "threshold": 5, "shortBy": 5 } ] },
  "overdue":  { "count": 2, "items": [
    { "scheduleId": "…", "planId": "…", "customer": { "id": "…", "fullName": "…", "phone": "…" },
      "dueDate": "2026-10-22", "daysOverdue": 30, "amount": "20166.66", "paid": "0", "outstanding": "20166.66" } ] }
}
```

| Card | Rule |
|---|---|
| `todaySales` | Sales created today. Revenue is net of line discounts, the same as the Sales report |
| `receivedToday` | Money actually taken today (full payments, deposits and installments), by method |
| `installments` | Active plans only. Outstanding = each unpaid installment's amount minus what's been allocated to it. Overdue = installments the FR6 workflow has marked OVERDUE |
| `lowStock` | Active products whose stock (the sum of stock movements) is below their own threshold. `items` lists the 10 furthest below, largest shortfall first |
| `overdue` | `count` is all overdue installments; `items` lists the 10 oldest by due date. Use `planId` to open the plan (`GET /installments/:planId`) |

Amounts are decimal strings in LKR, as elsewhere in the API.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `REPORT_SYNC_MAX_DAYS` | `31` | Larger date ranges run as background jobs |
| `REPORT_RETENTION_DAYS` | `30` | How long finished files stay downloadable |
| `REPORT_POLL_INTERVAL_MS` | `5000` | How often the background worker checks for jobs |
| `REPORT_STALE_MINUTES` | `10` | When a stuck GENERATING job is re-queued |
| `REPORT_WORKER_ENABLED` | `true` | Set `false` to stop this instance processing jobs |
| `STORE_NAME`, `STORE_TIMEZONE` | | Report header, and day boundaries for date ranges |

Files are stored in MinIO under `reports/<job id>.pdf|csv` (bucket `smartretail`).

## Database changes (migration `20261123000000_fr8_reports`)

`report_jobs` gains `format`, `filters` (jsonb), `file_name`, `error_message`, `attempts`,
`started_at`, `completed_at` and `expires_at`. The status enum gains `EXPIRED`, and a new index
covers `(status, created_at)`, which the worker uses for its queue.
