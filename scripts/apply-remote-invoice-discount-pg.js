/** Apply persisted invoice discount fields to an existing PostgreSQL database. */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')
const sql = readFileSync(new URL('../server/db/038-invoice-discount.postgres.sql', import.meta.url), 'utf8')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 })
let client
try {
  client = await pool.connect()
  await client.query(sql)
  console.log('Invoice discount PostgreSQL migration applied.')
} catch (error) {
  if (client) { try { await client.query('ROLLBACK') } catch { /* Original error wins. */ } }
  console.error('Invoice discount PostgreSQL migration failed:', error.message)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
