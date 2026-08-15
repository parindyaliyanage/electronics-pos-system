# ml-service

Optional FR9.1/FR9.2 batch jobs — demand forecasting and installment risk
scoring. Not a live API: run manually or via cron, reading Postgres directly
via `common/db.py` and writing predictions into `demand_forecasts` /
`risk_scores` (see `docs/schema_ml_optional.sql`). Not part of the core
Docker Compose stack — `backend/` only ever reads the output tables, so the
core system runs identically whether this has been built, run once, or never
touched.

## Setup

```
python -m venv .venv
.venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
```

## Run

```
python forecasting/train.py
python forecasting/predict.py
python forecasting/evaluate.py    # vs. a naive baseline

python risk_scoring/train.py
python risk_scoring/predict.py
```
