-- =============================================================================
-- SmartRetail — PostgreSQL Schema
--
-- Core POS + installment management + Temporal support + ML prediction storage
--
-- ML alignment:
--   M5 Retail Forecasting       -> Demand Forecasting / Reorder
--   Home Credit-style history   -> Installment Risk Scoring
--   Online Retail II            -> Transaction Anomaly Detection
--
-- PostgreSQL 14+
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM (
    'ADMINISTRATOR',
    'WORKER'
);

CREATE TYPE stock_movement_type AS ENUM (
    'PURCHASE',
    'SALE',
    'RETURN',
    'DAMAGED',
    'ADJUSTMENT'
);

CREATE TYPE serialized_unit_status AS ENUM (
    'IN_STOCK',
    'SOLD',
    'RETURNED'
);

CREATE TYPE payment_method AS ENUM (
    'CASH',
    'CARD',
    'BANK_TRANSFER',
    'OTHER'
);

CREATE TYPE payment_type AS ENUM (
    'FULL',
    'DEPOSIT',
    'INSTALLMENT'
);

CREATE TYPE payment_frequency AS ENUM (
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY'
);

CREATE TYPE installment_plan_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE installment_schedule_status AS ENUM (
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'OVERDUE'
);

CREATE TYPE invoice_type AS ENUM (
    'INVOICE',
    'RECEIPT'
);

CREATE TYPE report_job_type AS ENUM (
    'SALES',
    'INVENTORY',
    'INSTALLMENTS',
    'FINANCIAL'
);

CREATE TYPE report_job_status AS ENUM (
    'QUEUED',
    'GENERATING',
    'COMPLETED',
    'FAILED'
);


-- -----------------------------------------------------------------------------
-- ML enums
-- -----------------------------------------------------------------------------

CREATE TYPE ml_model_type AS ENUM (
    'DEMAND_FORECAST',
    'INSTALLMENT_RISK',
    'ANOMALY_DETECTION'
);

CREATE TYPE risk_level AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);

CREATE TYPE anomaly_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);

CREATE TYPE anomaly_subject_type AS ENUM (
    'SALE',
    'PAYMENT',
    'STOCK_MOVEMENT'
);


-- =============================================================================
-- IDENTITY & ACCESS
-- =============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Separate table because a failed login may use an email that
-- does not correspond to any existing User.
CREATE TABLE login_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    email           TEXT NOT NULL,
    successful      BOOLEAN NOT NULL,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_email
    ON login_attempts(email);

CREATE INDEX idx_login_attempts_attempted_at
    ON login_attempts(attempted_at);


-- =============================================================================
-- CUSTOMERS
-- =============================================================================

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_phone
    ON customers(phone);


-- =============================================================================
-- CATALOG
-- =============================================================================

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE
);


CREATE TABLE products (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id           UUID NOT NULL
                          REFERENCES categories(id)
                          ON DELETE RESTRICT,

    name                  TEXT NOT NULL,

    cost_price            NUMERIC(12,2) NOT NULL
                          CHECK (cost_price >= 0),

    selling_price         NUMERIC(12,2) NOT NULL
                          CHECK (selling_price >= 0),

    is_serialized         BOOLEAN NOT NULL DEFAULT FALSE,

    low_stock_threshold   INTEGER NOT NULL DEFAULT 5
                          CHECK (low_stock_threshold >= 0),

    active                BOOLEAN NOT NULL DEFAULT TRUE,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category
    ON products(category_id);

CREATE INDEX idx_products_active
    ON products(active);


-- =============================================================================
-- INVENTORY
-- =============================================================================

-- Signed ledger:
--
-- PURCHASE     positive
-- RETURN       positive
-- SALE         negative
-- DAMAGED      negative
-- ADJUSTMENT   positive or negative
--
-- Current stock = SUM(quantity)
--
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id      UUID NOT NULL
                    REFERENCES products(id)
                    ON DELETE RESTRICT,

    created_by      UUID NOT NULL
                    REFERENCES users(id)
                    ON DELETE RESTRICT,

    type            stock_movement_type NOT NULL,

    quantity        INTEGER NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_stock_movement_quantity
    CHECK (
        (type IN ('PURCHASE', 'RETURN') AND quantity > 0)
        OR
        (type IN ('SALE', 'DAMAGED') AND quantity < 0)
        OR
        (type = 'ADJUSTMENT' AND quantity <> 0)
    )
);

CREATE INDEX idx_stock_movements_product
    ON stock_movements(product_id);

