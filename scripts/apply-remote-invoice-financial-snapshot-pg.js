/** Apply immutable invoice financial snapshots to an existing PostgreSQL database. */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')
const sql = readFileSync(new URL('../server/db/039-invoice-financial-snapshot.postgres.sql', import.meta.url), 'utf8')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 })
let client
try {
  client = await pool.connect()
  await client.query(sql)
  console.log('Invoice financial snapshot PostgreSQL migration applied.')
} catch (error) {
  if (client) { try { await client.query('ROLLBACK') } catch { /* Original error wins. */ } }
  console.error('Invoice financial snapshot PostgreSQL migration failed:', error.message)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
