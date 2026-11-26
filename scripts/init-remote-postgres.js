/**
 * Initialize a NEW, EMPTY hosted PostgreSQL database through DATABASE_URL.
 * This script never drops existing tables and refuses to initialize an existing
 * Kowope database. For established instances, apply a versioned migration.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

const baselineFile = new URL('../server/db/postgres-schema.sql', import.meta.url);
const migrationFiles = [
  '../server/db/034-business-numbering.postgres.sql',
  '../server/db/035-recurring-duration.postgres.sql',
  '../server/db/036-payment-scope.postgres.sql',
  '../server/db/037-invoice-number-scope.postgres.sql',
  '../server/db/038-invoice-discount.postgres.sql',
  '../server/db/039-invoice-financial-snapshot.postgres.sql',
].map(file => new URL(file, import.meta.url));

let client;
try {
  client = await pool.connect();
  const result = await client.query(`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = current_schema()
      AND tablename = ANY($1::text[])
    ORDER BY tablename
  `, [[
    'invoices', 'clients', 'business_profile', 'users',
    'recurring_schedules', 'invoice_sequences', 'postgres_schema_migrations',
  ]]);
  if (result.rowCount > 0) {
    throw new Error(`Target database is not empty (${result.rows.map(row => row.tablename).join(', ')}). Do not initialize an existing database.`);
  }

  // Each file owns its own transaction, so no individual version can leave a partial migration.
  await client.query(await readFile(baselineFile, 'utf8'));
  for (const migrationFile of migrationFiles) {
    await client.query(await readFile(migrationFile, 'utf8'));
  }
  console.log('Remote PostgreSQL baseline and application migrations initialized.');
} catch (error) {
  console.error('Remote PostgreSQL initialization failed:', error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