CREATE INDEX idx_stock_movements_created_by
    ON stock_movements(created_by);

CREATE INDEX idx_stock_movements_created_at
    ON stock_movements(created_at);

CREATE INDEX idx_stock_movements_product_created
    ON stock_movements(product_id, created_at);


CREATE TABLE serialized_units (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id              UUID NOT NULL
                            REFERENCES products(id)
                            ON DELETE RESTRICT,

    serial_number           TEXT NOT NULL UNIQUE,

    warranty_start_date     DATE,

    status                  serialized_unit_status
                            NOT NULL DEFAULT 'IN_STOCK',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_serialized_units_product
    ON serialized_units(product_id);

CREATE INDEX idx_serialized_units_status
    ON serialized_units(status);


-- =============================================================================
-- SALES
-- =============================================================================

CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id     UUID NOT NULL
                    REFERENCES customers(id)
                    ON DELETE RESTRICT,

    cashier_id      UUID NOT NULL
                    REFERENCES users(id)
                    ON DELETE RESTRICT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_customer
    ON sales(customer_id);

CREATE INDEX idx_sales_cashier
    ON sales(cashier_id);

CREATE INDEX idx_sales_created_at
    ON sales(created_at);


CREATE TABLE sale_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sale_id                 UUID NOT NULL
                            REFERENCES sales(id)
                            ON DELETE RESTRICT,

    product_id              UUID NOT NULL
                            REFERENCES products(id)
                            ON DELETE RESTRICT,

    serialized_unit_id      UUID
                            REFERENCES serialized_units(id)
                            ON DELETE RESTRICT,

    quantity                INTEGER NOT NULL
                            CHECK (quantity > 0),

    -- Snapshot of price at time of sale.
    unit_price              NUMERIC(12,2) NOT NULL
                            CHECK (unit_price >= 0),

    discount                NUMERIC(12,2) NOT NULL DEFAULT 0
                            CHECK (discount >= 0)
);

CREATE INDEX idx_sale_items_sale
    ON sale_items(sale_id);

CREATE INDEX idx_sale_items_product
    ON sale_items(product_id);

CREATE UNIQUE INDEX uq_sale_items_serialized_unit
    ON sale_items(serialized_unit_id)
    WHERE serialized_unit_id IS NOT NULL;


-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sale_id         UUID NOT NULL
                    REFERENCES sales(id)
                    ON DELETE RESTRICT,

    amount          NUMERIC(12,2) NOT NULL
                    CHECK (amount > 0),

    method          payment_method NOT NULL,
    type            payment_type NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_sale
    ON payments(sale_id);

CREATE INDEX idx_payments_created_at
    ON payments(created_at);

CREATE INDEX idx_payments_sale_created
    ON payments(sale_id, created_at);


-- =============================================================================
-- INSTALLMENT PLANS
-- =============================================================================

CREATE TABLE installment_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sale_id             UUID NOT NULL UNIQUE
                        REFERENCES sales(id)
                        ON DELETE RESTRICT,

    deposit             NUMERIC(12,2) NOT NULL
                        CHECK (deposit >= 0),

    interest_rate       NUMERIC(5,4) NOT NULL DEFAULT 0
                        CHECK (interest_rate >= 0),

    term_count          INTEGER NOT NULL
                        CHECK (term_count > 0),

    payment_frequency   payment_frequency
                        NOT NULL DEFAULT 'MONTHLY',

    status              installment_plan_status
                        NOT NULL DEFAULT 'ACTIVE',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ
);

CREATE INDEX idx_installment_plans_status
    ON installment_plans(status);

CREATE INDEX idx_installment_plans_created_at
    ON installment_plans(created_at);


CREATE TABLE installment_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    plan_id         UUID NOT NULL
                    REFERENCES installment_plans(id)
                    ON DELETE RESTRICT,

    due_date        DATE NOT NULL,

    amount          NUMERIC(12,2) NOT NULL
                    CHECK (amount > 0),

    status          installment_schedule_status
                    NOT NULL DEFAULT 'PENDING',

    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_installment_schedules_plan
    ON installment_schedules(plan_id);

CREATE INDEX idx_installment_schedules_due_date
    ON installment_schedules(due_date);

CREATE INDEX idx_installment_schedules_status
    ON installment_schedules(status);

CREATE INDEX idx_installment_schedules_plan_due
    ON installment_schedules(plan_id, due_date);


-- =============================================================================
-- PAYMENT ALLOCATIONS
-- =============================================================================

