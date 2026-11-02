import { encryptValue } from '../security/crypto.js'

const migrations = [
  {
    version: 1,
    apply(db) {
      const addColumnIfMissing = (table, column, definition) => {
        const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)
        if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
      addColumnIfMissing('clients', 'address', "TEXT DEFAULT ''")
      addColumnIfMissing('invoices', 'client_id', 'INTEGER REFERENCES clients(id)')
      addColumnIfMissing('invoices', 'currency', "TEXT NOT NULL DEFAULT 'USD'")
      addColumnIfMissing('invoices', 'payment_instructions', "TEXT DEFAULT ''")
    },
  },
  {
    version: 2,
    apply(db) {
      const dueDateColumn = db.prepare('PRAGMA table_info(invoices)').all().find((column) => column.name === 'due_date')
      if (dueDateColumn?.notnull) db.transaction(() => {
      db.exec('ALTER TABLE invoices RENAME TO invoices_legacy_due_date')
      db.exec(`CREATE TABLE invoices (
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
      )`)
      db.exec(`INSERT INTO invoices (id, number, client_name, client_email, description, amount, currency, payment_instructions, due_date, status, created_at, sent_at, client_id)
        SELECT id, number, client_name, client_email, description, amount, currency, payment_instructions, NULLIF(due_date, ''), status, created_at, sent_at, client_id
        FROM invoices_legacy_due_date`)
      db.exec('DROP TABLE invoices_legacy_due_date')
      })()
    },
  },
  {
    version: 3,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS line_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS recurring_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL REFERENCES clients(id), business_id INTEGER, description TEXT NOT NULL, frequency TEXT NOT NULL, currency_code TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'active', next_run_at TEXT NOT NULL, auto_send INTEGER NOT NULL DEFAULT 0, source_invoice_id INTEGER REFERENCES invoices(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS schedule_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE, amount REAL NOT NULL, effective_from TEXT NOT NULL, price_change_note INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id), client_id INTEGER REFERENCES clients(id), date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Manual', method TEXT, amount REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      const columns = db.prepare('PRAGMA table_info(invoices)').all()
      if (!columns.some((column) => column.name === 'schedule_id')) db.exec('ALTER TABLE invoices ADD COLUMN schedule_id INTEGER REFERENCES recurring_schedules(id)')
      if (!columns.some((column) => column.name === 'is_past')) db.exec('ALTER TABLE invoices ADD COLUMN is_past INTEGER NOT NULL DEFAULT 0')
      if (!columns.some((column) => column.name === 'issue_date')) db.exec('ALTER TABLE invoices ADD COLUMN issue_date TEXT')
      if (!columns.some((column) => column.name === 'paid_at')) db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_schedule_run ON invoices(schedule_id, issue_date) WHERE schedule_id IS NOT NULL AND issue_date IS NOT NULL')
    },
  },
  {
    version: 4,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS integrations (provider TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'not_connected', account_label TEXT, config_json TEXT NOT NULL DEFAULT '{}', connected_at TEXT, last_error TEXT)`)
    },
  },
  {
    version: 5,
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(business_profile)').all()
      if (!columns.some((column) => column.name === 'invoice_prefix')) db.exec("ALTER TABLE business_profile ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV-'")
      if (!columns.some((column) => column.name === 'invoice_number_padding')) db.exec('ALTER TABLE business_profile ADD COLUMN invoice_number_padding INTEGER NOT NULL DEFAULT 4')
      if (!columns.some((column) => column.name === 'invoice_number_format')) db.exec("ALTER TABLE business_profile ADD COLUMN invoice_number_format TEXT NOT NULL DEFAULT '{PREFIX}{YYYY}-{NUMBER}'")
      if (!columns.some((column) => column.name === 'preferred_email_provider')) db.exec('ALTER TABLE business_profile ADD COLUMN preferred_email_provider TEXT')
    },
  },
  {
    version: 6,
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(business_profile)').all()
      if (!columns.some((column) => column.name === 'default_currency')) db.exec("ALTER TABLE business_profile ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD'")
      db.exec(`CREATE TABLE IF NOT EXISTS currencies (code TEXT PRIMARY KEY, name TEXT NOT NULL, sign TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec("INSERT OR IGNORE INTO currencies (code, name, sign) VALUES ('USD', 'US dollar', '$'), ('CAD', 'Canadian dollar', 'CA$'), ('EUR', 'Euro', '€')")
    },
  },
  {
    version: 7,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS backup_settings (id INTEGER PRIMARY KEY CHECK (id = 1), recipient_email TEXT NOT NULL, interval_days INTEGER NOT NULL DEFAULT 14, enabled INTEGER NOT NULL DEFAULT 1, last_sent_at TEXT, next_run_at TEXT NOT NULL)`)
      const existingSettings = db.prepare('SELECT id FROM backup_settings WHERE id = 1').get()
      if (!existingSettings) {
        const nextRun = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        db.prepare('INSERT INTO backup_settings (id, recipient_email, interval_days, enabled, next_run_at) VALUES (1, ?, 14, 1, ?)').run('dahunsi.damilola@outlook.com', nextRun)
      }
    },
  },
  {
    version: 8,
    apply(db) {
      const encryptExisting = (table, fields, key = 'id') => {
        const rows = db.prepare(`SELECT * FROM ${table}`).all()
        const update = db.prepare(`UPDATE ${table} SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE ${key} = ?`)
        rows.forEach(row => update.run(...fields.map(field => encryptValue(row[field])), row[key]))
      }
      encryptExisting('business_profile', ['name', 'address', 'email', 'phone', 'payment_instructions'])
      encryptExisting('invoices', ['client_name', 'client_email', 'description', 'payment_instructions'])
      encryptExisting('line_items', ['description'])
      encryptExisting('recurring_schedules', ['description'])
      const integrations = db.prepare('SELECT provider, config_json FROM integrations').all()
      const updateIntegration = db.prepare('UPDATE integrations SET config_json = ? WHERE provider = ?')
      integrations.forEach(row => updateIntegration.run(encryptValue(row.config_json || '{}'), row.provider))
    },
  },
  {
    version: 9,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
    },
  },
  {
    version: 10,
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(business_profile)').all()
      if (!columns.some((column) => column.name === 'allow_user_signup')) db.exec('ALTER TABLE business_profile ADD COLUMN allow_user_signup INTEGER NOT NULL DEFAULT 0')
      const userColumns = db.prepare('PRAGMA table_info(users)').all()
      if (!userColumns.some((column) => column.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    },
  },
  {
    version: 11,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS security_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        reset_token_minutes INTEGER NOT NULL DEFAULT 15,
        password_min_length INTEGER NOT NULL DEFAULT 12,
        require_uppercase INTEGER NOT NULL DEFAULT 0,
        require_lowercase INTEGER NOT NULL DEFAULT 0,
        require_number INTEGER NOT NULL DEFAULT 0,
        require_symbol INTEGER NOT NULL DEFAULT 0
      )`)
      db.prepare('INSERT OR IGNORE INTO security_settings (id) VALUES (1)').run()
    },
  },
  {
    // Repair migration for databases where an earlier migration was recorded
    // before all business-profile columns were successfully created.
    version: 12,
    apply(db) {
      const businessProfileColumns = db.prepare('PRAGMA table_info(business_profile)').all()
      if (!businessProfileColumns.some((column) => column.name === 'preferred_email_provider')) {
        db.exec('ALTER TABLE business_profile ADD COLUMN preferred_email_provider TEXT')
      }
    },
  },
]

export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
  const recordMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)')
  for (const migration of migrations) {
    if (hasMigration.get(migration.version)) continue
    db.transaction(() => { migration.apply(db); recordMigration.run(migration.version) })()
    console.log(`Applied database migration ${migration.version}`)
  }
}
