# Electronics POS Marketplace Management System

An internal management system for an electronics retailer. Staff process in-store sales (full payment or installment plans), manage inventory, and track customer installment balances.

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
docker compose up --build
```

This spins up:
- **PostgreSQL 16** on port `5432`
- **Backend API** on port `4000`

After the containers are running, run migrations and seed data:

```bash
docker exec -it electronics-pos-backend npm run migrate:seed
```

### Option 2: Local Development

#### Prerequisites
- Node.js 18+
- PostgreSQL 14+

#### Setup

1. **Create the database:**
```bash
createdb electronics_pos
```

2. **Configure environment:**
```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

3. **Install dependencies:**
```bash
cd backend
npm install
```

4. **Run migrations and seed:**
```bash
npm run migrate:seed
```

5. **Start the server:**
```bash
npm run dev
```

The API will be available at `http://localhost:4000/api`

---

## 🔑 Demo Credentials

| Role   | Email                      | Password    |
|--------|----------------------------|-------------|
| Admin  | admin@electrostore.com     | admin123    |
| Worker | worker@electrostore.com    | worker123   |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint             | Description           | Auth |
|--------|---------------------|-----------------------|------|
| POST   | /api/auth/login     | Login                 | No   |
| POST   | /api/auth/refresh   | Refresh access token  | No   |
| POST   | /api/auth/logout    | Logout                | Yes  |
| GET    | /api/auth/me        | Get current user      | Yes  |

### Users (Admin Only)
| Method | Endpoint         | Description           |
|--------|------------------|-----------------------|
| GET    | /api/users       | List users (paginated)|
| GET    | /api/users/:id   | Get user details      |
| POST   | /api/users       | Create staff account  |
| PUT    | /api/users/:id   | Update user           |
| DELETE | /api/users/:id   | Deactivate user       |

### Categories
| Method | Endpoint              | Description           | Auth    |
|--------|-----------------------|-----------------------|---------|
| GET    | /api/categories       | List categories       | Any     |
| POST   | /api/categories       | Create category       | Admin   |
| PUT    | /api/categories/:id   | Update category       | Admin   |
| DELETE | /api/categories/:id   | Delete category       | Admin   |

### Products
| Method | Endpoint                    | Description           | Auth    |
|--------|-----------------------------|-----------------------|---------|
| GET    | /api/products               | List (search, filter) | Any     |
| GET    | /api/products/low-stock     | Low stock products    | Any     |
| GET    | /api/products/:id           | Product details       | Any     |
| POST   | /api/products               | Create product        | Admin   |
| POST   | /api/products/:id/image     | Upload product image  | Admin   |
| PUT    | /api/products/:id           | Update product        | Admin   |
| DELETE | /api/products/:id           | Soft delete product   | Admin   |

### Customers
| Method | Endpoint                        | Description           |
|--------|---------------------------------|-----------------------|
| GET    | /api/customers                  | List customers        |
| GET    | /api/customers/:id              | Customer details      |
| GET    | /api/customers/:id/purchases    | Purchase history      |
| GET    | /api/customers/:id/installments | Installment plans     |
| POST   | /api/customers                  | Create customer       |
| PUT    | /api/customers/:id              | Update customer       |

### Sales
| Method | Endpoint           | Description                    |
|--------|--------------------|--------------------------------|
| GET    | /api/sales         | List sales (paginated, filter) |
| GET    | /api/sales/:id     | Sale details with items        |
| POST   | /api/sales         | Create sale                    |

### Inventory
| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| GET    | /api/inventory/movements  | Movement history         |
| POST   | /api/inventory/receive    | Record received stock    |
| POST   | /api/inventory/damaged    | Record damaged items     |
| POST   | /api/inventory/adjust     | Manual adjustment (Admin)|

### Installments
| Method | Endpoint                       | Description           |
|--------|--------------------------------|-----------------------|
| GET    | /api/installments              | List installment plans|
| GET    | /api/installments/:id          | Plan details          |
| GET    | /api/installments/status/overdue | Overdue plans       |
| POST   | /api/installments/:id/pay      | Record payment        |

### Interest Rates
| Method | Endpoint                | Description                |
|--------|-------------------------|----------------------------|
| GET    | /api/interest-rates     | Active rates               |
| GET    | /api/interest-rates/all | All rates (Admin)          |
| POST   | /api/interest-rates     | Create/update rate (Admin) |
| DELETE | /api/interest-rates/:id | Deactivate rate (Admin)    |

### Payments, Notifications, Settings, Reports, PDF
| Method | Endpoint                            | Description                    |
|--------|-------------------------------------|--------------------------------|
| GET    | /api/payments                       | List payments                  |
| GET    | /api/notifications                  | User notifications             |
| PUT    | /api/notifications/:id/read         | Mark read                      |
| PUT    | /api/notifications/read-all         | Mark all read                  |
| GET    | /api/settings                       | Get settings                   |
| PUT    | /api/settings                       | Update settings (Admin)        |
| GET    | /api/reports/dashboard              | Admin dashboard KPIs           |
| GET    | /api/reports/sales-chart            | Sales chart data               |
| GET    | /api/reports/top-products           | Top selling products           |
| GET    | /api/reports/revenue-summary        | Revenue summary                |
| GET    | /api/worker/dashboard               | Worker dashboard               |
| GET    | /api/pdf/invoice/:saleId            | Download invoice PDF           |
| GET    | /api/pdf/receipt/sale/:paymentId    | Download sale receipt PDF      |
| GET    | /api/pdf/receipt/installment/:payId | Download installment receipt   |

---

## 🧮 Installment Interest Logic

**Flat rate** on principal. Interest rates are per-duration in the `interest_rates` table.

**Worked example (acceptance test):**
- Price = 1,000 | Rate = 12% flat | Duration = 12 months
- Total Interest = 120 | Total Repayment = 1,120
- Monthly Payment ≈ 93.33

When admin updates a rate, existing plans keep their locked-in rate (immutable). New plans use the new rate. The `interest_rate_id` FK provides an audit trail.

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/         # Environment & app configuration
│   ├── database/       # Pool, migrations, seed
│   ├── jobs/           # Scheduled cron jobs (overdue check)
│   ├── middleware/      # Auth, validation, error handling
│   ├── routes/         # All API route handlers
│   ├── utils/          # Pagination, PDF generation
│   └── index.ts        # Express app entry point
├── uploads/            # Product images
├── .env.example
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 🔧 Environment Variables

| Variable             | Default                                | Description               |
|----------------------|----------------------------------------|---------------------------|
| DB_HOST              | localhost                              | PostgreSQL host           |
| DB_PORT              | 5432                                   | PostgreSQL port           |
| DB_USER              | postgres                               | Database user             |
| DB_PASSWORD          | postgres                               | Database password         |
| DB_NAME              | electronics_pos                        | Database name             |
| JWT_ACCESS_SECRET    | -                                      | JWT access token secret   |
| JWT_REFRESH_SECRET   | -                                      | JWT refresh token secret  |
| JWT_ACCESS_EXPIRES_IN| 15m                                    | Access token TTL          |
| JWT_REFRESH_EXPIRES_IN| 7d                                    | Refresh token TTL         |
| PORT                 | 4000                                   | Server port               |
| NODE_ENV             | development                            | Environment               |
| UPLOAD_DIR           | ./uploads                              | Image upload directory    |
| MAX_FILE_SIZE        | 5242880                                | Max upload size (bytes)   |