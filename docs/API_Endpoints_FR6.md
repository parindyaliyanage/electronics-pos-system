# SmartRetail API — FR6 Installment Reminder and Overdue Workflow

Endpoint reference for FR6, taken from the code in `backend/src/workflows/`,
`backend/src/installments/` and `workers/temporal-worker/`. Same general rules as
[`API_Endpoints_FR1-FR5.md`](API_Endpoints_FR1-FR5.md): base URL
`http://localhost:3000`, `Authorization: Bearer <accessToken>`, JSON bodies.

Postman collection: [`postman/SmartRetail_FR6.postman_collection.json`](postman/SmartRetail_FR6.postman_collection.json).

## How FR6 works

```
POST /sales/checkout (DEPOSIT)
   └─ commit sale + plan + schedules
   └─ backend starts 1 Temporal workflow per installment   (workflowId = installment-reminder-<scheduleId>)

temporal-worker runs each workflow:
   sleep until  dueDate − reminderDaysBefore   → check payment → send email reminder (5 attempts, backoff 10s→80s)
   sleep until  dueDate                         → check payment
   sleep until  dueDate + gracePeriodDays       → check payment → mark schedule OVERDUE
                                                                   └─ shows in GET /installments/overdue

POST /installments/:id/payments  or  PATCH /installments/:id/cancel
   └─ backend signals the plan's workflows → they re-check now; paid/cancelled ⇒ workflow ends (SETTLED)
```

* **Durable:** every wait is a Temporal timer. Restart the backend or the worker and
  the workflow continues from the same point.
* **No duplicate reminders:** `installment_notifications` has `UNIQUE (schedule_id, type)`,
  and a row already marked `SENT` is never re-sent.
* **Temporal down:** checkout still succeeds. Workflows are started later by the backend's
  startup sync or by `POST /workflows/installments/sync`.
* **Customer without email:** the reminder is recorded as `SKIPPED`. Escalation still happens.

## Endpoint summary

| # | Method | Path | Role | Purpose |
|---|---|---|---|---|
| 1 | GET | `/installments/overdue` | ADMIN | Overdue installments for the Administrator dashboard |
| 2 | GET | `/installments/:id/reminders` | Both | Reminder notification log for a plan |
| 3 | PUT | `/installments/policy` | ADMIN | *(extended)* also sets `reminderDaysBefore`, `gracePeriodDays` |
| 4 | GET | `/installments/policy` | Both | *(extended)* now returns the two FR6 fields |
| 5 | GET | `/workflows/health` | ADMIN | Is Temporal reachable? Shows the task queue and day length |
| 6 | GET | `/workflows/installments/:scheduleId` | ADMIN | Live workflow status and stage for one installment |
| 7 | POST | `/workflows/installments/:scheduleId/recheck` | ADMIN | Wake a workflow to check payment now |
| 8 | POST | `/workflows/installments/sync` | ADMIN | Start missing workflows (recovery after Temporal downtime) |

Unchanged FR3/FR5 endpoints that now drive FR6: `POST /sales/checkout` (starts the workflows),
`POST /installments/:id/payments` and `PATCH /installments/:id/cancel` (signal them).

---

### 1. `GET /installments/overdue` — ADMIN

Query: `page` (default 1), `limit` (default 20, max 100), `customerId` (optional UUID).
Returns schedules with status `OVERDUE` on **active** plans, oldest due date first.

```json
{
  "data": [
    {
      "scheduleId": "…", "planId": "…", "saleId": "…",
      "customer": { "id": "…", "fullName": "Kamala Silva", "phone": "+94711234567", "email": "kamala@example.com" },
      "dueDate": "2026-11-27T00:00:00.000Z",
      "overdueAt": "2026-12-02T00:00:03.120Z",
      "daysOverdue": 5,
      "amount": "733.33", "amountPaid": "100", "outstanding": "633.33",
      "reminder": { "status": "SENT", "channel": "EMAIL", "recipient": "kamala@example.com", "attempts": 1, "sentAt": "…" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

A partial payment on an overdue installment keeps it `OVERDUE` until it is paid in full.
A full payment sets it to `PAID` and removes it from this list.

Errors: 403 (worker), 400 (bad `customerId`/paging).

### 2. `GET /installments/:id/reminders` — Both

`:id` = plan id. One row per installment that reached its reminder point.

```json
[
  {
    "id": "…", "scheduleId": "…", "type": "REMINDER", "channel": "EMAIL",
    "recipient": "kamala@example.com", "status": "SENT", "attempts": 1,
    "lastError": null, "sentAt": "2026-11-24T10:00:40.000Z",
    "schedule": { "id": "…", "dueDate": "2026-11-27T00:00:00.000Z", "amount": "733.33", "status": "PENDING" }
  }
]
```

`status`: `PENDING` (sending), `SENT`, `FAILED` (provider error; `lastError` set, retries
running or used up), `SKIPPED` (customer has no email).

Errors: 404 (unknown plan), 400 (bad UUID).

### 3. `PUT /installments/policy` — ADMIN (extended)

```json
{ "interestRate": 0.1, "reminderDaysBefore": 3, "gracePeriodDays": 5 }
```

| Field | Rule | Default |
|---|---|---|
| `interestRate` | required, 0–1, ≤ 4 dp | — |
| `reminderDaysBefore` | optional integer 0–30 | 3 |
| `gracePeriodDays` | optional integer 0–60 | 5 |

Each workflow takes a copy of these values when it starts. Changing the policy only affects
plans created afterwards.

### 5. `GET /workflows/health` — ADMIN

```json
{ "temporal": "UP", "address": "localhost:7233", "namespace": "default",
  "taskQueue": "smartretail-installments", "dayDurationMs": 10000 }
