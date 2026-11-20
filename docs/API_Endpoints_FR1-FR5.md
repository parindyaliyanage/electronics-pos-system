# SmartRetail API — FR1 to FR5 endpoint reference

Reference for testing the backend in Postman. Everything here is taken from the
current code in `backend/src/`. An importable Postman collection that runs these
in order lives next to this file:
[`postman/SmartRetail_FR1-FR5.postman_collection.json`](postman/SmartRetail_FR1-FR5.postman_collection.json).
User management (4a–4g) has its own collection:
[`postman/SmartRetail_FR1_User_Management.postman_collection.json`](postman/SmartRetail_FR1_User_Management.postman_collection.json).

## General rules

| Item | Value |
|---|---|
| Base URL | `http://localhost:3000` (no `/api` prefix) |
| Auth | `Authorization: Bearer <accessToken>` on every route except `POST /auth/login` |
| Body format | JSON (`Content-Type: application/json`) |
| Unknown fields | Rejected with **400** `property x should not exist` (body and query). Check spelling — fields are case-sensitive |
| IDs | UUIDs. A malformed `:id` in the path returns **400** (`ParseUUIDPipe`) |
| Money | Up to 2 decimal places. Returned as strings (Prisma `Decimal`), e.g. `"1500"` |
| Pagination | `?page=1&limit=20` (limit max 100). Paginated responses are `{ data: [...], meta: { page, limit, total } }` |

**Roles:** `ADMIN` = `ADMINISTRATOR`, `WORKER` = `WORKER`. "Both" means either role.

**Common errors**

| Status | When |
|---|---|
| 400 | Validation failed, bad UUID, business rule broken |
| 401 | No token, expired/invalid token, or wrong login |
| 403 | Logged in but wrong role (also writes an `AUTHORIZATION_DENIED` audit log row) |
| 404 | Record not found |
| 409 | Conflict: duplicate, stale price, already processed, no longer available |

**Enums**

| Enum | Values |
|---|---|
| `StockMovementType` | `PURCHASE`, `SALE`, `RETURN`, `DAMAGED`, `ADJUSTMENT` |
| `PaymentMethod` | `CASH`, `CARD`, `BANK_TRANSFER`, `OTHER` |
| `PaymentType` | `FULL`, `DEPOSIT`, `INSTALLMENT` |
| `PaymentFrequency` | `WEEKLY`, `BIWEEKLY`, `MONTHLY` |
| `InstallmentPlanStatus` | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `InstallmentScheduleStatus` | `PENDING`, `PARTIALLY_PAID`, `PAID`, `OVERDUE` |
| `SerializedUnitStatus` | `IN_STOCK`, `SOLD`, `RETURNED` |

## Endpoint summary

| # | Method | Path | Role | FR |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | Public | FR1 |
| 2 | GET | `/auth/me` | Both | FR1 |
| 3 | POST | `/auth/logout` | Both | FR1 |
| 4 | GET | `/users` | ADMIN | FR1 |
| 4a | GET | `/users/:id` | ADMIN | FR1 |
| 4b | POST | `/users` | ADMIN | FR1 |
| 4c | PATCH | `/users/:id` | ADMIN | FR1 |
| 4d | PATCH | `/users/:id/deactivate` | ADMIN | FR1 |
| 4e | PATCH | `/users/:id/activate` | ADMIN | FR1 |
| 4f | PATCH | `/users/:id/password` | ADMIN | FR1 |
| 4g | POST | `/auth/change-password` | Both | FR1 |
| 5 | GET | `/categories` | Both | FR2 |
| 6 | POST | `/categories` | ADMIN | FR2 |
| 7 | PATCH | `/categories/:id` | ADMIN | FR2 |
| 8 | PATCH | `/categories/:id/deactivate` | ADMIN | FR2 |
| 9 | GET | `/products` | Both | FR2 |
| 10 | GET | `/products/:id` | Both | FR2 |
| 11 | POST | `/products` | ADMIN | FR2 |
| 12 | PATCH | `/products/:id` | ADMIN | FR2 |
| 13 | PATCH | `/products/:id/deactivate` | ADMIN | FR2 |
| 14 | POST | `/inventory/movements` | ADMIN | FR2 |
| 15 | GET | `/inventory/movements` | ADMIN | FR2 |
| 16 | POST | `/inventory/serialized-units` | ADMIN | FR2 |
| 17 | GET | `/inventory/serialized-units` | Both | FR2 |
| 18 | POST | `/sales/checkout` | Both | FR3 |
| 19 | GET | `/sales/:id` | Both | FR3 |
| 20 | POST | `/customers` | Both | FR4 |
| 21 | GET | `/customers` | Both | FR4 |
| 22 | GET | `/customers/:id` | Both | FR4 |
| 23 | GET | `/customers/:id/history` | Both | FR4 |
| 24 | GET | `/installments/policy` | Both | FR5 |
| 25 | PUT | `/installments/policy` | ADMIN | FR5 |
| 26 | GET | `/installments` | Both | FR5 |
| 27 | GET | `/installments/:id` | Both | FR5 |
| 28 | POST | `/installments/:id/payments` | Both | FR5 |
| 29 | PATCH | `/installments/:id/cancel` | ADMIN | FR5 |

