import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Adapt better-sqlite3 to the same asynchronous method contract used by pg.
 *
 * All SQLite operations share an explicit FIFO queue. Transaction callbacks
 * can safely use await without committing before the callback has completed.
 * Only use this wrapper after the synchronous SQLite schema migrations run.
 */
export function createSqliteAsyncAdapter(connection) {
  const transactionContext = new AsyncLocalStorage();
  let operationQueue = Promise.resolve();
  let closed = false;
  let savepointNumber = 0;

  function isInsideTransaction() {
    const context = transactionContext.getStore();
    return context?.connection === connection && context.active === true;
  }

  function scheduleOperation(operation) {
    if (closed) {
      return Promise.reject(new Error('SQLite connection is closed.'));
    }

    if (isInsideTransaction()) {
      return Promise.resolve().then(operation);
    }

    const scheduled = operationQueue.then(operation, operation);
    operationQueue = scheduled.catch(() => {});
    return scheduled;
  }

  function executeStatement(sql, parameters = []) {
    const statement = connection.prepare(sql);

    if (statement.reader) {
      const rows = statement.all(...parameters);
      return { rows, rowCount: rows.length, changes: 0 };
    }

    const result = statement.run(...parameters);
    return {
      rows: [],
      rowCount: result.changes,
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async function query(sql, parameters = []) {
    return scheduleOperation(() => executeStatement(sql, parameters));
  }

  async function maybeOne(sql, parameters = []) {
    const result = await query(sql, parameters);
    return result.rows[0];
  }

  async function one(sql, parameters = []) {
    const rows = await many(sql, parameters);
    if (rows.length !== 1) {
      throw new Error(`Expected exactly one row, got ${rows.length}.`);
    }
    return rows[0];
  }

  async function many(sql, parameters = []) {
    const result = await query(sql, parameters);
    return result.rows;
  }

  async function execute(sql, parameters = []) {
    return query(sql, parameters);
  }

  function prepare(sql) {
    return {
      get: (...parameters) => maybeOne(sql, parameters),
      all: (...parameters) => many(sql, parameters),
      run: (...parameters) => execute(sql, parameters),
    };
  }

  function transaction(callback) {
    return async (...argumentsForCallback) => {
      if (isInsideTransaction()) {
        const savepoint = `kowope_sp_${++savepointNumber}`;
        connection.exec(`SAVEPOINT ${savepoint}`);

        try {
          const result = await callback(...argumentsForCallback);
          connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          connection.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      }

      return scheduleOperation(async () => {
        const context = { connection, active: true };
        connection.exec('BEGIN IMMEDIATE');

        try {
          return await transactionContext.run(context, async () => {
            try {
              const result = await callback(...argumentsForCallback);
              connection.exec('COMMIT');
              return result;
            } catch (error) {
              connection.exec('ROLLBACK');
              throw error;
            } finally {
              context.active = false;
            }
          });
        } finally {
          context.active = false;
        }
      });
    };
  }

  // BEGIN IMMEDIATE serializes writers and collision checks in SQLite.
  async function lockInvoiceNumbering() {
    if (!isInsideTransaction()) {
      throw new Error('Invoice-numbering lock requires an active SQLite transaction.');
    }
  }

  async function lockRecurring() {
    if (!isInsideTransaction()) {
      throw new Error('Recurring lock requires an active SQLite transaction.');
    }
    // BEGIN IMMEDIATE already holds the SQLite writer lock.
  }

  async function getDueRecurringSchedules(cutoff) {
    if (!isInsideTransaction()) {
      throw new Error('Recurring schedules must be loaded inside a transaction.');
    }
    return many(
      `SELECT *
         FROM recurring_schedules
        WHERE status = ?
          AND next_run_at <= ?
        ORDER BY next_run_at, id`,
      ['active', cutoff],
    );
  }

  async function close() {
    // Prevent new work, but let already queued work drain before closing.
    closed = true;
    await operationQueue;
    connection.close();
  }

  return {
    client: 'sqlite',
    // Only for the unchanged SQLite backup service; never expose to API repositories.
    legacyBackupDatabase: connection,
    query,
    maybeOne,
    one,
    many,
    execute,
    prepare,
    transaction,
    lockRecurring,
    lockInvoiceNumbering,
    getDueRecurringSchedules,
    close,
  };
}
