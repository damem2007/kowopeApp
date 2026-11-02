import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { schemaSql } from './schema.js'
import { runMigrations } from './migrations.js'
import { createPostgresAdapterNotYetEnabled, getDatabaseConfig, databaseClients } from './adapter.js'

dotenv.config()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../../data')
fs.mkdirSync(dataDir, { recursive: true })

export function initializeDatabase(filename = path.join(dataDir, 'invoices.db')) {
  const databaseConfig = getDatabaseConfig()
  if (databaseConfig.client === databaseClients.POSTGRES) {
    createPostgresAdapterNotYetEnabled()
  }

  const databaseFilename = databaseConfig.sqlitePath || filename
  const databaseExists = fs.existsSync(databaseFilename) && fs.statSync(databaseFilename).size > 0
  const db = new Database(databaseFilename)
  db.pragma('foreign_keys = ON')
  // The base schema is only for a brand-new database. Existing databases must
  // be changed exclusively through versioned migrations; replaying the schema
  // on every startup can fail against a deployed/read-only SQLite volume.
  if (!databaseExists) db.exec(schemaSql)
  runMigrations(db)
  return db
}
