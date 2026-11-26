/**
 * Bring existing payments into the same personal or organization scope as
 * their linked invoices. The update is idempotent and does not delete data.
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required.')

const sql = readFileSync(
  new URL('../server/db/036-payment-scope.postgres.sql', import.meta.url),
  'utf8',
)
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000 })
let client

try {
  client = await pool.connect()
  await client.query(sql)
  console.log('Payment scope PostgreSQL migration applied.')
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK') } catch { /* Original error wins. */ }
  }
  console.error('Payment scope PostgreSQL migration failed:', error.message)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
