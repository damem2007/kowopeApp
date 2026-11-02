/**
 * Database adapter boundary.
 *
 * The application currently uses the synchronous SQLite adapter because its
 * routes and services use better-sqlite3's synchronous API. PostgreSQL is
 * intentionally represented as a separate adapter contract rather than being
 * made to look synchronous: node-postgres is asynchronous and must be wired
 * through async repositories before it can be enabled safely.
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

export function createPostgresAdapterNotYetEnabled() {
  throw new Error(
    'PostgreSQL is configured but not enabled yet. The API must be migrated from synchronous better-sqlite3 calls to async repositories before PostgreSQL can be used safely.',
  )
}
