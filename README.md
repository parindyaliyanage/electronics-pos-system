# SmartRetail — electronics POS system

React + NestJS + Temporal + PostgreSQL point-of-sale system with catalog,
serialized inventory, installment sales, invoicing, reporting, and optional
ML-driven demand forecasting / risk scoring.

See [`docs/Repo_Architecture.md`](docs/Repo_Architecture.md) for the full
layout and rationale, [`docs/schema.sql`](docs/schema.sql) for the database
schema, and [`docs/SmartRetail_SRS (2).pdf`](<docs/SmartRetail_SRS (2).pdf>)
for requirements.

## Status

- Repo scaffolding, Prisma schema (translated from `docs/schema.sql`, 15
  models), and the full Docker stack are working end to end.
- **No migration has been run yet** — the schema exists as a file, but the
  tables don't exist in Postgres until `prisma:migrate` runs (see Setup).
- Backend modules are empty shells; no controllers/services/guards are
  implemented yet. FR1 (Auth & RBAC) is the current next step.

## Stack

- `frontend/` — React + TypeScript (Vite)
- `backend/` — NestJS modular monolith + Prisma
- `workers/temporal-worker/` — Temporal worker process (installment reminders)
- `ml-service/` — optional Python batch jobs (forecasting, risk scoring)
- `packages/` — shared types and lint/tsconfig
- `infra/` — Docker Compose and CI

## Setup

Prerequisites: Node.js 20+, Docker Desktop.

```bash
cp .env.example .env
```

Install dependencies. If `pnpm` isn't installed globally, `npx pnpm@9`
works without needing elevated/admin permissions:

```bash
npx pnpm@9 install
```

Run the first migration against a running Postgres (see Docker section
below to start one), then seed:

```bash
pnpm --filter backend prisma:migrate
pnpm --filter backend seed
```

## Run (dev, services on the host)

Requires the infra containers running (see the last command in the Docker
section below) with `.env` pointed at `localhost` (the default in
`.env.example`).

```bash
pnpm dev:backend     # NestJS API on :3000
pnpm dev:frontend    # Vite dev server on :5173
pnpm dev:worker      # Temporal worker
```

## Run (Docker, full stack)

```bash
pnpm docker:up
```

Builds and starts all seven services. Inside the Docker network, the
`backend` and `temporal-worker` containers talk to `postgres`, `redis`,
`minio`, and `temporal` by service name (overridden in
`infra/docker/docker-compose.yml`, independent of the host-oriented values
in `.env.example`).

| Service         | Host port                          |
| --------------- | ----------------------------------- |
| frontend         | http://localhost:5173               |
| backend          | http://localhost:3000               |
| postgres         | localhost:5432                      |
| redis            | localhost:6379                      |
| temporal         | localhost:7233                      |
| minio            | http://localhost:9000 (console 9001)|

To start only the infra services (useful for `pnpm dev:*` above):

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio temporal
```

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
on pull requests into `main`:

1. **Lint, type-check, test** — `pnpm -r lint`, Prisma client generation,
   `pnpm -r build` (type-checks frontend/backend/worker), `pnpm -r test`.
2. **Docker build** — builds all three images (`Dockerfile.backend`,
   `Dockerfile.frontend`, `Dockerfile.worker`) to catch breakage in the
   Dockerfiles themselves, independent of the app build. On push to `main`
   only, it also pushes tagged images to GHCR
   (`ghcr.io/<repo>/{backend,frontend,temporal-worker}`).

Not wired up yet: integration tests (Postgres/Temporal), workflow tests, and
deployment (staging/smoke tests/production) — there's no staging or
production target configured for this project yet. See Section 21 of the
project proposal for the intended shape once one exists.

## Optional: ml-service

Not part of the core stack — see [`ml-service/README.md`](ml-service/README.md).