**Before you start:** run the seed (`backend/prisma/seed.ts`). It creates the admin
and worker users from `SEED_ADMIN_*` / `SEED_WORKER_*` in `.env` and the
installment policy. Without the policy, deposit checkouts fail.

---

## FR1 — Authentication and users

### 1. POST `/auth/login` — Public
Log in and get a JWT.

```json
{
  "email": "admin@smartretail.local",
  "password": "<SEED_ADMIN_PASSWORD from .env>"
}
```

| Field | Rule |
|---|---|
| `email` | Required, valid email. Trimmed and lowercased before lookup |
| `password` | Required, at least 1 character |

**200**
```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": "8h",
  "user": { "id": "uuid", "email": "admin@smartretail.local", "fullName": "System Administrator", "role": "ADMINISTRATOR", "createdAt": "..." }
}
```

**Errors:** 401 `Invalid email or password` (same message for an unknown email, a wrong password, and a deactivated account). 400 for a bad email format.

**Side effect:** every attempt, successful or not, is saved in `login_attempts`.

### 2. GET `/auth/me` — Both
Returns the logged-in user: `{ id, email, fullName, role, active, createdAt }`.
**Errors:** 401 without a token, with a bad or expired token, or when the account has been deactivated. Also 401 when the token was issued before the user's password was last changed or reset.

### 3. POST `/auth/logout` — Both
Returns **200** `{ "message": "Logged out" }`. Nothing happens on the server (JWTs are stateless); the client just throws the token away. The token keeps working until it expires.

### 4. GET `/users` — ADMIN
Lists users, newest first: `[{ id, email, fullName, role, active, createdAt }]`. Password hashes are never returned.

| Query | Meaning |
|---|---|
| `role` | `ADMINISTRATOR` or `WORKER` |
| `active` | `true` or `false` |
| `search` | Matches email or full name (case-insensitive) |

**Errors:** 403 for a worker.

### User management rules (4a–4g)

* **Never deleted, only deactivated.** Sales, stock movements and audit logs point to the user,
  so deleting one would break history.
* **Deactivation is immediate.** A deactivated user cannot log in, and any token they already
  hold is rejected on the next request. Role changes also apply on the next request.
* **At least one active administrator must always remain.** The last one cannot be deactivated
  or demoted (409).
* **No self-lockout.** An administrator cannot deactivate their own account or change their own
  role (400). Another administrator must do it.
* **Password rule:** 8–72 characters with at least one letter and one number. Stored as a
  bcrypt hash.
* **Password changes end old sessions.** After a reset (4f) or a change (4g), tokens issued
  earlier stop working.
* **Everything is audited.** `audit_logs` rows have entity `USER` and action `CREATE`, `UPDATE`,
  `CHANGE_ROLE`, `DEACTIVATE`, `ACTIVATE`, `RESET_PASSWORD` or `CHANGE_PASSWORD`.

