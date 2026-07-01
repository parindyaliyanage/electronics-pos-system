import { query } from './pool';

const migrations = [
  // ── Extensions ──
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,

  // ── 1. users (staff accounts only) ──
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'worker')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    refresh_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 2. categories ──
  `CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 3. products ──
  `CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    brand VARCHAR(100),
    model_number VARCHAR(100),
    description TEXT,
    purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    warranty_months INTEGER DEFAULT 0,
    image_url TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 4. inventory_movements ──
  `CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('received', 'sold', 'damaged', 'adjustment')),
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 5. customers ──
  `CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 6. sales ──
  `CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'online', 'installment')),
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 7. sale_items ──
  `CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL
  );`,

  // ── 8. payments ──
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    method VARCHAR(30) NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'online')),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 9. interest_rates ──
  `CREATE TABLE IF NOT EXISTS interest_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duration_months INTEGER NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Unique partial index: only one active rate per duration
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_interest_rates_active_duration
    ON interest_rates (duration_months) WHERE is_active = true;`,

  // ── 10. installment_plans ──
  `CREATE TABLE IF NOT EXISTS installment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    interest_rate_id UUID NOT NULL REFERENCES interest_rates(id) ON DELETE RESTRICT,
    principal NUMERIC(12,2) NOT NULL,
    interest_rate NUMERIC(5,2) NOT NULL,
    duration_months INTEGER NOT NULL,
    monthly_payment NUMERIC(12,2) NOT NULL,
    remaining_balance NUMERIC(12,2) NOT NULL,
    next_due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue', 'defaulted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 11. installment_payments ──
  `CREATE TABLE IF NOT EXISTS installment_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 12. notifications ──
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── 13. settings ──
  `CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // ── Indexes for performance ──
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);`,
  `CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);`,
  `CREATE INDEX IF NOT EXISTS idx_products_not_deleted ON products(id) WHERE is_deleted = false;`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(employee_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_installment_plans_customer ON installment_plans(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON installment_plans(status);`,
  `CREATE INDEX IF NOT EXISTS idx_installment_plans_next_due ON installment_plans(next_due_date);`,
  `CREATE INDEX IF NOT EXISTS idx_installment_payments_plan ON installment_payments(plan_id);`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;`,

  // ── updated_at trigger function ──
  `CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ language 'plpgsql';`,

  // ── Attach triggers ──
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
       CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
       CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_interest_rates_updated_at') THEN
       CREATE TRIGGER update_interest_rates_updated_at BEFORE UPDATE ON interest_rates
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_settings_updated_at') THEN
       CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     END IF;
   END $$;`,
];

export async function runMigrations(): Promise<void> {
  console.log('🔄 Running database migrations...');

  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      console.log(`  ✅ Migration ${i + 1}/${migrations.length} applied`);
    } catch (error: any) {
      console.error(`  ❌ Migration ${i + 1} failed:`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations applied successfully!');
}

// Run directly if this file is executed
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
