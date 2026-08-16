-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMINISTRATOR', 'WORKER');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'DAMAGED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "serialized_unit_status" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('FULL', 'DEPOSIT', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "payment_frequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "installment_plan_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "installment_schedule_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "invoice_type" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "report_job_type" AS ENUM ('SALES', 'INVENTORY', 'INSTALLMENTS', 'FINANCIAL');

-- CreateEnum
CREATE TYPE "report_job_status" AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ml_model_type" AS ENUM ('DEMAND_FORECAST', 'INSTALLMENT_RISK', 'ANOMALY_DETECTION');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "anomaly_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "anomaly_subject_type" AS ENUM ('SALE', 'PAYMENT', 'STOCK_MOVEMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "successful" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cost_price" DECIMAL(12,2) NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "is_serialized" BOOLEAN NOT NULL DEFAULT false,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serialized_units" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "warranty_start_date" DATE,
    "status" "serialized_unit_status" NOT NULL DEFAULT 'IN_STOCK',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serialized_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serialized_unit_id" UUID,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "payment_method" NOT NULL,
    "type" "payment_type" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "deposit" DECIMAL(12,2) NOT NULL,
    "interest_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "term_count" INTEGER NOT NULL,
    "payment_frequency" "payment_frequency" NOT NULL DEFAULT 'MONTHLY',
    "status" "installment_plan_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_schedules" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "installment_schedule_status" NOT NULL DEFAULT 'PENDING',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "amount_applied" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "document_url" TEXT,
    "type" "invoice_type" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "type" "report_job_type" NOT NULL,
    "status" "report_job_status" NOT NULL DEFAULT 'QUEUED',
    "document_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_model_runs" (
    "id" UUID NOT NULL,
    "model_type" "ml_model_type" NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "training_data_start" DATE,
    "training_data_end" DATE,
    "feature_schema_version" TEXT,
    "metrics" JSONB,
    "parameters" JSONB,
    "artifact_uri" TEXT,
    "trained_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_model_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecasts" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "forecast_date" DATE NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "predicted_units" DECIMAL(12,4) NOT NULL,
    "lower_bound" DECIMAL(12,4),
    "upper_bound" DECIMAL(12,4),
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_recommendations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "forecast_id" UUID,
    "current_stock" INTEGER NOT NULL,
    "forecast_demand" DECIMAL(12,4) NOT NULL,
    "safety_stock" INTEGER NOT NULL,
    "recommended_quantity" INTEGER NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_risk_scores" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "risk_probability" DECIMAL(6,5) NOT NULL,
    "risk_level" "risk_level" NOT NULL,
    "feature_snapshot" JSONB,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_flags" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "subject_type" "anomaly_subject_type" NOT NULL,
    "sale_id" UUID,
    "payment_id" UUID,
    "stock_movement_id" UUID,
    "anomaly_score" DECIMAL(12,6) NOT NULL,
    "severity" "anomaly_severity" NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "reason" TEXT,
    "feature_snapshot" JSONB,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_login_attempts_email" ON "login_attempts"("email");

-- CreateIndex
CREATE INDEX "idx_login_attempts_attempted_at" ON "login_attempts"("attempted_at");

-- CreateIndex
CREATE INDEX "idx_customers_phone" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "idx_products_category" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "idx_products_active" ON "products"("active");

-- CreateIndex
CREATE INDEX "idx_stock_movements_product" ON "stock_movements"("product_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_created_by" ON "stock_movements"("created_by");

-- CreateIndex
CREATE INDEX "idx_stock_movements_created_at" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "idx_stock_movements_product_created" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "serialized_units_serial_number_key" ON "serialized_units"("serial_number");

-- CreateIndex
CREATE INDEX "idx_serialized_units_product" ON "serialized_units"("product_id");

-- CreateIndex
CREATE INDEX "idx_serialized_units_status" ON "serialized_units"("status");

-- CreateIndex
CREATE INDEX "idx_sales_customer" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "idx_sales_cashier" ON "sales"("cashier_id");

-- CreateIndex
CREATE INDEX "idx_sales_created_at" ON "sales"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_serialized_unit_id_key" ON "sale_items"("serialized_unit_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_sale" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_product" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_payments_sale" ON "payments"("sale_id");

-- CreateIndex
CREATE INDEX "idx_payments_created_at" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "idx_payments_sale_created" ON "payments"("sale_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_sale_id_key" ON "installment_plans"("sale_id");

-- CreateIndex
CREATE INDEX "idx_installment_plans_status" ON "installment_plans"("status");

-- CreateIndex
CREATE INDEX "idx_installment_plans_created_at" ON "installment_plans"("created_at");

-- CreateIndex
CREATE INDEX "idx_installment_schedules_plan" ON "installment_schedules"("plan_id");

-- CreateIndex
CREATE INDEX "idx_installment_schedules_due_date" ON "installment_schedules"("due_date");

-- CreateIndex
CREATE INDEX "idx_installment_schedules_status" ON "installment_schedules"("status");

-- CreateIndex
CREATE INDEX "idx_installment_schedules_plan_due" ON "installment_schedules"("plan_id", "due_date");

-- CreateIndex
CREATE INDEX "idx_payment_allocations_payment" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "idx_payment_allocations_schedule" ON "payment_allocations"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_schedule_id_key" ON "payment_allocations"("payment_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_invoices_sale" ON "invoices"("sale_id");

-- CreateIndex
CREATE INDEX "idx_report_jobs_requested_by" ON "report_jobs"("requested_by");

-- CreateIndex
CREATE INDEX "idx_report_jobs_status" ON "report_jobs"("status");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_ml_model_runs_type" ON "ml_model_runs"("model_type");

-- CreateIndex
CREATE INDEX "idx_ml_model_runs_trained_at" ON "ml_model_runs"("trained_at");

-- CreateIndex
CREATE UNIQUE INDEX "ml_model_runs_model_type_model_version_key" ON "ml_model_runs"("model_type", "model_version");

-- CreateIndex
CREATE INDEX "idx_demand_forecasts_product_date" ON "demand_forecasts"("product_id", "forecast_date");

-- CreateIndex
CREATE INDEX "idx_demand_forecasts_generated" ON "demand_forecasts"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "demand_forecasts_product_id_model_run_id_forecast_date_hori_key" ON "demand_forecasts"("product_id", "model_run_id", "forecast_date", "horizon_days");

-- CreateIndex
CREATE INDEX "idx_reorder_recommendations_product" ON "reorder_recommendations"("product_id");

-- CreateIndex
CREATE INDEX "idx_reorder_recommendations_generated" ON "reorder_recommendations"("generated_at");

-- CreateIndex
CREATE INDEX "idx_installment_risk_plan" ON "installment_risk_scores"("plan_id");

-- CreateIndex
CREATE INDEX "idx_installment_risk_level" ON "installment_risk_scores"("risk_level");

-- CreateIndex
CREATE INDEX "idx_installment_risk_generated" ON "installment_risk_scores"("generated_at");

-- CreateIndex
CREATE INDEX "idx_anomaly_flags_sale" ON "anomaly_flags"("sale_id");

-- CreateIndex
CREATE INDEX "idx_anomaly_flags_payment" ON "anomaly_flags"("payment_id");

-- CreateIndex
CREATE INDEX "idx_anomaly_flags_stock_movement" ON "anomaly_flags"("stock_movement_id");

-- CreateIndex
CREATE INDEX "idx_anomaly_flags_severity" ON "anomaly_flags"("severity");

-- CreateIndex
CREATE INDEX "idx_anomaly_flags_generated" ON "anomaly_flags"("generated_at");

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_serialized_unit_id_fkey" FOREIGN KEY ("serialized_unit_id") REFERENCES "serialized_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "installment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "ml_model_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "reorder_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "reorder_recommendations_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "demand_forecasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_risk_scores" ADD CONSTRAINT "installment_risk_scores_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_risk_scores" ADD CONSTRAINT "installment_risk_scores_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "ml_model_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "ml_model_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added CHECK constraints (no equivalent in Prisma schema language; see
-- docs/schema.sql, which is the source of truth these were copied from).

-- AddCheckConstraint
ALTER TABLE "products" ADD CONSTRAINT "chk_products_cost_price" CHECK ("cost_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_selling_price" CHECK ("selling_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_low_stock_threshold" CHECK ("low_stock_threshold" >= 0);

-- AddCheckConstraint
ALTER TABLE "stock_movements" ADD CONSTRAINT "chk_stock_movement_quantity" CHECK (
    ("type" IN ('PURCHASE', 'RETURN') AND "quantity" > 0)
    OR
    ("type" IN ('SALE', 'DAMAGED') AND "quantity" < 0)
    OR
    ("type" = 'ADJUSTMENT' AND "quantity" <> 0)
);

-- AddCheckConstraint
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_quantity" CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_unit_price" CHECK ("unit_price" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_discount" CHECK ("discount" >= 0);

-- AddCheckConstraint
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount" CHECK ("amount" > 0);

-- AddCheckConstraint
ALTER TABLE "installment_plans" ADD CONSTRAINT "chk_installment_plans_deposit" CHECK ("deposit" >= 0);
ALTER TABLE "installment_plans" ADD CONSTRAINT "chk_installment_plans_interest_rate" CHECK ("interest_rate" >= 0);
ALTER TABLE "installment_plans" ADD CONSTRAINT "chk_installment_plans_term_count" CHECK ("term_count" > 0);

-- AddCheckConstraint
ALTER TABLE "installment_schedules" ADD CONSTRAINT "chk_installment_schedules_amount" CHECK ("amount" > 0);

-- AddCheckConstraint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "chk_payment_allocations_amount_applied" CHECK ("amount_applied" > 0);

-- AddCheckConstraint
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "chk_demand_forecasts_horizon_days" CHECK ("horizon_days" > 0);
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "chk_demand_forecasts_predicted_units" CHECK ("predicted_units" >= 0);

-- AddCheckConstraint
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "chk_reorder_recommendations_forecast_demand" CHECK ("forecast_demand" >= 0);
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "chk_reorder_recommendations_safety_stock" CHECK ("safety_stock" >= 0);
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "chk_reorder_recommendations_recommended_quantity" CHECK ("recommended_quantity" >= 0);

-- AddCheckConstraint
ALTER TABLE "installment_risk_scores" ADD CONSTRAINT "chk_installment_risk_scores_probability" CHECK ("risk_probability" >= 0 AND "risk_probability" <= 1);

-- AddCheckConstraint
-- Exactly one entity must be referenced.
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "chk_anomaly_single_subject" CHECK (
    num_nonnulls("sale_id", "payment_id", "stock_movement_id") = 1
);
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "chk_anomaly_subject_matches" CHECK (
    ("subject_type" = 'SALE' AND "sale_id" IS NOT NULL)
    OR
    ("subject_type" = 'PAYMENT' AND "payment_id" IS NOT NULL)
    OR
    ("subject_type" = 'STOCK_MOVEMENT' AND "stock_movement_id" IS NOT NULL)
);
