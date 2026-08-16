# SmartRetail — Electronics POS System

React + NestJS + Prisma + PostgreSQL + Temporal + Redis + MinIO electronics POS system with catalog management, serialized inventory, installment sales, invoicing, reporting, audit logging, and optional ML services.

* Architecture: [`docs/Repo_Architecture.md`](docs/Repo_Architecture.md)
* Database schema: [`docs/schema.sql`](docs/schema.sql)
* Requirements: [`docs/SmartRetail_SRS (2).pdf`](docs/SmartRetail_SRS %282%29.pdf)

## Stack

* **Frontend:** React + TypeScript + Vite
* **Backend:** NestJS + Prisma
* **Database:** PostgreSQL
* **Workflow:** Temporal
* **Cache:** Redis
* **Storage:** MinIO
* **Containers:** Docker Compose
* **CI/CD:** GitHub Actions
* **Package manager:** pnpm 9

---

## 1. First-Time Setup

```powershell
Copy-Item .env.example .env                         # Create local environment file

npx pnpm@9.0.0 install                             # Install all workspace dependencies

npx pnpm@9.0.0 docker:up                           # Build and start the complete Docker stack

docker compose -f infra/docker/docker-compose.yml ps   # Check container status

docker compose -f infra/docker/docker-compose.yml exec backend printenv DATABASE_URL
# Verify DATABASE_URL inside the backend container

docker compose -f infra/docker/docker-compose.yml exec backend node backend/node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
# Apply existing Prisma migrations to PostgreSQL
```

Open:

```text
Frontend       http://localhost:5173
Backend        http://localhost:3000
MinIO API      http://localhost:9000
MinIO Console  http://localhost:9001
```

---

## 2. Daily Development

```powershell
pnpm docker:up                                     # Start/build the full stack

docker compose -f infra/docker/docker-compose.yml ps
# Check that all services are running

docker compose -f infra/docker/docker-compose.yml logs -f backend
# Follow backend logs

docker compose -f infra/docker/docker-compose.yml down
# Stop all containers; persistent DB/MinIO volumes are kept
```

If `pnpm` is not globally available:

```powershell
npx pnpm@9.0.0 docker:up                           # Start/build using pnpm through npx
```

---

## 3. Rebuild After Code Changes

The application source is copied into Docker images, so rebuild the affected service after changing source code.

```powershell
docker compose -f infra/docker/docker-compose.yml up -d --build backend
# Rebuild and restart NestJS backend

docker compose -f infra/docker/docker-compose.yml up -d --build frontend
# Rebuild and restart React frontend

docker compose -f infra/docker/docker-compose.yml up -d --build temporal-worker
# Rebuild and restart Temporal worker

pnpm docker:up
# Rebuild/start the complete stack
```

---

## 4. Database / Prisma

### Apply Existing Migrations in Docker

```powershell
docker compose -f infra/docker/docker-compose.yml exec backend node backend/node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
# Apply committed migrations to the Docker PostgreSQL database
```

### Create a New Migration During Development

```powershell
$env:DATABASE_URL="postgresql://smartretail:smartretail@localhost:5432/smartretail?schema=public"
# Point host Prisma CLI to PostgreSQL exposed by Docker

pnpm --filter backend prisma:migrate
# Run `prisma migrate dev` and create a new migration
```

After creating a migration:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d --build backend
# Rebuild backend so the new Prisma files are included

docker compose -f infra/docker/docker-compose.yml exec backend node backend/node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
# Apply the migration inside Docker
```

---

## 5. Useful Docker Commands

```powershell
docker compose -f infra/docker/docker-compose.yml ps
# Show services and container status

docker compose -f infra/docker/docker-compose.yml logs -f backend
# Backend logs

docker compose -f infra/docker/docker-compose.yml logs -f frontend
# Frontend logs

docker compose -f infra/docker/docker-compose.yml logs -f temporal-worker
# Temporal worker logs

docker compose -f infra/docker/docker-compose.yml logs -f postgres
# PostgreSQL logs

docker compose -f infra/docker/docker-compose.yml restart backend
# Restart only backend

docker compose -f infra/docker/docker-compose.yml exec backend printenv DATABASE_URL
# Check backend database connection string

docker compose -f infra/docker/docker-compose.yml exec backend ls backend/prisma
# Verify Prisma schema and migrations exist inside backend container

docker compose -f infra/docker/docker-compose.yml down
# Stop the complete stack
```

---

## 6. Run Apps on Host + Infrastructure in Docker

Start only infrastructure:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio temporal
# Start PostgreSQL, Redis, MinIO and Temporal only
```

Then run applications locally:

```powershell
pnpm dev:backend                                  # NestJS development server on :3000
pnpm dev:frontend                                 # Vite development server on :5173
pnpm dev:worker                                   # Temporal worker in development mode
```

When running applications on the host, use `localhost` addresses instead of Docker service names.

---

## 7. Service Ports

| Service       | Address                 |
| ------------- | ----------------------- |
| Frontend      | `http://localhost:5173` |
| Backend       | `http://localhost:3000` |
| PostgreSQL    | `localhost:5432`        |
| Redis         | `localhost:6379`        |
| Temporal      | `localhost:7233`        |
| MinIO API     | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

Inside Docker, services communicate using:

```text
postgres:5432
redis:6379
temporal:7233
minio:9000
```

---

## 8. CI/CD

GitHub Actions workflow:

```text
.github/workflows/ci.yml
```

Runs on pushes and pull requests to `main` and performs:

```text
Install → Lint → Prisma Generate → Build → Test → Docker Build
```

On pushes to `main`, Docker images can also be pushed to GHCR:

```text
ghcr.io/<repo>/backend
ghcr.io/<repo>/frontend
ghcr.io/<repo>/temporal-worker
```

Deployment to staging/production is not configured yet.

---

## Quick Reference

```powershell
# FIRST SETUP
Copy-Item .env.example .env                        # Create .env
npx pnpm@9.0.0 install                            # Install dependencies
npx pnpm@9.0.0 docker:up                          # Build/start everything
docker compose -f infra/docker/docker-compose.yml exec backend node backend/node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
# Apply migrations

# DAILY
pnpm docker:up                                    # Start/rebuild system
docker compose -f infra/docker/docker-compose.yml ps
# Check status

# AFTER BACKEND CHANGES
docker compose -f infra/docker/docker-compose.yml up -d --build backend

# AFTER FRONTEND CHANGES
docker compose -f infra/docker/docker-compose.yml up -d --build frontend

# LOGS
docker compose -f infra/docker/docker-compose.yml logs -f backend

# STOP
docker compose -f infra/docker/docker-compose.yml down
```
