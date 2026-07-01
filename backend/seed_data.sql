-- Run after schema.sql
-- Demo data for Electronics POS System

INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES
  ('admin@electrostore.com', '$2a$12$hW8hV4U6C0uYxQn8pQmI8O7v8nPj4VfOq1iYfYt5g8XQ5WmXnQw0a', 'System Administrator', 'admin', true),
  ('worker@electrostore.com', '$2a$12$4n7kJ6v8fV3xK9m1Pq2sUeZ8cT5yR1wQ0aB3cD4eF5gH6iJ7kL8mN', 'John Worker', 'worker', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO settings (key, value)
VALUES
  ('currency', 'LKR'),
  ('currency_symbol', 'Rs.'),
  ('tax_rate', '0'),
  ('store_name', 'ElectroStore'),
  ('store_address', '123 Main Street, Colombo, Sri Lanka'),
  ('store_phone', '+94 11 234 5678')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO categories (name)
VALUES
  ('Smartphones'),
  ('Laptops'),
  ('Tablets'),
  ('Televisions'),
  ('Audio & Headphones'),
  ('Cameras'),
  ('Wearables'),
  ('Gaming'),
  ('Accessories'),
  ('Home Appliances')
ON CONFLICT (name) DO NOTHING;

INSERT INTO interest_rates (duration_months, rate, is_active)
VALUES
  (3, 8.00, true),
  (6, 10.00, true),
  (12, 12.00, true),
  (24, 14.00, true),
  (36, 15.00, true)
ON CONFLICT DO NOTHING;

INSERT INTO products (name, category_id, brand, model_number, description, purchase_cost, selling_price, stock_quantity, reorder_level, warranty_months)
SELECT * FROM (
  VALUES
    ('Samsung Galaxy S24 Ultra', 'Smartphones', 'Samsung', 'SM-S928B', '6.8" Dynamic AMOLED, Snapdragon 8 Gen 3, 12GB RAM, 256GB Storage, 200MP Camera', 180000, 249999, 25, 5, 12),
    ('iPhone 15 Pro Max', 'Smartphones', 'Apple', 'A3104', '6.7" Super Retina XDR, A17 Pro chip, 256GB, 48MP Camera System', 200000, 279999, 20, 5, 12),
    ('Xiaomi 14 Pro', 'Smartphones', 'Xiaomi', 'M14P', '6.73" AMOLED, Snapdragon 8 Gen 3, 12GB RAM, 256GB, Leica Camera', 85000, 124999, 30, 5, 12),
    ('MacBook Air M3', 'Laptops', 'Apple', 'MBA-M3-13', '13.6" Liquid Retina, M3 chip, 8GB RAM, 256GB SSD', 190000, 259999, 15, 3, 12),
    ('Dell XPS 15', 'Laptops', 'Dell', 'XPS-9530', '15.6" OLED, Intel i7-13700H, 16GB RAM, 512GB SSD', 170000, 229999, 10, 3, 24),
    ('ASUS ROG Strix G16', 'Laptops', 'ASUS', 'G614JU', '16" FHD+, Intel i7-13650HX, RTX 4050, 16GB RAM, 512GB SSD', 165000, 219999, 8, 3, 24),
    ('iPad Pro 12.9"', 'Tablets', 'Apple', 'IPADP-M2', 'M2 chip, 12.9" Liquid Retina XDR, 128GB, Wi-Fi', 150000, 199999, 12, 3, 12),
    ('Samsung Galaxy Tab S9', 'Tablets', 'Samsung', 'SM-X710', '11" Dynamic AMOLED, Snapdragon 8 Gen 2, 8GB RAM, 128GB', 80000, 114999, 18, 5, 12),
    ('LG OLED C3 55"', 'Televisions', 'LG', 'OLED55C3', '55" 4K OLED evo, α9 Gen6 AI Processor, WebOS', 180000, 249999, 6, 2, 24),
    ('Samsung 65" Crystal UHD', 'Televisions', 'Samsung', 'UA65CU7000', '65" 4K Crystal Processor, Smart TV, Tizen OS', 120000, 169999, 10, 2, 24),
    ('Sony WH-1000XM5', 'Audio & Headphones', 'Sony', 'WH1000XM5', 'Wireless Noise Cancelling Headphones, 30h battery, LDAC', 35000, 54999, 40, 10, 12),
    ('Apple AirPods Pro 2', 'Audio & Headphones', 'Apple', 'MQD83', 'Active Noise Cancellation, Adaptive Transparency, USB-C', 28000, 42999, 35, 10, 12),
    ('JBL Flip 6', 'Audio & Headphones', 'JBL', 'JBLFLIP6', 'Portable Bluetooth Speaker, IP67, 12h battery', 12000, 18999, 50, 10, 12),
    ('Canon EOS R6 Mark II', 'Cameras', 'Canon', 'EOS-R6M2', '24.2MP Full-Frame Mirrorless, 4K 60fps, IBIS', 320000, 429999, 4, 2, 24),
    ('Apple Watch Series 9', 'Wearables', 'Apple', 'AWS9-45', '45mm, S9 SiP, Always-On Retina Display, GPS', 55000, 79999, 20, 5, 12),
    ('Samsung Galaxy Watch 6', 'Wearables', 'Samsung', 'SM-R940', '44mm, Exynos W930, Super AMOLED, BIA Sensor', 38000, 57999, 15, 5, 12),
    ('PlayStation 5 Slim', 'Gaming', 'Sony', 'CFI-2000', 'Digital Edition, 1TB SSD, DualSense Controller', 68000, 94999, 12, 3, 12),
    ('Nintendo Switch OLED', 'Gaming', 'Nintendo', 'HEG-001', '7" OLED Screen, 64GB Storage, Enhanced Audio', 42000, 59999, 15, 5, 12),
    ('Anker 65W GaN Charger', 'Accessories', 'Anker', 'A2663', '65W USB-C GaN Charger, 3 ports, Foldable Plug', 4500, 7999, 100, 20, 18),
    ('Samsung T7 1TB SSD', 'Accessories', 'Samsung', 'MU-PC1T0T', 'Portable SSD, USB 3.2, 1050MB/s Read, Fingerprint Security', 14000, 21999, 25, 5, 36),
    ('Dyson V15 Detect', 'Home Appliances', 'Dyson', 'V15-DETECT', 'Cordless Vacuum, Laser Dust Detection, 60min Runtime', 80000, 119999, 7, 2, 24),
    ('Philips Air Fryer XXL', 'Home Appliances', 'Philips', 'HD9870', '7.3L Capacity, Rapid Air Technology, Smart Sensing', 28000, 42999, 15, 3, 24),
    ('Google Pixel 8 Pro', 'Smartphones', 'Google', 'GP8P-128', '6.7" LTPO OLED, Tensor G3, 12GB RAM, 128GB, AI Camera', 110000, 149999, 2, 5, 12),
    ('Sony WF-1000XM5', 'Audio & Headphones', 'Sony', 'WF1000XM5', 'True Wireless Noise Cancelling Earbuds, LDAC, IPX4', 32000, 49999, 0, 5, 12)
) AS p(name, category_name, brand, model_number, description, purchase_cost, selling_price, stock_quantity, reorder_level, warranty_months)
JOIN categories c ON c.name = p.category_name
ON CONFLICT (name) DO NOTHING;

INSERT INTO customers (name, phone, email, address)
VALUES
  ('Kamal Perera', '+94 77 123 4567', 'kamal.perera@email.com', '45 Galle Road, Colombo 03'),
  ('Nishanthi Silva', '+94 71 234 5678', 'nishanthi.s@email.com', '12 Temple Road, Kandy'),
  ('Ruwan Fernando', '+94 76 345 6789', 'ruwan.f@email.com', '78 Beach Road, Galle'),
  ('Amaya Jayawardena', '+94 70 456 7890', NULL, '23 Station Road, Jaffna'),
  ('Dinesh Rajapaksa', '+94 75 567 8901', 'dinesh.r@email.com', '56 Main Street, Matara')
ON CONFLICT DO NOTHING;

INSERT INTO notifications (user_id, type, title, message, metadata)
SELECT u.id, n.type, n.title, n.message, n.metadata::jsonb
FROM users u
CROSS JOIN (
  VALUES
    ('low_stock', 'Low Stock Alert', 'Google Pixel 8 Pro is running low on stock (2 remaining)', '{"product_name":"Google Pixel 8 Pro","current_stock":2,"reorder_level":5}'),
    ('out_of_stock', 'Out of Stock', 'Sony WF-1000XM5 is out of stock', '{"product_name":"Sony WF-1000XM5"}')
) AS n(type, title, message, metadata)
WHERE u.email = 'admin@electrostore.com';