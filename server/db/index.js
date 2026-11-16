import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDatabaseConfig, databaseClients } from './adapter.js';
import { createPostgresAdapter } from './postgres-adapter.js';
import { createSqliteAsyncAdapter } from './sqlite-async-adapter.js';
import { schemaSql } from './schema.js';
import { runMigrations } from './migrations.js';

dotenv.config();

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(currentDirectory, '../../data');

/**
 * Create either database adapter with the same async interface.
 * Use DATABASE_CLIENT=sqlite or DATABASE_CLIENT=postgres.
 */
export async function initializeDatabase(
  defaultSqlitePath = path.join(dataDirectory, 'invoices.db'),
) {
  const configuration = getDatabaseConfig();

  if (configuration.client === databaseClients.POSTGRES) {
    const database = createPostgresAdapter({
      connectionString: configuration.url,
    });

    try {
      await database.ping();
      const baseline = await database.maybeOne(
        'SELECT version FROM postgres_schema_migrations WHERE version = ?',
        [1],
      );

      if (!baseline) {
        throw new Error(
          'PostgreSQL baseline missing. Initialize the hosted database first.',
        );
      }

      // Invoice-numbering and finite recurring schedules depend on these migrations.
      const numbering = await database.maybeOne(
        'SELECT version FROM postgres_schema_migrations WHERE version = ?', [2]
      );
      if (!numbering) {
        throw new Error('PostgreSQL business numbering migration missing. Run scripts/apply-remote-numbering-pg.js.');
      }
      const recurringDuration = await database.maybeOne(
        'SELECT version FROM postgres_schema_migrations WHERE version = ?', [3]
      );
      if (!recurringDuration) {
        throw new Error('PostgreSQL recurring duration migration missing. Run scripts/apply-remote-recurring-duration-pg.js.');
      }
      return database;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  fs.mkdirSync(dataDirectory, { recursive: true });

  const sqlitePath = configuration.sqlitePath || defaultSqlitePath;
  const sqliteExists = fs.existsSync(sqlitePath) &&
    fs.statSync(sqlitePath).size > 0;

  const { default: BetterSqlite3 } = await import('better-sqlite3');
  const connection = new BetterSqlite3(sqlitePath);

  try {
    connection.pragma('foreign_keys = ON');

    if (!sqliteExists) {
      connection.exec(schemaSql);
    }

    // Historical SQLite migrations remain synchronous and must run only here.
    runMigrations(connection);

    return createSqliteAsyncAdapter(connection);
  } catch (error) {
    connection.close();
    throw error;
  }
}
