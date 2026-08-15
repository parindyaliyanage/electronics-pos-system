-- =============================================================================
-- SmartRetail — PostgreSQL Schema
-- Matches the finalized ERD: 15 entities, ledger-based inventory, single
-- Payments table + PaymentAllocations join table, serialized units linked to
-- the exact sale item that sold them, ReportJobs as a tracked async job.
-- Target: PostgreSQL 14+
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('ADMINISTRATOR', 'WORKER');
CREATE TYPE stock_movement_type AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'DAMAGED', 'ADJUSTMENT');
CREATE TYPE serialized_unit_status AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE payment_type AS ENUM ('FULL', 'DEPOSIT', 'INSTALLMENT');
CREATE TYPE installment_schedule_status AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');
CREATE TYPE invoice_type AS ENUM ('INVOICE', 'RECEIPT');
CREATE TYPE report_job_type AS ENUM ('SALES', 'INVENTORY', 'INSTALLMENTS', 'FINANCIAL');
CREATE TYPE report_job_status AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED');

-- -----------------------------------------------------------------------------
-- Identity & access
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON customers (phone);

-- -----------------------------------------------------------------------------
-- Catalog & inventory
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id           UUID NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    name                  TEXT NOT NULL,
    cost_price            NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
    selling_price         NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    is_serialized         BOOLEAN NOT NULL DEFAULT FALSE,
    low_stock_threshold   INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_active ON products (active);

-- Ledger: every stock change is a row, never an overwrite of a quantity column.
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    created_by      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    type            stock_movement_type NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity <> 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_created_by ON stock_movements (created_by);

CREATE TABLE serialized_units (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    serial_number           TEXT NOT NULL UNIQUE,
    warranty_start_date     DATE,
    status                  serialized_unit_status NOT NULL DEFAULT 'IN_STOCK',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_serialized_units_product ON serialized_units (product_id);
CREATE INDEX idx_serialized_units_status ON serialized_units (status);

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------
CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    cashier_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_customer ON sales (customer_id);
CREATE INDEX idx_sales_cashier ON sales (cashier_id);
CREATE INDEX idx_sales_created_at ON sales (created_at);

CREATE TABLE sale_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id                 UUID NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
    product_id              UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    -- Set only when the product is serialized; links the sold unit to the
    -- exact line item that sold it (not just the product in general).
    serialized_unit_id      UUID REFERENCES serialized_units (id) ON DELETE RESTRICT,
    quantity                INTEGER NOT NULL CHECK (quantity > 0),
    unit_price              NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount                NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0)
);
CREATE INDEX idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);
CREATE UNIQUE INDEX uq_sale_items_serialized_unit ON sale_items (serialized_unit_id)
    WHERE serialized_unit_id IS NOT NULL; -- a serialized unit can only be sold once

-- -----------------------------------------------------------------------------
-- Payments & installments
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id         UUID NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method          payment_method NOT NULL,
    type            payment_type NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_sale ON payments (sale_id);

CREATE TABLE installment_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id         UUID NOT NULL UNIQUE REFERENCES sales (id) ON DELETE RESTRICT, -- 0 or 1 per sale
    deposit         NUMERIC(12, 2) NOT NULL CHECK (deposit >= 0),
    interest_rate   NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
    term_count      INTEGER NOT NULL CHECK (term_count > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE installment_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES installment_plans (id) ON DELETE RESTRICT,
    due_date        DATE NOT NULL,
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status          installment_schedule_status NOT NULL DEFAULT 'PENDING',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_installment_schedules_plan ON installment_schedules (plan_id);
CREATE INDEX idx_installment_schedules_due_date ON installment_schedules (due_date);
CREATE INDEX idx_installment_schedules_status ON installment_schedules (status);

-- Splits one payment across one or more schedules (handles a deposit/full
-- payment with no allocations, a normal installment payment with one, and
-- an overpayment that settles part of the next installment with two+).
CREATE TABLE payment_allocations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          UUID NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
    schedule_id         UUID NOT NULL REFERENCES installment_schedules (id) ON DELETE RESTRICT,
    amount_applied      NUMERIC(12, 2) NOT NULL CHECK (amount_applied > 0),
    UNIQUE (payment_id, schedule_id)
);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX idx_payment_allocations_schedule ON payment_allocations (schedule_id);

-- -----------------------------------------------------------------------------
-- Documents & reporting
-- -----------------------------------------------------------------------------
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id             UUID NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
    invoice_number      TEXT NOT NULL UNIQUE,
    document_url        TEXT,
    type                invoice_type NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_sale ON invoices (sale_id);

CREATE TABLE report_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    type                report_job_type NOT NULL,
    status              report_job_status NOT NULL DEFAULT 'QUEUED',
    document_url        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_jobs_requested_by ON report_jobs (requested_by);
CREATE INDEX idx_report_jobs_status ON report_jobs (status);

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    action          TEXT NOT NULL,   -- e.g. 'CREATE', 'UPDATE', 'ADJUSTMENT'
    entity          TEXT NOT NULL,   -- e.g. 'PRODUCTS', 'SALES', 'STOCK_MOVEMENTS'
    entity_id       UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity, entity_id);