```

When Temporal is unreachable it returns **200** with `{ "temporal": "DOWN", "error": "…" }`.

### 6. `GET /workflows/installments/:scheduleId` — ADMIN

```json
{
  "scheduleId": "…", "scheduleStatus": "PENDING", "planId": "…",
  "workflowId": "installment-reminder-…", "runId": "…",
  "workflowStatus": "RUNNING",
  "startTime": "…", "closeTime": null,
  "result": null,
  "state": {
    "stage": "WAITING_FOR_REMINDER",
    "reminder": "NOT_YET",
    "reminderAt": "…", "dueAt": "…", "overdueAt": "…",
    "lastCheckedStatus": null, "lastCheckedAt": null
  }
}
```

* `workflowStatus`: `RUNNING`, `COMPLETED`, `FAILED`, `TERMINATED`, …
* `state.stage`: `WAITING_FOR_REMINDER` → `WAITING_FOR_DUE_DATE` → `IN_GRACE_PERIOD` → `SETTLED` | `ESCALATED`
* `state.reminder`: `NOT_YET`, `SENT`, `ALREADY_SENT`, `SKIPPED`, `FAILED`
* `result` (once `COMPLETED`): `SETTLED` (paid or plan cancelled) or `ESCALATED` (marked overdue)

Errors: 404 (unknown schedule, or no workflow started for it yet), 503 (Temporal down), 403, 400.

### 7. `POST /workflows/installments/:scheduleId/recheck` — ADMIN → **202**

```json
{ "scheduleId": "…", "workflowId": "installment-reminder-…", "signalled": true }
```

The backend already sends this signal on every payment and cancellation. The endpoint is a
manual override. Errors: 404 (workflow already finished, or unknown schedule), 503.

### 8. `POST /workflows/installments/sync` — ADMIN → **200**

Starts a workflow for every `PENDING`/`PARTIALLY_PAID` installment on an `ACTIVE` plan that
doesn't have one. It is safe to run repeatedly: existing workflows are counted, not duplicated.

```json
{ "checked": 4, "started": 0, "alreadyRunning": 4, "failed": 0 }
```

Errors: 503 (Temporal down), 403.

## Configuration

| Variable | Where | Default | Meaning |
|---|---|---|---|
| `WORKFLOW_DAY_DURATION_MS` | backend | `86400000` | Length of one workflow "day". `10000` for testing (see below) |
| `TEMPORAL_SYNC_ON_STARTUP` | backend | `true` | Start missing workflows when the backend boots |
| `TEMPORAL_ADDRESS` / `_NAMESPACE` / `_TASK_QUEUE` | both | `localhost:7233` / `default` / `smartretail-installments` | |
| `SMTP_HOST` / `SMTP_PORT` | worker | `localhost` / `1025` | Mailpit in dev (UI http://localhost:8025) |
| `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | worker | | Real SMTP provider in production |
| `DATABASE_URL` | worker | | The worker reads and writes Postgres directly |

**Compressed timeline for testing.** With `WORKFLOW_DAY_DURATION_MS=10000`, every distance
from checkout to a checkpoint shrinks by the same factor. A WEEKLY installment due in about
6.5 days then reminds after ~35 s, falls due after ~65 s and goes overdue after ~115 s.
Installment 2 follows ~70 s later, and installment 3 ~70 s after that.

## Database changes (migration `20261120000000_fr6_installment_workflow`)

* `installment_policy.reminder_days_before` (int, default 3) and `grace_period_days` (int,
  default 5), both with a CHECK constraint.
* `installment_schedules.overdue_at` (timestamptz): when the workflow escalated it.
* New table `installment_notifications`, `UNIQUE (schedule_id, type)`.
