import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import { placeholders } from './sql-params.js'

// Compatibility interface for existing statements; every operation is ASYNCHRONOUS.
// Each db.transaction() callback executes on exactly one pg client, including
// nested db.prepare().get()/all()/run() calls inside the transaction callback.
const { Pool, types } = pg
const context = new AsyncLocalStorage()
// COUNT(*) yields int8 in PostgreSQL; convert only values safe for JS arithmetic.
types.setTypeParser(20, value => {const n=Number(value); if (!Number.isSafeInteger(n)) throw new Error('int8 exceeds safe JS integer'); return n})
types.setTypeParser(1700, value => Number(value)) // For future NUMERIC columns
types.setTypeParser(1184, value => new Date(value).toISOString()) // timestamptz, preserve string API

export function createPostgresAdapter({ connectionString = process.env.DATABASE_URL, max = 10 } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // Prefer sslmode=require in the connection URL for cloud providers.
  })
  pool.on('error', e => console.error('Idle PostgreSQL client error:', e))

  async function query(sql, params = []) {
    const client = context.getStore()?.client || pool
    return client.query(placeholders(sql), params)
  }
  const one = async (sql, params = []) => {
    const rows = (await query(sql, params)).rows
    if (rows.length !== 1) throw new Error(`Expected 1 row; got ${rows.length}`)
    return rows[0]
  }
  const maybeOne = async (sql, params = []) => (await query(sql, params)).rows[0] || undefined
  const many = async (sql, params = []) => (await query(sql, params)).rows
  const execute = async (sql, params = []) => {
    // SQLite historically provided lastInsertRowid. Preserve the API by appending
    // RETURNING id only for known GENERATED ID inserts, not every INSERT statement.
    const withId = /^\s*INSERT\s+INTO\s+(organizations|business_profile|line_items|recurring_schedules|schedule_price_history|payments)\b/i.test(sql) &&
      !/\bRETURNING\b/i.test(sql)
    const statement = withId ? `${sql.trim().replace(/;$/, '')} RETURNING id` : sql
    const result = await query(statement, params)
    return { changes: result.rowCount, rowCount: result.rowCount,
      lastInsertRowid: result.rows?.[0]?.id, rows: result.rows }
  }
  function prepare(sql) {
    // The SQL is stable and parameterized; this is NOT synchronous SQLite emulation.
    return {
      get: (...args) => maybeOne(sql, args),
      all: (...args) => many(sql, args),
      run: (...args) => execute(sql, args),
    }
  }
  function transaction(fn) {
    return async (...args) => {
      // Nested transactions must use savepoints; never acquire a different client.
      const active = context.getStore()
      if (active?.client) {
        const savepoint = `sp_${++active.nextSavepoint}`
        await active.client.query(`SAVEPOINT ${savepoint}`)
        try {const result = await fn(...args); await active.client.query(`RELEASE SAVEPOINT ${savepoint}`); return result}
        catch(e) {await active.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); throw e}
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        return await context.run({client, nextSavepoint: 0}, async () => {
          try {const result = await fn(...args); await client.query('COMMIT'); return result}
          catch(e) {await client.query('ROLLBACK'); throw e}
        })
      } finally { client.release() }
    }
  }
  // Serialize recurring workers using this database. Lock releases on COMMIT
  // or ROLLBACK. The constant identifies the Kowope recurring-invoice mutex.
  // Serializes collision checks across ALL businesses while invoices.number
  // is globally UNIQUE in the historical schema. Must hold a transaction.
  async function lockInvoiceNumbering() {
    if (!context.getStore()?.client) {
      throw new Error('Invoice-numbering lock requires an active PostgreSQL transaction.')
    }
    await query('SELECT pg_advisory_xact_lock(78301, 20261111)')
  }

  async function lockRecurring() {
    if (!context.getStore()?.client) {
      throw new Error('Recurring lock requires an active PostgreSQL transaction.')
    }
    await query('SELECT pg_advisory_xact_lock(78301, 20261110)')
  }

  async function getDueRecurringSchedules(cutoff) {
    if (!context.getStore()?.client) {
      throw new Error('Recurring schedules must be loaded inside a transaction.')
    }
    return many(
      `SELECT *
         FROM recurring_schedules
        WHERE status = ?
          AND next_run_at <= ?
        ORDER BY next_run_at, id
        FOR UPDATE`,
      ['active', cutoff],
    )
  }

  return {
    client: 'postgres',
    query,
    one,
    maybeOne,
    many,
    execute,
    prepare,
    transaction,
    lockRecurring,
    lockInvoiceNumbering,
    getDueRecurringSchedules,
    close: () => pool.end(),
    ping: () => pool.query('SELECT 1 AS ok'),
  }
}
