# SmartRetail — Docker Command Reference

Everything runs inside Docker — no local Node/pnpm required. Run all commands from the repo
root (`electronics-pos-system/`).

## Setup (once)

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d --build
```

Check status / verify tables exist:

```bash
docker compose -f infra/docker/docker-compose.yml ps
docker compose -f infra/docker/docker-compose.yml exec postgres psql -U smartretail -d smartretail -c "\dt"
```

## Daily run

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build   # start/rebuild everything
docker compose -f infra/docker/docker-compose.yml ps              # check status
docker compose -f infra/docker/docker-compose.yml logs -f backend # follow backend logs
docker compose -f infra/docker/docker-compose.yml down            # stop everything (volumes kept)
```

## Rebuild one service after a code change

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build backend
docker compose -f infra/docker/docker-compose.yml up -d --build frontend
docker compose -f infra/docker/docker-compose.yml up -d --build temporal-worker
```

## Database / Prisma migrations

Create + apply a new migration whenever `backend/prisma/schema.prisma` changes. This writes the
migration into a temporary named container, then copies it onto the host so it's a real,
committable file — a plain bind mount doesn't reliably work for this on Windows, and `--rm`
would destroy the generated file before it can be copied out.

```bash
docker rm -f smartretail-migrate 2>/dev/null
docker compose -f infra/docker/docker-compose.yml run --name smartretail-migrate backend \
  node backend/node_modules/prisma/build/index.js migrate dev --name <description> --schema backend/prisma/schema.prisma
docker cp smartretail-migrate:/app/backend/prisma/migrations/. backend/prisma/migrations/
docker rm smartretail-migrate
```

Apply already-committed migrations (e.g. after pulling someone else's migration) without
creating a new one:

```bash
docker compose -f infra/docker/docker-compose.yml exec backend \
  node backend/node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
```

Seed the database (once `backend/prisma/seed.ts` is implemented — currently a stub):

```bash
docker compose -f infra/docker/docker-compose.yml exec backend backend/node_modules/.bin/ts-node backend/prisma/seed.ts
```

## Inspecting the database directly

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres psql -U smartretail -d smartretail
```

Inside `psql`: `\dt` (list tables), `\d <table>` (describe a table), `\q` (quit).

## Useful debugging commands

```bash
docker compose -f infra/docker/docker-compose.yml exec backend printenv DATABASE_URL
docker compose -f infra/docker/docker-compose.yml exec backend sh
docker compose -f infra/docker/docker-compose.yml restart backend
docker compose -f infra/docker/docker-compose.yml logs -f postgres
```

## Service ports

| Service       | Address                 |
| ------------- | ------------------------ |
| Frontend      | http://localhost:5173   |
| Backend       | http://localhost:3000   |
| PostgreSQL    | localhost:5432          |
| Redis         | localhost:6379          |
| Temporal      | localhost:7233          |
| MinIO API     | http://localhost:9000   |
| MinIO Console | http://localhost:9001   |

## Stop / clean up

```bash
docker compose -f infra/docker/docker-compose.yml down       # stop, keep volumes (DB data)
docker compose -f infra/docker/docker-compose.yml down -v    # stop AND delete volumes (wipes DB) — destructive
```
