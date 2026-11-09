-- Isolated shop order-request tables in the existing free-plan D1 database.
-- No card data or full postal addresses are stored.
CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  order_ref TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','quoted','awaiting_payment','paid','fulfilled','cancelled')),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  delivery_country TEXT NOT NULL,
  delivery_postcode TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  quoted_total_pence INTEGER CHECK (quoted_total_pence IS NULL OR quoted_total_pence >= 0),
  paid_at TEXT,
  fulfilled_at TEXT
);
CREATE INDEX IF NOT EXISTS shop_orders_created_idx ON shop_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_status_idx ON shop_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  options TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS shop_order_items_order_idx ON shop_order_items(order_id);

CREATE TABLE IF NOT EXISTS shop_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shop_order_events_order_idx ON shop_order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_order_rate (
  ip_hash TEXT NOT NULL,
  window_id INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_id)
);