### 4a. GET `/users/:id` — ADMIN
One user, same shape as the list. **Errors:** 404, 400 (bad UUID), 403.

### 4b. POST `/users` — ADMIN
```json
{
  "email": "cashier@shop.lk",
  "fullName": "Sunil Fernando",
  "role": "WORKER",
  "password": "Passw0rd1"
}
```

| Field | Rule |
|---|---|
| `email` | Required, valid email, unique (case-insensitive). Stored lowercased |
| `fullName` | Required, 1–200 characters. Printed on invoices and receipts (FR7) |
| `role` | `ADMINISTRATOR` or `WORKER` |
| `password` | See the password rule above |

**201** returns the user (no password). **Errors:** 409 duplicate email, 400 validation, 403.

### 4c. PATCH `/users/:id` — ADMIN
`{ "fullName": "…", "role": "ADMINISTRATOR" }`. Both fields are optional, but at least one is required.
The email cannot be changed (sending it gives 400); create a new account instead.
**Errors:** 400 (empty body, or changing your own role), 409 (demoting the last active administrator), 404.

### 4d. PATCH `/users/:id/deactivate` — ADMIN
No body. Returns the user with `"active": false`.
**Errors:** 400 (yourself), 409 (already inactive, or the last active administrator), 404.

### 4e. PATCH `/users/:id/activate` — ADMIN
No body. Returns the user with `"active": true`. **Errors:** 409 (already active), 404.

### 4f. PATCH `/users/:id/password` — ADMIN
`{ "password": "N3wPassword" }`. Sets a new password (for example, when a worker forgets theirs),
and the user's existing tokens stop working. **Errors:** 400, 404.

### 4g. POST `/auth/change-password` — Both
Any signed-in user changes their own password:
```json
{ "currentPassword": "Passw0rd1", "newPassword": "Passw0rd2" }
```
**200** returns the same shape as login (a fresh `accessToken`); the old token stops working.
**Errors:** 400 (wrong current password, new password same as the current one, or too weak), 401.

---

## FR2 — Categories

### 5. GET `/categories` — Both
All categories (active and inactive), sorted by name, each with a product count:
```json
[{ "id": "uuid", "name": "Mobile Phones", "active": true, "_count": { "products": 3 } }]
```

### 6. POST `/categories` — ADMIN
```json
{ "name": "Mobile Phones" }
```
`name`: required, 1–100 characters, trimmed.
**201** returns the category. **Errors:** 409 if the name exists (case-insensitive: `mobile phones` clashes with `Mobile Phones`). 403 for a worker.

### 7. PATCH `/categories/:id` — ADMIN
Rename. Body same as create: `{ "name": "Smartphones" }`.
**Errors:** 404 unknown id, 409 name taken by another category.

### 8. PATCH `/categories/:id/deactivate` — ADMIN
No body. Sets `active: false` on the category **and on every product in it**.
**Errors:** 404 unknown id.

---

## FR2 — Products

### 9. GET `/products` — Both
| Query | Meaning |
|---|---|
| `search` | Matches product name, category name, or any serial number (case-insensitive) |
| `categoryId` | UUID filter |
| `active` | `true` / `false`. **Default `true`** — inactive products are hidden unless you pass `active=false` |
| `page`, `limit` | Pagination |

**200** paginated. Each product includes `category`, plus two calculated fields:
`currentStock` (sum of all stock movements) and `lowStock` (`currentStock < lowStockThreshold`).

### 10. GET `/products/:id` — Both
One product with `category`, its `serializedUnits` (sorted by serial number), `currentStock` and `lowStock`.
**Errors:** 404.

### 11. POST `/products` — ADMIN
```json
{
  "categoryId": "uuid",
  "name": "Samsung Galaxy A55",
  "costPrice": 95000.00,
  "sellingPrice": 120000.00,
  "isSerialized": true,
  "lowStockThreshold": 3
}
```
| Field | Rule |
|---|---|
| `categoryId` | Required UUID; category must exist and be active |
| `name` | Required, 1–200 characters |
| `costPrice`, `sellingPrice` | Required, ≥ 0, max 2 decimals |
| `isSerialized` | Optional, default `false`. `true` = each unit is tracked by serial number |
| `lowStockThreshold` | Optional integer ≥ 0, default `5` |
| `warrantyMonths` | Optional integer 0–120, printed on invoices (FR7). Omit for no warranty |

