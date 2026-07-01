import bcrypt from 'bcryptjs';
import { query } from './pool';
import { runMigrations } from './migrate';

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...');

  // ── Run migrations first ──
  await runMigrations();

  // ── 1. Create demo staff accounts ──
  const adminPassword = await bcrypt.hash('admin123', 12);
  const workerPassword = await bcrypt.hash('worker123', 12);

  const { rows: [admin] } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2
     RETURNING id`,
    ['admin@electrostore.com', adminPassword, 'System Administrator', 'admin', true]
  );

  const { rows: [worker] } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2
     RETURNING id`,
    ['worker@electrostore.com', workerPassword, 'John Worker', 'worker', true]
  );

  console.log('  ✅ Demo staff accounts created');

  // ── 2. Settings ──
  const settings = [
    ['currency', 'LKR'],
    ['currency_symbol', 'Rs.'],
    ['tax_rate', '0'],
    ['store_name', 'ElectroStore'],
    ['store_address', '123 Main Street, Colombo, Sri Lanka'],
    ['store_phone', '+94 11 234 5678'],
  ];

  for (const [key, value] of settings) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, value]
    );
  }
  console.log('  ✅ Settings configured');

  // ── 3. Categories ──
  const categoryNames = [
    'Smartphones',
    'Laptops',
    'Tablets',
    'Televisions',
    'Audio & Headphones',
    'Cameras',
    'Wearables',
    'Gaming',
    'Accessories',
    'Home Appliances',
  ];

  const categoryIds: Record<string, string> = {};
  for (const name of categoryNames) {
    const { rows } = await query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = $1
       RETURNING id`,
      [name]
    );
    categoryIds[name] = rows[0].id;
  }
  console.log('  ✅ Categories created');

  // ── 4. Products ──
  const products = [
    // Smartphones
    {
      name: 'Samsung Galaxy S24 Ultra',
      category: 'Smartphones',
      brand: 'Samsung',
      model_number: 'SM-S928B',
      description: '6.8" Dynamic AMOLED, Snapdragon 8 Gen 3, 12GB RAM, 256GB Storage, 200MP Camera',
      purchase_cost: 180000,
      selling_price: 249999,
      stock_quantity: 25,
      reorder_level: 5,
      warranty_months: 12,
    },
    {
      name: 'iPhone 15 Pro Max',
      category: 'Smartphones',
      brand: 'Apple',
      model_number: 'A3104',
      description: '6.7" Super Retina XDR, A17 Pro chip, 256GB, 48MP Camera System',
      purchase_cost: 200000,
      selling_price: 279999,
      stock_quantity: 20,
      reorder_level: 5,
      warranty_months: 12,
    },
    {
      name: 'Xiaomi 14 Pro',
      category: 'Smartphones',
      brand: 'Xiaomi',
      model_number: 'M14P',
      description: '6.73" AMOLED, Snapdragon 8 Gen 3, 12GB RAM, 256GB, Leica Camera',
      purchase_cost: 85000,
      selling_price: 124999,
      stock_quantity: 30,
      reorder_level: 5,
      warranty_months: 12,
    },
    // Laptops
    {
      name: 'MacBook Air M3',
      category: 'Laptops',
      brand: 'Apple',
      model_number: 'MBA-M3-13',
      description: '13.6" Liquid Retina, M3 chip, 8GB RAM, 256GB SSD',
      purchase_cost: 190000,
      selling_price: 259999,
      stock_quantity: 15,
      reorder_level: 3,
      warranty_months: 12,
    },
    {
      name: 'Dell XPS 15',
      category: 'Laptops',
      brand: 'Dell',
      model_number: 'XPS-9530',
      description: '15.6" OLED, Intel i7-13700H, 16GB RAM, 512GB SSD',
      purchase_cost: 170000,
      selling_price: 229999,
      stock_quantity: 10,
      reorder_level: 3,
      warranty_months: 24,
    },
    {
      name: 'ASUS ROG Strix G16',
      category: 'Laptops',
      brand: 'ASUS',
      model_number: 'G614JU',
      description: '16" FHD+, Intel i7-13650HX, RTX 4050, 16GB RAM, 512GB SSD',
      purchase_cost: 165000,
      selling_price: 219999,
      stock_quantity: 8,
      reorder_level: 3,
      warranty_months: 24,
    },
    // Tablets
    {
      name: 'iPad Pro 12.9"',
      category: 'Tablets',
      brand: 'Apple',
      model_number: 'IPADP-M2',
      description: 'M2 chip, 12.9" Liquid Retina XDR, 128GB, Wi-Fi',
      purchase_cost: 150000,
      selling_price: 199999,
      stock_quantity: 12,
      reorder_level: 3,
      warranty_months: 12,
    },
    {
      name: 'Samsung Galaxy Tab S9',
      category: 'Tablets',
      brand: 'Samsung',
      model_number: 'SM-X710',
      description: '11" Dynamic AMOLED, Snapdragon 8 Gen 2, 8GB RAM, 128GB',
      purchase_cost: 80000,
      selling_price: 114999,
      stock_quantity: 18,
      reorder_level: 5,
      warranty_months: 12,
    },
    // Televisions
    {
      name: 'LG OLED C3 55"',
      category: 'Televisions',
      brand: 'LG',
      model_number: 'OLED55C3',
      description: '55" 4K OLED evo, α9 Gen6 AI Processor, WebOS',
      purchase_cost: 180000,
      selling_price: 249999,
      stock_quantity: 6,
      reorder_level: 2,
      warranty_months: 24,
    },
    {
      name: 'Samsung 65" Crystal UHD',
      category: 'Televisions',
      brand: 'Samsung',
      model_number: 'UA65CU7000',
      description: '65" 4K Crystal Processor, Smart TV, Tizen OS',
      purchase_cost: 120000,
      selling_price: 169999,
      stock_quantity: 10,
      reorder_level: 2,
      warranty_months: 24,
    },
    // Audio & Headphones
    {
      name: 'Sony WH-1000XM5',
      category: 'Audio & Headphones',
      brand: 'Sony',
      model_number: 'WH1000XM5',
      description: 'Wireless Noise Cancelling Headphones, 30h battery, LDAC',
      purchase_cost: 35000,
      selling_price: 54999,
      stock_quantity: 40,
      reorder_level: 10,
      warranty_months: 12,
    },
    {
      name: 'Apple AirPods Pro 2',
      category: 'Audio & Headphones',
      brand: 'Apple',
      model_number: 'MQD83',
      description: 'Active Noise Cancellation, Adaptive Transparency, USB-C',
      purchase_cost: 28000,
      selling_price: 42999,
      stock_quantity: 35,
      reorder_level: 10,
      warranty_months: 12,
    },
    {
      name: 'JBL Flip 6',
      category: 'Audio & Headphones',
      brand: 'JBL',
      model_number: 'JBLFLIP6',
      description: 'Portable Bluetooth Speaker, IP67, 12h battery',
      purchase_cost: 12000,
      selling_price: 18999,
      stock_quantity: 50,
      reorder_level: 10,
      warranty_months: 12,
    },
    // Cameras
    {
      name: 'Canon EOS R6 Mark II',
      category: 'Cameras',
      brand: 'Canon',
      model_number: 'EOS-R6M2',
      description: '24.2MP Full-Frame Mirrorless, 4K 60fps, IBIS',
      purchase_cost: 320000,
      selling_price: 429999,
      stock_quantity: 4,
      reorder_level: 2,
      warranty_months: 24,
    },
    // Wearables
    {
      name: 'Apple Watch Series 9',
      category: 'Wearables',
      brand: 'Apple',
      model_number: 'AWS9-45',
      description: '45mm, S9 SiP, Always-On Retina Display, GPS',
      purchase_cost: 55000,
      selling_price: 79999,
      stock_quantity: 20,
      reorder_level: 5,
      warranty_months: 12,
    },
    {
      name: 'Samsung Galaxy Watch 6',
      category: 'Wearables',
      brand: 'Samsung',
      model_number: 'SM-R940',
      description: '44mm, Exynos W930, Super AMOLED, BIA Sensor',
      purchase_cost: 38000,
      selling_price: 57999,
      stock_quantity: 15,
      reorder_level: 5,
      warranty_months: 12,
    },
    // Gaming
    {
      name: 'PlayStation 5 Slim',
      category: 'Gaming',
      brand: 'Sony',
      model_number: 'CFI-2000',
      description: 'Digital Edition, 1TB SSD, DualSense Controller',
      purchase_cost: 68000,
      selling_price: 94999,
      stock_quantity: 12,
      reorder_level: 3,
      warranty_months: 12,
    },
    {
      name: 'Nintendo Switch OLED',
      category: 'Gaming',
      brand: 'Nintendo',
      model_number: 'HEG-001',
      description: '7" OLED Screen, 64GB Storage, Enhanced Audio',
      purchase_cost: 42000,
      selling_price: 59999,
      stock_quantity: 15,
      reorder_level: 5,
      warranty_months: 12,
    },
    // Accessories
    {
      name: 'Anker 65W GaN Charger',
      category: 'Accessories',
      brand: 'Anker',
      model_number: 'A2663',
      description: '65W USB-C GaN Charger, 3 ports, Foldable Plug',
      purchase_cost: 4500,
      selling_price: 7999,
      stock_quantity: 100,
      reorder_level: 20,
      warranty_months: 18,
    },
    {
      name: 'Samsung T7 1TB SSD',
      category: 'Accessories',
      brand: 'Samsung',
      model_number: 'MU-PC1T0T',
      description: 'Portable SSD, USB 3.2, 1050MB/s Read, Fingerprint Security',
      purchase_cost: 14000,
      selling_price: 21999,
      stock_quantity: 25,
      reorder_level: 5,
      warranty_months: 36,
    },
    // Home Appliances
    {
      name: 'Dyson V15 Detect',
      category: 'Home Appliances',
      brand: 'Dyson',
      model_number: 'V15-DETECT',
      description: 'Cordless Vacuum, Laser Dust Detection, 60min Runtime',
      purchase_cost: 80000,
      selling_price: 119999,
      stock_quantity: 7,
      reorder_level: 2,
      warranty_months: 24,
    },
    {
      name: 'Philips Air Fryer XXL',
      category: 'Home Appliances',
      brand: 'Philips',
      model_number: 'HD9870',
      description: '7.3L Capacity, Rapid Air Technology, Smart Sensing',
      purchase_cost: 28000,
      selling_price: 42999,
      stock_quantity: 15,
      reorder_level: 3,
      warranty_months: 24,
    },
    // Low stock product (for testing alerts)
    {
      name: 'Google Pixel 8 Pro',
      category: 'Smartphones',
      brand: 'Google',
      model_number: 'GP8P-128',
      description: '6.7" LTPO OLED, Tensor G3, 12GB RAM, 128GB, AI Camera',
      purchase_cost: 110000,
      selling_price: 149999,
      stock_quantity: 2,
      reorder_level: 5,
      warranty_months: 12,
    },
    // Out of stock product (for testing)
    {
      name: 'Sony WF-1000XM5',
      category: 'Audio & Headphones',
      brand: 'Sony',
      model_number: 'WF1000XM5',
      description: 'True Wireless Noise Cancelling Earbuds, LDAC, IPX4',
      purchase_cost: 32000,
      selling_price: 49999,
      stock_quantity: 0,
      reorder_level: 5,
      warranty_months: 12,
    },
  ];

  for (const p of products) {
    await query(
      `INSERT INTO products (name, category_id, brand, model_number, description, purchase_cost, selling_price, stock_quantity, reorder_level, warranty_months)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [p.name, categoryIds[p.category], p.brand, p.model_number, p.description, p.purchase_cost, p.selling_price, p.stock_quantity, p.reorder_level, p.warranty_months]
    );
  }
  console.log('  ✅ Products seeded (24 items)');

  // ── 5. Interest rates ──
  const rates = [
    { duration_months: 3, rate: 8.0 },
    { duration_months: 6, rate: 10.0 },
    { duration_months: 12, rate: 12.0 },
    { duration_months: 24, rate: 14.0 },
    { duration_months: 36, rate: 15.0 },
  ];

  for (const r of rates) {
    await query(
      `INSERT INTO interest_rates (duration_months, rate, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT DO NOTHING`,
      [r.duration_months, r.rate]
    );
  }
  console.log('  ✅ Interest rates configured');

  // ── 6. Demo customers ──
  const customers = [
    { name: 'Kamal Perera', phone: '+94 77 123 4567', email: 'kamal.perera@email.com', address: '45 Galle Road, Colombo 03' },
    { name: 'Nishanthi Silva', phone: '+94 71 234 5678', email: 'nishanthi.s@email.com', address: '12 Temple Road, Kandy' },
    { name: 'Ruwan Fernando', phone: '+94 76 345 6789', email: 'ruwan.f@email.com', address: '78 Beach Road, Galle' },
    { name: 'Amaya Jayawardena', phone: '+94 70 456 7890', email: null, address: '23 Station Road, Jaffna' },
    { name: 'Dinesh Rajapaksa', phone: '+94 75 567 8901', email: 'dinesh.r@email.com', address: '56 Main Street, Matara' },
  ];

  const customerIds: string[] = [];
  for (const c of customers) {
    const { rows } = await query(
      `INSERT INTO customers (name, phone, email, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [c.name, c.phone, c.email, c.address]
    );
    customerIds.push(rows[0].id);
  }
  console.log('  ✅ Demo customers created');

  // ── 7. Demo sales (for reporting) ──
  // Get some product IDs
  const { rows: productRows } = await query(`SELECT id, selling_price, name FROM products WHERE is_deleted = false LIMIT 5`);

  if (productRows.length >= 3) {
    // Sale 1: Full payment
    const sale1Subtotal = Number(productRows[0].selling_price);
    const sale1Tax = 0;
    const sale1Total = sale1Subtotal;

    const { rows: [sale1] } = await query(
      `INSERT INTO sales (customer_id, employee_id, subtotal, discount, tax, total, payment_method, sale_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '2 days')
       RETURNING id`,
      [customerIds[0], worker.id, sale1Subtotal, 0, sale1Tax, sale1Total, 'cash']
    );

    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
      [sale1.id, productRows[0].id, 1, productRows[0].selling_price]
    );

    await query(
      `INSERT INTO payments (sale_id, amount, method, paid_at) VALUES ($1, $2, 'cash', NOW() - INTERVAL '2 days')`,
      [sale1.id, sale1Total]
    );

    // Sale 2: Another full payment
    const sale2Subtotal = Number(productRows[1].selling_price) + Number(productRows[2].selling_price);
    const sale2Total = sale2Subtotal;

    const { rows: [sale2] } = await query(
      `INSERT INTO sales (customer_id, employee_id, subtotal, discount, tax, total, payment_method, sale_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '1 day')
       RETURNING id`,
      [customerIds[1], worker.id, sale2Subtotal, 0, 0, sale2Total, 'card']
    );

    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
      [sale2.id, productRows[1].id, 1, productRows[1].selling_price]
    );
    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
      [sale2.id, productRows[2].id, 1, productRows[2].selling_price]
    );

    await query(
      `INSERT INTO payments (sale_id, amount, method, paid_at) VALUES ($1, $2, 'card', NOW() - INTERVAL '1 day')`,
      [sale2.id, sale2Total]
    );

    // Sale 3: Installment sale (using the acceptance test values: price=1000 concept, but we'll use a real product)
    const installmentProduct = productRows[0];
    const installmentPrincipal = Number(installmentProduct.selling_price);

    const { rows: rateRows } = await query(
      `SELECT id, rate FROM interest_rates WHERE duration_months = 12 AND is_active = true LIMIT 1`
    );

    if (rateRows.length > 0) {
      const rateId = rateRows[0].id;
      const rateValue = Number(rateRows[0].rate);
      const totalInterest = installmentPrincipal * (rateValue / 100);
      const totalRepayment = installmentPrincipal + totalInterest;
      const monthlyPayment = Math.round((totalRepayment / 12) * 100) / 100;

      const { rows: [sale3] } = await query(
        `INSERT INTO sales (customer_id, employee_id, subtotal, discount, tax, total, payment_method, sale_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id`,
        [customerIds[2], worker.id, installmentPrincipal, 0, 0, installmentPrincipal, 'installment']
      );

      await query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [sale3.id, installmentProduct.id, 1, installmentProduct.selling_price]
      );

      // Calculate next due date (1 month from now)
      await query(
        `INSERT INTO installment_plans (sale_id, customer_id, interest_rate_id, principal, interest_rate, duration_months, monthly_payment, remaining_balance, next_due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (CURRENT_DATE + INTERVAL '1 month')::date, 'active')`,
        [sale3.id, customerIds[2], rateId, installmentPrincipal, rateValue, 12, monthlyPayment, totalRepayment]
      );

      console.log('  ✅ Demo installment plan created');
    }

    console.log('  ✅ Demo sales created');
  }

  // ── 8. Demo notifications ──
  await query(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, 'low_stock', 'Low Stock Alert', 'Google Pixel 8 Pro is running low on stock (2 remaining)', '{"product_name": "Google Pixel 8 Pro", "current_stock": 2, "reorder_level": 5}')`,
    [admin.id]
  );

  await query(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, 'out_of_stock', 'Out of Stock', 'Sony WF-1000XM5 is out of stock', '{"product_name": "Sony WF-1000XM5"}')`,
    [admin.id]
  );

  console.log('  ✅ Demo notifications created');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('  Admin:  admin@electrostore.com  / admin123');
  console.log('  Worker: worker@electrostore.com / worker123');
}

// Run directly
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

export { seed };
