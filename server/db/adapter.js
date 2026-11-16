/**
 * Database adapter boundary.
 *
 * Both supported engines now expose asynchronous query methods.
 * SQLite uses a serialized better-sqlite3 wrapper and PostgreSQL uses pg.
 * Legacy services that expect synchronous database access must be migrated
 * separately before the entire API can use the switch.
 */
export const databaseClients = Object.freeze({
  SQLITE: 'sqlite',
  POSTGRES: 'postgres',
})

export function getDatabaseClient(environment = process.env) {
  const configuredClient = String(environment.DATABASE_CLIENT || 'sqlite').trim().toLowerCase()
  if (!Object.values(databaseClients).includes(configuredClient)) {
    throw new Error(`Unsupported DATABASE_CLIENT "${configuredClient}". Use "sqlite" or "postgres".`)
  }
  return configuredClient
}

export function getDatabaseConfig(environment = process.env) {
  const client = getDatabaseClient(environment)
  if (client === databaseClients.POSTGRES && !environment.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DATABASE_CLIENT=postgres.')
  }

  return {
    client,
    url: environment.DATABASE_URL || null,
    sqlitePath: environment.SQLITE_DATABASE_PATH || null,
  }
}

/**
 * Common capabilities expected by the application repositories.
 *
 * This is deliberately a contract, not a fake synchronous Postgres wrapper.
 * Repositories should depend on these methods once the API is converted to
 * async database access.
 */
export const databaseAdapterContract = Object.freeze([
  'query',
  'one',
  'maybeOne',
  'many',
  'execute',
  'transaction',
  'lockInvoiceNumbering',
  'lockRecurring',
  'getDueRecurringSchedules',
  'close',
])

export function assertDatabaseAdapter(adapter) {
  for (const method of databaseAdapterContract) {
    if (typeof adapter?.[method] !== 'function') {
      throw new Error(`Database adapter is missing the ${method}() method.`)
    }
  }
  return adapter
}