**201** returns the product with `currentStock: 0`.
**Errors:** 404 category not found, 400 category inactive, 403 worker.

### 12. PATCH `/products/:id` — ADMIN
Any subset of the create fields, e.g. `{ "sellingPrice": 115000.00 }`.
**Errors:** 404 product/category, 400 category inactive, 400 `Serialization mode cannot change after stock history exists` (changing `isSerialized` once any stock movement exists).

### 13. PATCH `/products/:id/deactivate` — ADMIN
No body. Sets `active: false`. Inactive products cannot be sold or receive stock.
**Errors:** 404.

---

## FR2 — Inventory

### 14. POST `/inventory/movements` — ADMIN
Add a stock ledger row for a **non-serialized** product.
```json
{ "productId": "uuid", "type": "PURCHASE", "quantity": 20 }
```
| Type | Quantity sign |
|---|---|
| `PURCHASE`, `RETURN` | Must be positive |
| `SALE`, `DAMAGED` | Must be negative (e.g. `-1`) |
| `ADJUSTMENT` | Positive or negative, not 0 |

**201** returns the movement with `product`, `createdBy`, `previousStock` and `currentStock`.
**Errors (400):** wrong sign, `quantity` 0, result would make stock negative, product inactive, product is serialized (use endpoint 16 instead). 404 product not found.

### 15. GET `/inventory/movements` — ADMIN
Query: `productId` (optional), `page`, `limit`. Newest first, paginated.

### 16. POST `/inventory/serialized-units` — ADMIN
Register one physical unit of a **serialized** product.
```json
{ "productId": "uuid", "serialNumber": "IMEI-356789012345678", "warrantyStartDate": "2026-11-20" }
```
| Field | Rule |
|---|---|
| `productId` | Required UUID; product must be active and serialized |
| `serialNumber` | Required, 1–200 characters. Trimmed and **uppercased** |
| `warrantyStartDate` | Optional date |

**201** returns the unit (`status: IN_STOCK`) plus `stockMovementId`. A `PURCHASE` movement of +1 is created automatically.
**Errors:** 409 serial number already exists, 400 product not serialized or inactive, 404 product.

### 17. GET `/inventory/serialized-units` — Both
Query: `productId`, `search` (serial number, product name, category name), `page`, `limit`. Sorted by serial number. Each unit includes its `product` and `category`.

---

## FR3 — Sales / POS checkout

### 18. POST `/sales/checkout` — Both
**Required header:** `Idempotency-Key: <new UUID>` — use Postman's `{{$guid}}`. Sending the same key twice returns 409 and creates no second sale.

**Full payment**
```json
{
  "customerId": "uuid",
  "items": [
    { "productId": "uuid-of-cable", "quantity": 2, "unitPrice": 1500.00, "discount": 100.00 },
    { "productId": "uuid-of-phone", "quantity": 1, "unitPrice": 120000.00, "serializedUnitId": "uuid-of-unit" }
  ],
  "payment": { "method": "CASH", "type": "FULL", "amount": 122800.00 }
}
```

**Deposit + installment plan**
```json
{
  "customerId": "uuid",
  "items": [
    { "productId": "uuid-of-phone", "quantity": 1, "unitPrice": 120000.00, "serializedUnitId": "uuid-of-unit" }
  ],
  "payment": { "method": "CARD", "type": "DEPOSIT", "amount": 20000.00 },
  "installment": { "termCount": 12, "paymentFrequency": "MONTHLY" }
}
```

