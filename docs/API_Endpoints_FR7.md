# SmartRetail API — FR7 Invoice and Receipt Generation

Endpoint reference for FR7, taken from the code in `backend/src/invoices/`. Same general rules as
[`API_Endpoints_FR1-FR5.md`](API_Endpoints_FR1-FR5.md): base URL `http://localhost:3000`,
`Authorization: Bearer <accessToken>`.

Postman collection: [`postman/SmartRetail_FR7_Invoices.postman_collection.json`](postman/SmartRetail_FR7_Invoices.postman_collection.json).

## How FR7 works

```
POST /sales/checkout
   └─ in the SAME transaction: sale + payment + invoice row (number INV-000123)
   └─ after commit (background): render PDF → store in MinIO → save the object key

POST /installments/:id/payments
   └─ in the SAME transaction: payment + allocations + receipt row (number RCP-000045)
   └─ after commit (background): render PDF → store in MinIO

GET  …/invoice  or  …/receipt  or  /invoices/:id/download
   └─ PDF stored?  yes → stream the stored file (never regenerated)
                   no  → render, store, then stream (only if MinIO was down at checkout)
```

* **Numbers are unique, sequential and gap-free.** `INV-` for sale invoices and `RCP-` for
  installment receipts, each with its own counter. The counter is updated in the same
  transaction as the sale or payment, so a failed checkout doesn't use up a number.
* **Stored once.** A PDF is rendered a single time and saved in object storage (MinIO, bucket
  `smartretail`, under `invoices/` and `receipts/`). Every later download returns the identical file.
* **Checkout never waits on PDFs.** If MinIO is down, checkout still succeeds, and the PDF is
  created on the first download.
* **Sales made before FR7** get their invoice (or receipt) number the first time someone downloads it.

### What is printed

| Document | Content (SRS 3.1.7) |
|---|---|
| **Invoice** | Number, date and time (store time zone), customer, cashier's name, items with quantity, unit price, discount and line total, subtotal, total discount, grand total, payment method |
| …installment sale | Also: deposit, financed amount, interest rate and amount, total repayable, terms, and the full schedule with due dates |
| …serialized item | Also: serial/IMEI and warranty period (`warrantyMonths` from the product, starting at the unit's `warrantyStartDate`, or the sale date if none) |
| **Receipt** | Number, date, customer, the original invoice number and sale, who received the payment, the amount and method, each installment the payment settles (amount due, paid now, balance, SETTLED / PARTIALLY PAID), and the remaining plan balance |

A receipt is a snapshot as of that payment: later payments never change the balances it shows.

## Access rules

| Who | Can see / download |
|---|---|
| Administrator | Every invoice and receipt |
| Worker | Only documents they issued: invoices for sales they processed, receipts for payments they recorded |

A Worker requesting someone else's document gets **403**, and the attempt is written to `audit_logs`
(`AUTHORIZATION_DENIED`, entity `INVOICE`).

## Endpoint summary

| # | Method | Path | Role | Returns |
|---|---|---|---|---|
| 1 | GET | `/sales/:id/invoice` | Both* | PDF |
| 2 | GET | `/payments/:id/receipt` | Both* | PDF |
| 3 | GET | `/invoices` | Both* | Paginated list |
| 4 | GET | `/invoices/:id` | Both* | Metadata |
| 5 | GET | `/invoices/:id/download` | Both* | PDF |

\* Workers are limited to their own documents.

Changes to existing endpoints:

| Endpoint | Change |
|---|---|
| `POST /sales/checkout` | Response now includes `"invoice": { "id", "invoiceNumber", "downloadPath" }` |
| `POST /installments/:id/payments` | Response now includes `"receipt": { "id", "invoiceNumber", "downloadPath" }` |
| `POST /products`, `PATCH /products/:id` | New optional field `warrantyMonths` (integer 0–120; omit for no warranty) |

---

### 1. `GET /sales/:id/invoice`
Downloads the sale's invoice PDF (`Content-Type: application/pdf`, file name `INV-000123.pdf`).
**Errors:** 404 (unknown sale), 403 (a worker who didn't make the sale), 400 (bad UUID).

### 2. `GET /payments/:id/receipt`
Downloads the receipt PDF for an **installment** payment. Get the payment id from the `POST /installments/:id/payments` response (`payment.id`) or from `GET /installments/:id`.
**Errors:** 400 (deposit or full payment: those appear on the sale invoice), 404, 403.

### 3. `GET /invoices`
Query: `type` (`INVOICE` | `RECEIPT`), `saleId`, `customerId`, `number` (partial match, e.g. `INV-0001`), `page`, `limit` (max 100).

```json
{
  "data": [
    {
      "id": "…", "invoiceNumber": "RCP-000001", "type": "RECEIPT",
      "saleId": "…", "paymentId": "…", "issuedById": "…", "createdAt": "…",
      "issuedBy": { "id": "…", "email": "cashier@shop.lk", "fullName": "Sunil Fernando" },
      "sale": { "id": "…", "createdAt": "…", "customer": { "id": "…", "fullName": "Kamala Silva", "phone": "+94…" } },
      "payment": { "id": "…", "amount": "40000", "method": "CASH", "type": "INSTALLMENT" },
      "documentStored": true,
      "downloadPath": "/invoices/…/download"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

### 4. `GET /invoices/:id`
One entry, same shape as the list. **Errors:** 404, 403, 400.

### 5. `GET /invoices/:id/download`
The PDF for any invoice or receipt by its id. **Errors:** 404, 403, 400.

## Viewing the PDF in Postman
Send the request, then open the **Body** tab, which shows the PDF preview. To save it, use
**Send → Send and Download**, or the **⋯ → Save response to file** menu on the response.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `STORE_NAME` | `SmartRetail Electronics` | Printed at the top of every document |
| `STORE_ADDRESS`, `STORE_PHONE` | (empty) | Printed under the store name when set |
| `STORE_TIMEZONE` | `Asia/Colombo` | Time zone for the date and time on documents |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` | MinIO dev values | Object storage for the PDFs. The bucket is created automatically |

## Database changes (migration `20261122000000_fr7_invoices_receipts`)

* `products.warranty_months` (int, nullable, 0–120).
* `invoices.issued_by` (FK to users, required) and `invoices.payment_id` (FK to payments, unique;
  set only for receipts, enforced by a CHECK constraint).
* New table `document_counters (type, last_number)`: the gap-free counters behind the numbers.
* `invoices.document_url` holds the object key, e.g. `invoices/INV-000001.pdf`.
