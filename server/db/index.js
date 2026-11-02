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
  const db = new Database(databaseFilename)
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  runMigrations(db)
  return db
}