-- Allows:
--
-- payment 100
--    -> installment A 80
--    -> installment B 20
--
-- therefore naturally handles partial payments and overpayments.
--
CREATE TABLE payment_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_id      UUID NOT NULL
                    REFERENCES payments(id)
                    ON DELETE RESTRICT,

    schedule_id     UUID NOT NULL
                    REFERENCES installment_schedules(id)
                    ON DELETE RESTRICT,

    amount_applied  NUMERIC(12,2) NOT NULL
                    CHECK (amount_applied > 0),

    UNIQUE(payment_id, schedule_id)
);

CREATE INDEX idx_payment_allocations_payment
    ON payment_allocations(payment_id);

CREATE INDEX idx_payment_allocations_schedule
    ON payment_allocations(schedule_id);


-- =============================================================================
-- INVOICES / RECEIPTS
-- =============================================================================

CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sale_id             UUID NOT NULL
                        REFERENCES sales(id)
                        ON DELETE RESTRICT,

    invoice_number      TEXT NOT NULL UNIQUE,

    document_url        TEXT,

    type                invoice_type NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_sale
    ON invoices(sale_id);


-- =============================================================================
-- REPORT JOBS
-- =============================================================================

CREATE TABLE report_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    requested_by    UUID NOT NULL
                    REFERENCES users(id)
                    ON DELETE RESTRICT,

    type            report_job_type NOT NULL,

    status          report_job_status
                    NOT NULL DEFAULT 'QUEUED',

    document_url    TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_jobs_requested_by
    ON report_jobs(requested_by);

CREATE INDEX idx_report_jobs_status
    ON report_jobs(status);


-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    actor_id        UUID NOT NULL
                    REFERENCES users(id)
                    ON DELETE RESTRICT,

    action          TEXT NOT NULL,

    entity          TEXT NOT NULL,

    entity_id       UUID,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor
    ON audit_logs(actor_id);

CREATE INDEX idx_audit_logs_entity
    ON audit_logs(entity, entity_id);

CREATE INDEX idx_audit_logs_created_at
    ON audit_logs(created_at);


-- =============================================================================
-- ML MODEL RUNS
-- =============================================================================

-- Stores model-training metadata.
--
-- Example:
-- model_type       = DEMAND_FORECAST
-- model_name       = LightGBM
-- model_version    = demand-v1
-- metrics          = {"mae":2.8,"rmse":4.1,"baseline_mae":4.3}
-- parameters       = {...}
--
CREATE TABLE ml_model_runs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    model_type              ml_model_type NOT NULL,

    model_name              TEXT NOT NULL,

    model_version           TEXT NOT NULL,

    training_data_start     DATE,
    training_data_end       DATE,

    feature_schema_version  TEXT,

    metrics                 JSONB,

    parameters              JSONB,

    artifact_uri            TEXT,

    trained_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(model_type, model_version)
);

CREATE INDEX idx_ml_model_runs_type
    ON ml_model_runs(model_type);

CREATE INDEX idx_ml_model_runs_trained_at
    ON ml_model_runs(trained_at);


-- =============================================================================
-- ML: DEMAND FORECASTING
-- =============================================================================

-- Intended model input can be derived from:
--
-- sales.created_at
-- sale_items.product_id
-- sale_items.quantity
-- sale_items.unit_price
-- sale_items.discount
-- products.category_id
--
-- This closely corresponds to the useful retail-demand structure
-- of the M5-style dataset.
--
CREATE TABLE demand_forecasts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id          UUID NOT NULL
                        REFERENCES products(id)
                        ON DELETE CASCADE,

    model_run_id        UUID NOT NULL
                        REFERENCES ml_model_runs(id)
                        ON DELETE RESTRICT,

    forecast_date       DATE NOT NULL,

    horizon_days        INTEGER NOT NULL
                        CHECK (horizon_days > 0),

    predicted_units     NUMERIC(12,4) NOT NULL
                        CHECK (predicted_units >= 0),

    lower_bound         NUMERIC(12,4),
    upper_bound         NUMERIC(12,4),

    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(
        product_id,
        model_run_id,
        forecast_date,
        horizon_days
    )
);

CREATE INDEX idx_demand_forecasts_product_date
    ON demand_forecasts(product_id, forecast_date);

CREATE INDEX idx_demand_forecasts_generated
    ON demand_forecasts(generated_at);


-- =============================================================================
-- ML: REORDER RECOMMENDATIONS
-- =============================================================================

