-- =============================================================================
-- SmartRetail — Optional ML Schema (FR9.1 Demand Forecasting, FR9.2 Risk Scoring)
-- Apply AFTER schema.sql. Nothing in schema.sql or seed.sql references these
-- tables, so this file can be skipped entirely, applied later, or dropped
-- without touching the core system in any way.
-- =============================================================================

CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- One row per forecast run (history kept, never overwritten — same ledger
-- philosophy as stock_movements) so a product's forecast trend is visible
-- over time, not just its latest prediction.
CREATE TABLE demand_forecasts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    horizon_days        INTEGER NOT NULL CHECK (horizon_days IN (7, 14, 30)),
    predicted_demand    NUMERIC(12, 2) NOT NULL CHECK (predicted_demand >= 0),
    method              TEXT NOT NULL, -- e.g. 'naive', 'moving_average', 'xgboost'
    forecast_date       DATE NOT NULL, -- the date this prediction is generated for
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_demand_forecasts_product ON demand_forecasts (product_id);
CREATE INDEX idx_demand_forecasts_forecast_date ON demand_forecasts (forecast_date);

-- One row per scoring run, per installment plan — same history-over-latest
-- reasoning as demand_forecasts, so a risk trend is visible, not just a label.
CREATE TABLE risk_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES installment_plans (id) ON DELETE RESTRICT,
    risk_level          risk_level NOT NULL,
    score_value         NUMERIC(6, 4), -- optional raw score behind the label
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_scores_plan ON risk_scores (plan_id);
CREATE INDEX idx_risk_scores_risk_level ON risk_scores (risk_level);