| Field | Rule |
|---|---|
| `customerId` | Required UUID, must exist |
| `items` | At least 1 line |
| `items[].quantity` | Integer ≥ 1. Must be `1` for serialized products |
| `items[].unitPrice` | Must **exactly equal** the product's current `sellingPrice` |
| `items[].discount` | Optional, default 0. **Per unit**, not per line. Cannot exceed the price |
| `items[].serializedUnitId` | Required for serialized products, not allowed for others |
| `payment.method` | `PaymentMethod` enum |
| `payment.type` | `FULL` or `DEPOSIT` (`INSTALLMENT` is rejected here) |
| `payment.amount` | ≥ 0.01, max 2 decimals |
| `installment.termCount` | 1–60. Required for `DEPOSIT`, not allowed for `FULL` |
| `installment.paymentFrequency` | `WEEKLY`, `BIWEEKLY`, `MONTHLY` |

**How totals are calculated:**
`subtotal = Σ unitPrice × quantity`, `totalDiscount = Σ discount × quantity`, `grandTotal = subtotal − totalDiscount`.
In the full-payment example: (2 × 1500 + 120000) − (2 × 100) = **122,800**.

**Payment rules:**
- `FULL`: `amount` must equal `grandTotal` exactly.
- `DEPOSIT`: `0 < amount < grandTotal`, and `installment` is required.

**Installment maths** (deposit sales): `financed = grandTotal − deposit`, `interest = financed × policy rate`,
`total = financed + interest`, split into `termCount` equal payments rounded down to cents; the last payment takes the leftover cents.
First due date is one period after the sale. Monthly dates are clamped to the month end.
Example with 10% rate: 100,000 financed → 110,000 → 11 × 9,166.66 + 1 × 9,166.74.

**201** returns the sale with `customer`, `cashier`, `saleItems` (with `product` and `serializedUnit`), `payments`,
`installmentPlan` (with `schedules`, or `null` for full payment), and
`totals: { subtotal, totalDiscount, grandTotal, amountPaid }`.

**What it changes:** serialized units become `SOLD`, a negative `SALE` stock movement is written per line, and an audit row is created. All in one transaction — any error rolls everything back.

**Errors**

| Status | Message (shortened) |
|---|---|
| 400 | `Idempotency-Key header must be a UUID` (missing or not a UUID) |
| 400 | Product inactive; discount exceeds price; serialized needs quantity 1 + `serializedUnitId`; non-serialized has `serializedUnitId`; same unit twice; same non-serialized product on two lines |
| 400 | Full amount ≠ grand total; deposit out of range; deposit without `installment`; full with `installment`; `INSTALLMENT` type; grand total ≤ 0 |
| 400 | `Installment policy is not configured by an Administrator` |
| 404 | Customer or product not found |
| 409 | `This checkout request has already been processed` (reused key) |
| 409 | `Price changed for product ...; refresh the cart` |
| 409 | Insufficient stock; serialized unit unavailable (already sold / wrong product) |

### 19. GET `/sales/:id` — Both
Same shape as the checkout response (without `totals`).
**Errors:** 404; 403 `Workers can only view their own sales` when a worker opens another cashier's sale.

---

## FR4 — Customers

### 20. POST `/customers` — Both
```json
{
  "fullName": "Nimal Perera",
  "phone": "+94 (77) 123-4567",
  "email": "nimal@example.com",
  "address": "12 Galle Road, Colombo 03"
}
```
| Field | Rule |
|---|---|
| `fullName` | Required, 1–200 characters |
| `phone` | Required. Spaces, `(`, `)` and `-` are removed, then it must be 7–15 digits, optionally starting with `+`. The example is saved as `+94771234567` |
| `email` | Optional, valid email, saved lowercase |
| `address` | Optional, up to 500 characters |

**201**
```json
{
  "customer": { "id": "uuid", "fullName": "Nimal Perera", "phone": "+94771234567", "email": "...", "address": "...", "createdAt": "..." },
  "warnings": []
}
```
A phone number that already exists **does not block** creation. The customer is created and `warnings` contains
`{ "code": "DUPLICATE_PHONE", "message": "...", "matches": [{ id, fullName, phone }] }`.

### 21. GET `/customers` — Both
Query: `search` (name contains, or phone contains — phone search is normalised the same way), `page`, `limit`.
Sorted by name, paginated, each with `_count.sales`.

### 22. GET `/customers/:id` — Both
One customer with `_count.sales`. **Errors:** 404.