-- Advisory only.
-- Does NOT create stock movements or purchase orders.
--
-- Example:
--
-- forecast demand = 30
-- safety stock    = 10
-- current stock   = 15
--
-- recommended quantity = 25
--
CREATE TABLE reorder_recommendations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id              UUID NOT NULL
                            REFERENCES products(id)
                            ON DELETE CASCADE,

    forecast_id             UUID
                            REFERENCES demand_forecasts(id)
                            ON DELETE SET NULL,

    current_stock           INTEGER NOT NULL,

    forecast_demand         NUMERIC(12,4) NOT NULL
                            CHECK (forecast_demand >= 0),

    safety_stock            INTEGER NOT NULL
                            CHECK (safety_stock >= 0),

    recommended_quantity    INTEGER NOT NULL
                            CHECK (recommended_quantity >= 0),

    generated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reorder_recommendations_product
    ON reorder_recommendations(product_id);

CREATE INDEX idx_reorder_recommendations_generated
    ON reorder_recommendations(generated_at);


-- =============================================================================
-- ML: INSTALLMENT RISK SCORING
-- =============================================================================

-- Model features should be derived rather than duplicated in transactional
-- tables. Examples:
--
-- number of late installments
-- average days late
-- previous overdue installments
-- partial-payment count
-- payment completion ratio
-- outstanding balance
-- deposit ratio
-- term count
-- interest rate
-- payment frequency
--
CREATE TABLE installment_risk_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    plan_id             UUID NOT NULL
                        REFERENCES installment_plans(id)
                        ON DELETE CASCADE,

    model_run_id        UUID NOT NULL
                        REFERENCES ml_model_runs(id)
                        ON DELETE RESTRICT,

    risk_probability    NUMERIC(6,5) NOT NULL
                        CHECK (
                            risk_probability >= 0
                            AND risk_probability <= 1
                        ),

    risk_level          risk_level NOT NULL,

    -- Useful for reproducibility / explainability.
    feature_snapshot    JSONB,

    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_installment_risk_plan
    ON installment_risk_scores(plan_id);

CREATE INDEX idx_installment_risk_level
    ON installment_risk_scores(risk_level);

CREATE INDEX idx_installment_risk_generated
    ON installment_risk_scores(generated_at);


-- =============================================================================
-- ML: ANOMALY DETECTION
-- =============================================================================

-- Can flag:
--
-- unusually large sale
-- unusually high discount
-- abnormal payment
-- unusual inventory adjustment
-- unusual cashier behavior
--
-- Advisory only: nothing is automatically blocked/reversed.
--
CREATE TABLE anomaly_flags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    model_run_id        UUID NOT NULL
                        REFERENCES ml_model_runs(id)
                        ON DELETE RESTRICT,

    subject_type        anomaly_subject_type NOT NULL,

    sale_id             UUID
                        REFERENCES sales(id)
                        ON DELETE CASCADE,

    payment_id          UUID
                        REFERENCES payments(id)
                        ON DELETE CASCADE,

    stock_movement_id   UUID
                        REFERENCES stock_movements(id)
                        ON DELETE CASCADE,

    anomaly_score       NUMERIC(12,6) NOT NULL,

    severity            anomaly_severity NOT NULL,

    anomaly_type        TEXT NOT NULL,

    reason              TEXT,

    feature_snapshot    JSONB,

    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Exactly one entity must be referenced.
    CONSTRAINT chk_anomaly_single_subject
    CHECK (
        num_nonnulls(
            sale_id,
            payment_id,
            stock_movement_id
        ) = 1
    ),

    CONSTRAINT chk_anomaly_subject_matches
    CHECK (
        (subject_type = 'SALE'
            AND sale_id IS NOT NULL)

        OR

        (subject_type = 'PAYMENT'
            AND payment_id IS NOT NULL)

        OR

        (subject_type = 'STOCK_MOVEMENT'
            AND stock_movement_id IS NOT NULL)
    )
);

CREATE INDEX idx_anomaly_flags_sale
    ON anomaly_flags(sale_id);

CREATE INDEX idx_anomaly_flags_payment
    ON anomaly_flags(payment_id);

CREATE INDEX idx_anomaly_flags_stock_movement
    ON anomaly_flags(stock_movement_id);

CREATE INDEX idx_anomaly_flags_severity
    ON anomaly_flags(severity);

CREATE INDEX idx_anomaly_flags_generated
    ON anomaly_flags(generated_at);
