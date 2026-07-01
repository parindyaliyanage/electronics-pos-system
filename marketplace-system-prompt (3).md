# Build Prompt: Electrical & Electronic Device Marketplace Management System

Build a full-stack web application for an electronics retailer's **staff** to manage sales, inventory, and customer installment financing, with two role-based dashboards (Administrator and Store Worker). There is **no customer-facing portal** — customers do not log in or access the system. Customers exist only as records that staff create and manage. Prioritize a **simple, clean, responsive, and intuitive** experience over feature breadth. Ship a working MVP first; treat the "Phase 2" items as optional.

---

## 1. Core Concept

An internal management system for an electronics store. Staff process in-store sales (full payment or fixed-term installment plans), manage inventory, and track customer installment balances. Admins additionally control products, pricing, interest rates, and staff accounts. Customers are recorded at point of sale but never log in.

Each staff role gets its own dashboard and permissions, enforced on both the frontend (hidden UI) and backend (protected routes).

---

## 2. User Roles & Permissions

### Administrator
- **Products:** add, edit, delete, upload images, assign categories.
- **Inventory:** view stock, adjust quantities, mark restocks, see low/out-of-stock alerts.
- **Financing:** set/edit the installment interest rate and define which plan durations are available (e.g. 3, 6, 12, 24, 36 months).
- **Staff:** create store-worker accounts, activate/suspend them.
- **Customers:** view customer list, purchase history, installment records, and overdue payments.
- **Reports:** sales by day / week / month, revenue, inventory valuation, outstanding installment balances, and top-selling products.

### Store Worker
- Create sales orders, generate invoices, register/look up customers, search products.
- View inventory, record received stock, record damaged items.
- Check a customer's installment status, record a payment, print a receipt.
- **Cannot:** delete products, change interest rates, or manage staff accounts.

> **Customers are records, not users.** They have no login, dashboard, or self-service. Staff create a customer record (name, phone, email, address) at the point of sale and manage everything on the customer's behalf — purchases, installment plans, and payments.

---

## 3. Data Model (PostgreSQL, normalized)

Core tables:
- **users** (id, email, password_hash, role [admin | worker], is_active, created_at) — staff accounts only.
- **categories** (id, name)
- **products** (id, name, category_id, brand, model_number, description, purchase_cost, selling_price, stock_quantity, reorder_level, warranty_months, image_url, created_at, updated_at)
- **inventory_movements** (id, product_id, type [received | sold | damaged | adjustment], quantity, reason, created_by, created_at)
- **customers** (id, name, phone, email, address, created_at) — no `user_id`; customers do not have login accounts.
- **sales** (id, customer_id, employee_id, subtotal, discount, tax, total, payment_method, sale_date)
- **sale_items** (id, sale_id, product_id, quantity, unit_price)
- **payments** (id, sale_id, amount, method [cash | card | bank_transfer | online], paid_at)
- **interest_rates** (id, duration_months, rate, is_active, created_at, updated_at) — stores configurable interest rates per duration (e.g., 3-month = 8%, 12-month = 12%, 36-month = 15%). **UNIQUE constraint: (duration_months, is_active=true)** ensures only one active rate per duration. When admin updates rates: insert new row with `is_active=true`, then set old row's `is_active=false`.
- **installment_plans** (id, sale_id, customer_id, interest_rate_id [FK → interest_rates], principal, interest_rate, duration_months, monthly_payment, remaining_balance, next_due_date, status [active | completed | overdue | defaulted]) — **interest_rate_id** links to the rate config at plan creation time (audit trail); **interest_rate** field is locked-in and immutable.
- **installment_payments** (id, plan_id, amount, paid_at)
<!-- #/notifications** (id, user_id, type, message, is_read, created_at) -->
- **settings** (key, value) — for currency, tax rate, and other global config (not interest rates).

> Do **not** store derived values (profit margin, total interest, total repayment). Compute them on read.

---

## 4. Installment / Interest Logic

- Interest type for MVP: **flat rate** on the principal. Interest rates are defined per duration in the `interest_rates` table (e.g., 3-month = 8%, 12-month = 12%). Admin can update rates; new plans created after an update use the new rate, while existing plans keep their locked-in rate.
- **On installment checkout:** Look up the active rate from `interest_rates` (filtered by `duration_months` and `is_active=true`), then insert into `installment_plans` with: `interest_rate_id` (FK to the rate config), `interest_rate` (the snapshot value, immutable), `monthly_payment`, `remaining_balance`, `next_due_date`, `status`. This ensures each plan audits which rate config it was created under.
- A scheduled job (or on-login check) flips overdue plans to `overdue` and emits a notification.