### 23. GET `/customers/:id/history` — Both
Query: `page`, `limit`. Returns:
```json
{
  "customer": { ... },
  "sales": [{
    "...sale fields": "...",
    "cashier": {}, "saleItems": [], "payments": [], "installmentPlan": {}, "invoices": [],
    "totals": { "grandTotal": "...", "interest": "...", "totalPayable": "...", "amountPaid": "...", "outstanding": "..." }
  }],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```
Sales are newest first. `amountPaid` sums all payments on the sale (deposit + installment payments).
For an installment sale, `totalPayable` = deposit + all scheduled installments, so it includes interest;
`interest` = `totalPayable − grandTotal`; `outstanding` = `totalPayable − amountPaid`.
For a full-payment sale, `totalPayable` = `grandTotal` and `interest` = 0.
**Errors:** 404.

---

## FR5 — Installments

### 24. GET `/installments/policy` — Both
```json
{ "id": "00000000-0000-4000-8000-000000000001", "interestRate": "0.1", "updatedById": "uuid", "updatedAt": "...", "updatedBy": { "id": "uuid", "email": "..." } }
```
**Errors:** 404 if the seed was not run.

### 25. PUT `/installments/policy` — ADMIN
```json
{ "interestRate": 0.12 }
```
`interestRate`: decimal fraction 0–1, max 4 decimals (`0.12` = 12% flat interest). Creates the policy if missing.
Only affects **new** plans — each existing plan keeps its own `interestRate` copy.
**Errors:** 400 outside 0–1, 403 worker.

### 26. GET `/installments` — Both
Query: `status` (`ACTIVE` / `COMPLETED` / `CANCELLED`), `customerId`, `page`, `limit`. Newest first, paginated.
Each plan includes `sale` (customer, cashier, items, payments) and `schedules` with their `allocations`, plus calculated fields:
- per schedule: `amountPaid`, `outstanding`
- `summary: { outstandingBalance, nextDueDate, nextAmountDue }`

### 27. GET `/installments/:id` — Both
One plan, same shape as above. **Errors:** 404.

### 28. POST `/installments/:id/payments` — Both
`:id` is the **plan** id.
**Required header:** `Idempotency-Key: <new UUID>` (Postman: `{{$guid}}`). Sending the same key twice returns 409 and records no second payment.
```json
{ "scheduleId": "uuid-of-a-schedule-in-this-plan", "amount": 5000.00, "method": "CASH" }
```
The payment is applied to the chosen schedule first; anything left over spills into the following schedules
(by due date). Each piece is saved as a `payment_allocation`. Schedules move to `PARTIALLY_PAID` or `PAID`.
When nothing is outstanding on the whole plan, it becomes `COMPLETED`.

**201** `{ "payment": { ...type "INSTALLMENT" }, "plan": { ...same as endpoint 27 } }`

**Errors:** 400 `Idempotency-Key header must be a UUID`, 409 `This payment request has already been processed` (reused key),
404 plan, 409 plan not `ACTIVE`, 400 schedule not in this plan, 409 selected schedule (and the ones after it) already settled,
400 `Payment exceeds the remaining scheduled balance`.

### 29. PATCH `/installments/:id/cancel` — ADMIN
No body. Sets the plan to `CANCELLED` with `cancelledAt`. Returns the plan.
Note: it does not refund payments or return sold units to stock.
**Errors:** 404, 409 plan not `ACTIVE`, 403 worker.

---

## Suggested test order

The Postman collection follows this order, and saves ids into collection variables as it goes:

1. **Auth:** log in as admin and worker, `me`, `users`, negative cases (wrong password, no token, worker on `/users`).
2. **Catalog & inventory:** create a category → a normal product → a serialized product → add stock → register 2 serial units → negative cases.
3. **Customers:** create, duplicate phone warning, search, get.
4. **Installment policy:** get, update.
5. **Checkout:** full payment sale, deposit sale (creates a plan), reused idempotency key, missing key, stale price.
6. **Installment plans:** list, get, partial payment, overpayment, cancel.
7. **Customer history:** now shows both sales.
