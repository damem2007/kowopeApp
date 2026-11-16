/**
 * Apply the business-numbering schema update to an EXISTING hosted PostgreSQL
 * database using DATABASE_URL. No local PostgreSQL server is required.
 * Back up the database before applying the migration.
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required.')

const sql = readFileSync(
  new URL('../server/db/034-business-numbering.postgres.sql', import.meta.url),
  'utf8',
)
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000 })
let client

try {
  client = await pool.connect()
  await client.query(sql)
  console.log('Business numbering PostgreSQL schema applied.')
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK') } catch { /* Original error wins. */ }
  }
  console.error('PostgreSQL schema update failed:', error.message)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