**Worked example to use as an acceptance test:**
Price = 1000, rate = 12% flat, duration = 12 months
→ total interest = 120, total repayment = 1120, monthly payment ≈ 93.33.
The installment view (in the staff UI) must show exactly these figures.

---

## 5. Inventory Rules

- Selling reduces `stock_quantity` automatically and writes an `inventory_movements` row.
- When `stock_quantity <= reorder_level`, show a low-stock badge on the product and a dashboard alert.
- `stock_quantity = 0` shows "Out of stock" and disables purchase.

---

## 6. Dashboards

- **Admin:** total revenue, total customers, total products, inventory value, active installments, overdue payments, a monthly-sales chart, and top-selling products.
- **Store Worker:** today's sales, recent orders, low-stock alerts, and recent customer payments.

---

## 7. Notifications (in-app)

Generate dashboard notifications for: low stock, new order, installment due soon, overdue payment, and restock. Email/SMS are Phase 2.

---

## 8. Technical Requirements

**Frontend:** React + TypeScript with **Material UI (MUI)** as the only component/styling system — do not add Tailwind. The frontend is not the focus here, so lean on MUI's prebuilt components (DataGrid for tables, Dialog, TextField, etc.) for fast, functional, professional-enough screens with minimal custom styling. React Router for navigation, React Query (or equivalent) for data fetching. Responsive, but plain MUI defaults are fine — no custom theming required.

**Backend:** Node.js + Express + TypeScript. RESTful API. Input validation (Zod or express-validator).

**Database:** PostgreSQL with migrations and a seed script.

**Auth:** JWT access tokens + refresh tokens, bcrypt password hashing, role-based route guards, basic session/refresh handling.

**Quality of life (required for MVP):**
- Pagination and search on every list (products, sales, customers, installments).
- Loading, empty, and error states on every data view.
- Invoice and receipt generation as downloadable PDFs.
- A configurable currency and tax rate.
- Seed data including **one demo account for each staff role** (admin and worker), with credentials printed in the README.

**Run setup:** Docker Compose that spins up frontend, backend, and PostgreSQL with one command. Include a clear README (setup, env vars, demo logins).

---

## 9. Phase 2 (Optional — only after MVP works)

- Reducing-balance interest as a second interest type.
- Supplier management and purchase orders.
- Email notifications (see Section 9a for the full spec) and SMS notifications.
- Audit-log viewer and annual reporting.
- HTTPS/Nginx and cloud deployment (AWS or Azure — pick one).

---

## 9a. Email Notifications (Phase 2 detail)

Email is an additional delivery channel layered on top of the in-app notifications from Section 7 — it does not replace them. The `notifications` table stays the source of truth; sending an email is an extra step for events that warrant one.

**Setup**
- Use **Nodemailer** in the Express backend.
- Send through a transactional email provider (Amazon SES, SendGrid, Mailgun, Resend, or Postmark) rather than raw SMTP, for deliverability. Keep all credentials in environment variables.
- Provide one reusable `sendEmail(to, subject, html)` helper that the rest of the code calls. Use simple HTML templates per notification type.

**Note on recipients:** since customers have no login, email (or SMS) is the *only* way to reach a customer — e.g. a payment-due reminder. These are purely outbound and depend on an email being stored on the customer record. Staff-facing emails (like low stock) go to admin/worker user accounts.

**Two kinds of triggers — implement both:**

1. **Event-driven** (fire inline, the moment it happens, alongside the in-app notification):
   - Sale completed → optional receipt/confirmation email to the customer (if an email is on file).
   - Stock drops to or below reorder level on a sale → low-stock email to admin/staff.
   - Product restocked → optional confirmation to admin.

2. **Scheduled** (a daily cron / `node-cron` job — these have no user action to hook into):
   - Query `installment_plans` for plans whose `next_due_date` is within N days → "payment due soon" email to the customer (if an email is on file).
   - Query for plans past `next_due_date` → "overdue payment" email to the customer, and flip the plan's status to `overdue`.

**Rules**
- Send asynchronously; an email failure must never block or roll back a sale. Log failures.
- Skip silently when a customer has no email on record.
- Add a `reminder_sent_at` (or equivalent) marker so the daily job does not re-send the same reminder every day.
- In development, route email to a test inbox (e.g. Mailtrap / Ethereal) so no real messages go out.

---

## 10. Deliverables

1. Working app runnable via `docker compose up`.
2. Seed script with demo data and per-role logins.
3. README with setup steps, env vars, and demo credentials.
4. The installment worked example (Section 4) verifiably correct in the UI.

Keep the UI uncluttered: clear navigation, consistent spacing, sensible defaults, and minimal clicks to complete a sale or record a payment.
