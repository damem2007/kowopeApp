import { encryptValue } from '../security/crypto.js'
import { randomUUID } from 'node:crypto'

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
        id TEXT PRIMARY KEY,
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
        client_id TEXT REFERENCES clients(id)
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
      db.exec(`CREATE TABLE IF NOT EXISTS line_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS recurring_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL REFERENCES clients(id), business_id INTEGER, description TEXT NOT NULL, frequency TEXT NOT NULL, currency_code TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'active', next_run_at TEXT NOT NULL, auto_send INTEGER NOT NULL DEFAULT 0, source_invoice_id TEXT REFERENCES invoices(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS schedule_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE, amount REAL NOT NULL, effective_from TEXT NOT NULL, price_change_note INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      db.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL REFERENCES invoices(id), client_id TEXT REFERENCES clients(id), date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Manual', method TEXT, amount REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
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
      db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
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
  {
    version: 13,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      db.exec(`CREATE TABLE IF NOT EXISTS organization_members (
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        membership_role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (organization_id, user_id),
        UNIQUE (user_id)
      )`)

      const addOrganizationId = (table) => {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all()
        if (!columns.some((column) => column.name === 'organization_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN organization_id INTEGER REFERENCES organizations(id)`)
        }
      }

      for (const table of ['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'currencies', 'integrations']) {
        addOrganizationId(table)
      }
    },
  },
  {
    version: 14,
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(clients)').all()
      if (!columns.some((column) => column.name === 'created_by_user_id')) {
        db.exec('ALTER TABLE clients ADD COLUMN created_by_user_id TEXT REFERENCES users(id)')
      }
    },
  },
  {
    version: 15,
    apply(db) {
      const userColumns = db.prepare('PRAGMA table_info(users)').all()
      if (!userColumns.some((column) => column.name === 'email_verified_at')) {
        db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT')
      }
      db.exec(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
    },
  },
  {
    version: 16,
    apply(db) {
      const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get()
      db.exec('ALTER TABLE currencies RENAME TO currencies_legacy')
      db.exec(`CREATE TABLE currencies (
        code TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        organization_id INTEGER REFERENCES organizations(id),
        name TEXT NOT NULL,
        sign TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (code, user_id)
      )`)
      db.prepare(`INSERT INTO currencies (code, user_id, organization_id, name, sign, created_at)
        SELECT code, CASE WHEN code IN ('USD', 'CAD', 'EUR') THEN NULL ELSE ? END,
          CASE WHEN code IN ('USD', 'CAD', 'EUR') THEN NULL ELSE organization_id END,
          name, sign, created_at FROM currencies_legacy`).run(owner?.id || null)
      db.exec('DROP TABLE currencies_legacy')
    },
  },
  {
    version: 17,
    apply(db) {
      db.prepare("UPDATE currencies SET user_id = NULL, organization_id = NULL WHERE code IN ('USD', 'CAD', 'EUR')").run()
    },
  },
  {
    version: 18,
    apply(db) {
      db.exec(`DELETE FROM currencies
        WHERE code IN ('USD', 'CAD', 'EUR')
          AND rowid NOT IN (
            SELECT MIN(rowid) FROM currencies WHERE code IN ('USD', 'CAD', 'EUR') GROUP BY code
          )`)
      db.prepare("UPDATE currencies SET user_id = NULL, organization_id = NULL WHERE code IN ('USD', 'CAD', 'EUR')").run()
    },
  },
  {
    version: 19,
    apply(db) {
      // System currencies are one shared catalog. Custom currencies are scoped
      // to the account that created them and may also carry its org scope.
      db.prepare("UPDATE currencies SET user_id = NULL, organization_id = NULL WHERE code IN ('USD', 'CAD', 'EUR')").run()
      db.exec(`DELETE FROM currencies
        WHERE code IN ('USD', 'CAD', 'EUR')
          AND rowid NOT IN (
            SELECT MIN(rowid) FROM currencies WHERE code IN ('USD', 'CAD', 'EUR') GROUP BY code
          )`)
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS currencies_global_code ON currencies(code) WHERE user_id IS NULL")
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS currencies_user_code ON currencies(code, user_id) WHERE user_id IS NOT NULL")
    },
  },
  {
    version: 20,
    apply(db) {
      const users = db.prepare('SELECT * FROM users ORDER BY id').all()
      const userIds = new Map(users.map((user) => [user.id, randomUUID()]))
      const memberRows = db.prepare('SELECT * FROM organization_members').all()
      const tokenRows = db.prepare('SELECT * FROM email_verification_tokens').all()
      const currencyRows = db.prepare('SELECT * FROM currencies').all()
      const clientRows = db.prepare('SELECT * FROM clients').all()

      db.pragma('foreign_keys = OFF')
      db.exec('DROP INDEX IF EXISTS currencies_global_code')
      db.exec('DROP INDEX IF EXISTS currencies_user_code')
      db.exec('ALTER TABLE users RENAME TO users_legacy')
      db.exec('ALTER TABLE organization_members RENAME TO organization_members_legacy')
      db.exec('ALTER TABLE email_verification_tokens RENAME TO email_verification_tokens_legacy')
      db.exec('ALTER TABLE currencies RENAME TO currencies_legacy')
      db.exec('ALTER TABLE clients RENAME TO clients_legacy')

      db.exec(`CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        role TEXT NOT NULL DEFAULT 'user',
        email_verified_at TEXT
      )`)
      const insertUser = db.prepare('INSERT INTO users (id, email, password_hash, created_at, role, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)')
      users.forEach((user) => insertUser.run(userIds.get(user.id), user.email, user.password_hash, user.created_at, user.role, user.email_verified_at))

      db.exec(`CREATE TABLE organization_members (
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        membership_role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (organization_id, user_id),
        UNIQUE (user_id)
      )`)
      const insertMember = db.prepare('INSERT INTO organization_members (organization_id, user_id, membership_role, created_at) VALUES (?, ?, ?, ?)')
      memberRows.forEach((row) => insertMember.run(row.organization_id, userIds.get(row.user_id), row.membership_role, row.created_at))

      db.exec(`CREATE TABLE email_verification_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      const insertToken = db.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?)')
      tokenRows.forEach((row) => insertToken.run(row.token_hash, userIds.get(row.user_id), row.expires_at, row.used_at, row.created_at))

      db.exec(`CREATE TABLE currencies (
        code TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        organization_id INTEGER REFERENCES organizations(id),
        name TEXT NOT NULL,
        sign TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (code, user_id)
      )`)
      const insertCurrency = db.prepare('INSERT INTO currencies (code, user_id, organization_id, name, sign, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      currencyRows.forEach((row) => insertCurrency.run(row.code, row.user_id == null ? null : userIds.get(row.user_id), row.organization_id, row.name, row.sign, row.created_at))

      db.exec(`CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        company TEXT,
        phone TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        address TEXT DEFAULT '',
        organization_id INTEGER REFERENCES organizations(id),
        created_by_user_id TEXT REFERENCES users(id)
      )`)
      const insertClient = db.prepare('INSERT INTO clients (id, name, email, company, phone, notes, created_at, address, organization_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      clientRows.forEach((row) => insertClient.run(row.id, row.name, row.email, row.company, row.phone, row.notes, row.created_at, row.address, row.organization_id, row.created_by_user_id == null ? null : userIds.get(row.created_by_user_id)))

      // Keep the renamed tables as a rollback safety copy. They are no longer
      // referenced by the application; removing them can be done separately
      // after the migrated database has been verified.
      db.exec("CREATE UNIQUE INDEX currencies_global_code ON currencies(code) WHERE user_id IS NULL")
      db.exec("CREATE UNIQUE INDEX currencies_user_code ON currencies(code, user_id) WHERE user_id IS NOT NULL")
      db.pragma('foreign_keys = ON')
    },
  },
  {
    version: 21,
    description: 'Repair UUID foreign keys after client rebuild',
    apply(db) {
      db.exec(`
        ALTER TABLE invoices RENAME TO invoices_legacy_fk;
        ALTER TABLE payments RENAME TO payments_legacy_fk;
        ALTER TABLE recurring_schedules RENAME TO recurring_schedules_legacy_fk;
        CREATE TABLE invoices (
          id TEXT PRIMARY KEY,
          number TEXT NOT NULL UNIQUE,
          client_name TEXT NOT NULL,
          client_email TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          payment_instructions TEXT NOT NULL DEFAULT '',
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'Draft',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          client_id TEXT REFERENCES clients(id),
          schedule_id INTEGER REFERENCES recurring_schedules(id),
          is_past INTEGER NOT NULL DEFAULT 0,
          issue_date TEXT,
          paid_at TEXT,
          organization_id INTEGER REFERENCES organizations(id)
        );
        CREATE TABLE recurring_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT NOT NULL REFERENCES clients(id),
          business_id INTEGER,
          description TEXT NOT NULL,
          frequency TEXT NOT NULL,
          currency_code TEXT NOT NULL DEFAULT 'USD',
          status TEXT NOT NULL DEFAULT 'active',
          next_run_at TEXT NOT NULL,
          auto_send INTEGER NOT NULL DEFAULT 0,
          source_invoice_id TEXT REFERENCES invoices(id),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          organization_id INTEGER REFERENCES organizations(id)
        );
        CREATE TABLE payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id TEXT NOT NULL REFERENCES invoices(id),
          client_id TEXT REFERENCES clients(id),
          date TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'Manual',
          method TEXT,
          amount REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          organization_id INTEGER REFERENCES organizations(id)
        );
      `)
      db.exec(`DROP TABLE invoices_legacy_fk; DROP TABLE payments_legacy_fk; DROP TABLE recurring_schedules_legacy_fk;`)
    },
  },
  {
    version: 22,
    description: 'Repair line item foreign key after invoice rebuild',
    apply(db) {
      db.exec(`
        ALTER TABLE line_items RENAME TO line_items_legacy_fk;
        CREATE TABLE line_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          quantity REAL NOT NULL DEFAULT 1,
          unit_price REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        DROP TABLE line_items_legacy_fk;
      `)
    },
  },
  {
    version: 23,
    description: 'Remove empty migration staging tables',
    apply(db) {
      db.exec(`
        DROP TABLE IF EXISTS clients_legacy;
        DROP TABLE IF EXISTS users_legacy;
        DROP TABLE IF EXISTS organization_members_legacy;
        DROP TABLE IF EXISTS email_verification_tokens_legacy;
        DROP TABLE IF EXISTS currencies_legacy;
      `)
    },
  },
  {
    version: 24,
    description: 'Track first login state for users',
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(users)').all()
      if (!columns.some(column => column.name === 'last_login_at')) {
        db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT')
      }
    },
  },
  {
    version: 25,
    description: 'Add user suspension state',
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(users)').all()
      if (!columns.some(column => column.name === 'suspended_at')) {
        db.exec('ALTER TABLE users ADD COLUMN suspended_at TEXT')
      }
    },
  },
  {
    version: 26,
    description: 'Track whether the platform password policy was configured',
    apply(db) {
      const columns = db.prepare('PRAGMA table_info(security_settings)').all()
      if (!columns.some(column => column.name === 'configured_at')) {
        db.exec('ALTER TABLE security_settings ADD COLUMN configured_at TEXT')
      }
    },
  },
  {
    version: 27,
    description: 'Persist authentication sessions across API restarts',
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)')
    },
  },
  {
    version: 28,
    description: 'Add personal ownership to workspace records',
    apply(db) {
      const addUserId = table => {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all()
        if (!columns.some(column => column.name === 'user_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`)
      }
      ;['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'integrations'].forEach(addUserId)
      const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1").get()
      if (owner) {
        ;['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'integrations'].forEach(table => {
          db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL AND organization_id IS NULL`).run(owner.id)
        })
      }
      ;['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'integrations'].forEach(table => db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_user_id ON ${table}(user_id)`))
    },
  },
  {
    version: 29,
    description: 'Allow independent business profiles for users without organizations',
    apply(db) {
      const tableInfo = db.prepare('PRAGMA table_info(business_profile)').all()
      const hasUserId = tableInfo.some(column => column.name === 'user_id')
      if (!hasUserId) db.exec('ALTER TABLE business_profile ADD COLUMN user_id TEXT REFERENCES users(id)')
      db.exec(`CREATE TABLE business_profile_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        payment_instructions TEXT NOT NULL DEFAULT '', invoice_prefix TEXT NOT NULL DEFAULT 'INV-', invoice_number_padding INTEGER NOT NULL DEFAULT 4,
        invoice_number_format TEXT NOT NULL DEFAULT '{PREFIX}{YYYY}-{NUMBER}', preferred_email_provider TEXT, default_currency TEXT NOT NULL DEFAULT 'USD',
        allow_user_signup INTEGER NOT NULL DEFAULT 0, organization_id INTEGER REFERENCES organizations(id), user_id TEXT REFERENCES users(id)
      )`)
      db.exec(`INSERT INTO business_profile_new (id, name, address, email, phone, payment_instructions, invoice_prefix, invoice_number_padding, invoice_number_format, preferred_email_provider, default_currency, allow_user_signup, organization_id, user_id)
        SELECT id, name, address, email, phone, payment_instructions, invoice_prefix, invoice_number_padding, invoice_number_format, preferred_email_provider, default_currency, allow_user_signup, organization_id, user_id FROM business_profile`)
      db.exec('DROP TABLE business_profile')
      db.exec('ALTER TABLE business_profile_new RENAME TO business_profile')
      db.exec('CREATE INDEX IF NOT EXISTS idx_business_profile_user_id ON business_profile(user_id)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_business_profile_organization_id ON business_profile(organization_id)')
    },
  },
  {
    version: 30,
    description: 'Create personal business profiles for users without organizations',
    apply(db) {
      const usersWithoutOrganizations = db.prepare(`
        SELECT u.id FROM users u
        LEFT JOIN organization_members member ON member.user_id = u.id
        LEFT JOIN business_profile profile ON profile.user_id = u.id AND profile.organization_id IS NULL
        WHERE member.user_id IS NULL AND profile.id IS NULL
      `).all()
      const insertProfile = db.prepare('INSERT INTO business_profile (name, user_id, organization_id) VALUES (?, ?, NULL)')
      usersWithoutOrganizations.forEach(user => insertProfile.run('', user.id))
    },
  },
  {
    version: 31,
    description: 'Normalize integrations as platform-global owner-managed records',
    apply(db) {
      db.exec('UPDATE integrations SET organization_id = NULL, user_id = NULL')
    },
  },
]

export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
  const recordMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)')
  for (const migration of migrations) {
    if (hasMigration.get(migration.version)) continue
    // Application migrations are data-preserving by policy. Legacy-table
    // cleanup is allowed, but a new migration must not silently purge a live
    // application table. Rebuilds must copy rows into the replacement table.
    const migrationSource = migration.apply.toString()
    const destructiveLiveTable = /(?:DELETE\s+FROM|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+(?!\w*legacy\b)(users|business_profile|clients|invoices|line_items|payments|recurring_schedules|integrations|currencies|organizations|organization_members)\b/i
    if (destructiveLiveTable.test(migrationSource)) {
      throw new Error(`Migration ${migration.version} contains a destructive operation on live data. Create a preserving migration instead.`)
    }
    db.transaction(() => { migration.apply(db); recordMigration.run(migration.version) })()
    console.log(`Applied database migration ${migration.version}`)
  }
}
