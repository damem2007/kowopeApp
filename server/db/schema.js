export const schemaSql = `
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_instructions TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  client_id INTEGER REFERENCES clients(id)
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT,
  address TEXT,
  phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  payment_instructions TEXT NOT NULL DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
  invoice_number_padding INTEGER NOT NULL DEFAULT 4,
  invoice_number_format TEXT NOT NULL DEFAULT '{PREFIX}{YYYY}-{NUMBER}'
  ,preferred_email_provider TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USD'
);
INSERT OR IGNORE INTO business_profile (id) VALUES (1);
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sign TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO currencies (code, name, sign) VALUES ('USD', 'US dollar', '$'), ('CAD', 'Canadian dollar', 'CA$'), ('EUR', 'Euro', '€');
CREATE TABLE IF NOT EXISTS line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  business_id INTEGER,
  description TEXT NOT NULL,
  frequency TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active',
  next_run_at TEXT NOT NULL,
  auto_send INTEGER NOT NULL DEFAULT 0,
  source_invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS schedule_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  effective_from TEXT NOT NULL,
  price_change_note INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  client_id INTEGER REFERENCES clients(id),
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Manual',
  method TEXT,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS integrations (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'not_connected',
  account_label TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  connected_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_email TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 14,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  next_run_at TEXT NOT NULL
);
`
