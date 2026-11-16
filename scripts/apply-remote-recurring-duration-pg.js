/**
 * Apply finite recurring-schedule support to an existing hosted PostgreSQL
 * database using DATABASE_URL. This migration is additive and preserves all
 * existing perpetual schedules.
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required.')

const sql = readFileSync(
  new URL('../server/db/035-recurring-duration.postgres.sql', import.meta.url),
  'utf8',
)
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000 })
let client

try {
  client = await pool.connect()
  await client.query(sql)
  console.log('Recurring duration PostgreSQL schema applied.')
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
