# SmartRetail — repository architecture

Monorepo layout for the finalized stack: React (web), NestJS modular monolith (api),
a standalone Temporal worker process, PostgreSQL/Prisma, Redis, and Docker + GitHub
Actions for CI/CD. Reverse proxy and full observability (Prometheus/Grafana) are
optional extensions, not part of the core layout below.

```
smartretail/
├── frontend/                         # React + TypeScript frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── pages/                    # Login, POS, Products, Customers,
│   │   │   │                         # Installments, Reports, AdminDashboard
│   │   ├── features/                 # one folder per domain, mirrors backend/src
│   │   │   ├── auth/
│   │   │   ├── catalog/
│   │   │   ├── sales/
│   │   │   ├── installments/
│   │   │   └── reports/
│   │   ├── components/               # shared UI (buttons, tables, forms)
│   │   ├── api/                      # typed HTTP client, one file per module
│   │   ├── hooks/
│   │   ├── lib/                      # auth context, formatting, constants
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                          # NestJS backend — modular monolith
│   ├── src/
│   │   ├── auth/                     # FR1 — login, JWT, RBAC guards
│   │   ├── users/                    # Administrator/Worker accounts
│   │   ├── customers/                # FR4
│   │   ├── catalog/                  # FR2 — products, categories
│   │   ├── inventory/                # FR2 — stock movements, serialized units
│   │   ├── sales/                    # FR3 — checkout, sale items (the ACID
│   │   │                             # transaction lives here)
│   │   ├── payments/                 # FR3/FR5 — payments, payment allocations
│   │   ├── installments/             # FR5 — plans, schedules
│   │   ├── workflows/                # FR6 — Temporal client calls (starts/
│   │   │                             # signals workflows; see workers/ below)
│   │   ├── invoices/                 # FR7 — PDF generation, storage refs
│   │   ├── reports/                  # FR8 — report jobs, background queue
│   │   ├── audit/                    # audit_logs writer, used by other modules
│   │   ├── analytics/                # FR9 (optional) — reads the
│   │   │                             # demand_forecasts/risk_scores tables
│   │   │                             # written by ml-service/, and computes
│   │   │                             # reorder suggestions (FR9.3, a formula)
│   │   │                             # and anomaly flags (FR9.4, a stat rule)
│   │   │                             # directly in TypeScript — no Python
│   │   │                             # needed for those two
│   │   ├── common/                   # guards, interceptors, filters, DTOs
│   │   ├── prisma/                   # PrismaService + PrismaModule
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma             # mirrors docs/schema.sql
│   │   ├── migrations/
│   │   └── seed.ts                   # TS port of docs/seed.sql
│   ├── test/                         # e2e + integration tests
│   └── package.json
│
├── workers/
│   └── temporal-worker/              # FR6 — separate long-running process
│       ├── src/
│       │   ├── workflows/
│       │   │   └── installment-reminder.workflow.ts
│       │   ├── activities/
│       │   │   ├── send-reminder.activity.ts
│       │   │   ├── check-payment-status.activity.ts
│       │   │   └── escalate-overdue.activity.ts
│       │   └── worker.ts
│       └── package.json
│
├── ml-service/                       # FR9.1/FR9.2 (optional) — Python, not
│   │                                 # a live API; run as a batch job
│   ├── forecasting/
│   │   ├── train.py
│   │   ├── predict.py                # writes into demand_forecasts table
│   │   └── evaluate.py               # vs. a naive baseline — Section 3.1.9.1
│   ├── risk_scoring/
│   │   ├── train.py
│   │   └── predict.py                # writes into risk_scores table
│   ├── common/
│   │   ├── db.py                     # reads sales/installment data directly
│   │   │                             # from Postgres — no API call needed
│   │   └── config.py
│   ├── requirements.txt
│   └── README.md                     # how/when to run — cron or manual,
│                                      # not part of the Docker Compose core
│
├── packages/                         # code shared between web and api
│   ├── types/                        # shared DTOs / API contract types
│   └── config/                       # shared tsconfig, eslint, prettier
│
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml        # postgres, redis, temporal, minio,
│   │   │                             # backend, frontend, temporal-worker
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   └── Dockerfile.worker
│   └── github/
│       └── workflows/
│           └── ci.yml                # lint → type-check → test → build →
│                                      # image publish (per Section 3.6/20)
│
├── docs/                             # everything already produced
│   ├── SmartRetail_Complete_Project_Proposal.docx
│   ├── SmartRetail_SRS.docx
│   ├── SmartRetail_ERD.xml
│   ├── schema.sql
│   ├── schema_ml_optional.sql        # FR9.1/FR9.2 — apply only if attempted
│   └── seed.sql
│
├── .env.example
├── package.json                      # workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── README.md                         # setup + run instructions (Section 3.5.4)
```

## Why this shape

- **`backend/src/*` names match the SRS functional requirements one-to-one**
  (`sales/` is FR3, `installments/` is FR5, etc.) — so when you're implementing
  a requirement, there's exactly one place it lives, and it's easy to check
  coverage against Section 3.1 of the SRS.
- **Temporal lives in two places on purpose.** `backend/src/workflows/` only
  *starts* and *signals* workflows from your normal request handlers.
  `workers/temporal-worker/` is the actual long-running process that executes
  workflow and activity code — it has to run continuously, so it can't live
  inside the request/response backend process.
- **`analytics/` is isolated** so the optional FR9 work (forecasting, risk
  scoring) can be added, partially built, or skipped entirely without
  touching any core module.
- **`ml-service/` is decoupled, not a live dependency.** It reads Postgres
  directly and writes predictions back to their own tables; `backend/` only
  ever reads those tables. This means the core system runs identically
  whether `ml-service/` has been built yet, run once, or never touched —
  which is exactly the isolation FR9's optional status requires. Only
  forecasting and risk scoring need Python; reorder suggestions and anomaly
  flags are cheap enough (a formula, a statistical threshold) to just live in
  `backend/src/analytics/` alongside the code that reads the ML output.
- **`prisma/schema.prisma` is generated from `docs/schema.sql`**, not the
  other way around — the hand-validated SQL is the source of truth; translate
  it into Prisma models once the schema is stable, then let Prisma own
  migrations from that point on.

## Suggested ownership (2-person team)

| Owner | Folders |
|---|---|
| Person A | `backend/src/{auth,catalog,inventory,sales,installments,payments}`, `workers/temporal-worker/` |
| Person B | `backend/src/{invoices,reports,audit}`, `frontend/`, `infra/`, and `analytics/` + `ml-service/` if time remains |

Both touch `auth/` and `prisma/schema.prisma` early since everything else
depends on them — same split agreed on for the implementation roadmap.