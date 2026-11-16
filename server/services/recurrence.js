import { randomUUID } from 'node:crypto';
import {
  resolveInvoiceBusiness,
  nextInvoiceNumber,
} from './invoice-numbering.js';

const SUPPORTED_FREQUENCIES = new Set([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
]);

const MAX_CATCH_UP_RUNS_PER_SCHEDULE = 120;

/**
 * The interface intentionally presents title-cased frequency labels (for
 * example, "Monthly"). Persist and process the canonical lowercase values so
 * the scheduler never rejects a schedule created through that interface.
 */
export function normalizeRecurringFrequency(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isSupportedRecurringFrequency(value) {
  return SUPPORTED_FREQUENCIES.has(normalizeRecurringFrequency(value));
}

/**
 * Normalize a date-only value or an ISO timestamp to a UTC calendar day.
 * PostgreSQL returns TIMESTAMPTZ values; SQLite historically stores YYYY-MM-DD.
 */
function toUtcDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid date returned by the database.');
    }
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? '');
  const day = text.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day) {
    throw new Error(`Invalid recurring invoice date: ${text}`);
  }

  return day;
}

/**
 * Calculate the next recurring invoice date in UTC.
 * Like the original implementation, month-end dates are clamped to the last
 * day of the destination month (e.g. January 31 -> February 28).
 */
export function addInterval(value, frequency) {
  const normalizedFrequency = normalizeRecurringFrequency(frequency);
  if (!SUPPORTED_FREQUENCIES.has(normalizedFrequency)) {
    throw new Error(`Unsupported recurring frequency: ${frequency}`);
  }

  const date = new Date(`${toUtcDay(value)}T00:00:00.000Z`);

  if (normalizedFrequency === 'weekly' || normalizedFrequency === 'biweekly') {
    const days = normalizedFrequency === 'weekly' ? 7 : 14;
    date.setUTCDate(date.getUTCDate() + days);
  } else {
    const months = normalizedFrequency === 'monthly'
      ? 1
      : normalizedFrequency === 'quarterly'
        ? 3
        : 12;

    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);

    const lastDayOfMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();

    date.setUTCDate(Math.min(originalDay, lastDayOfMonth));
  }

  return date.toISOString().slice(0, 10);
}

/** Retrieve the price valid for an individual scheduled invoice date. */
export async function resolvePrice(database, scheduleId, runDate) {
  return database.maybeOne(
    `SELECT *
       FROM schedule_price_history
      WHERE schedule_id = ?
        AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1`,
    [scheduleId, runDate],
  );
}

/**
 * Create all invoices due on or before today.
 *
 * The adapter must implement:
 *   transaction(asyncCallback), lockRecurring(), getDueRecurringSchedules(cutoff),
 *   maybeOne(sql, parameters), execute(sql, parameters).
 *
 * Both database adapters hold their invoice-generation lock for the duration
 * of the transaction. No external email is sent inside the transaction.
 */
export async function runDueSchedules(
  database,
  today = new Date().toISOString().slice(0, 10),
) {
  const runThroughDay = toUtcDay(today);
  const endOfDay = `${runThroughDay}T23:59:59.999Z`;

  if (typeof database.lockRecurring !== 'function' ||
      typeof database.getDueRecurringSchedules !== 'function') {
    throw new Error(
      'Database adapter is missing the recurring-invoice locking methods.',
    );
  }

  const createdInvoiceNumbers = [];

  const processDueSchedules = database.transaction(async () => {
    // PostgreSQL: transaction-scoped advisory lock.
    // SQLite: BEGIN IMMEDIATE already holds the writer lock.
    await database.lockRecurring();

    const schedules = await database.getDueRecurringSchedules(endOfDay);
    const businessById = new Map();

    for (const schedule of schedules) {
      const frequency = normalizeRecurringFrequency(schedule.frequency);
      if (!SUPPORTED_FREQUENCIES.has(frequency)) {
        throw new Error(
          `Recurring schedule ${schedule.id} has invalid frequency ${schedule.frequency}.`,
        );
      }

      let runDate = toUtcDay(schedule.next_run_at);
      const endDate = schedule.end_at ? toUtcDay(schedule.end_at) : null;
      let catchUpRuns = 0;

      while (runDate <= runThroughDay) {
        if (endDate && runDate > endDate) {
          break;
        }
        catchUpRuns += 1;

        if (catchUpRuns > MAX_CATCH_UP_RUNS_PER_SCHEDULE) {
          throw new Error(
            `Schedule ${schedule.id} exceeds ${MAX_CATCH_UP_RUNS_PER_SCHEDULE} ` +
            'overdue invoices. Review its start date before retrying.',
          );
        }

        const existingInvoice = await database.maybeOne(
          `SELECT id
             FROM invoices
            WHERE schedule_id = ?
              AND issue_date = ?`,
          [schedule.id, runDate],
        );

        if (!existingInvoice) {
          const price = await resolvePrice(database, schedule.id, runDate);
          const client = await database.maybeOne(
            'SELECT id, name, email FROM clients WHERE id = ?',
            [schedule.client_id],
          );

          if (!price || !Number.isFinite(Number(price.amount)) ||
              Number(price.amount) <= 0) {
            throw new Error(
              `Schedule ${schedule.id} has no valid price for ${runDate}.`,
            );
          }

          if (!client) {
            throw new Error(
              `Client ${schedule.client_id} for schedule ${schedule.id} does not exist.`,
            );
          }

          const invoiceId = randomUUID();
          // Every recurring invoice uses its own business profile. Legacy
          // schedules without a profile are accepted only if one is eligible.
          const profileKey = schedule.business_profile_id != null
            ? `business:${schedule.business_profile_id}`
            : `legacy:${schedule.organization_id ?? ''}:${schedule.user_id ?? ''}`;
          let businessProfile = businessById.get(profileKey);
          if (!businessProfile) {
            businessProfile = await resolveInvoiceBusiness(database, {
              businessProfileId: schedule.business_profile_id,
              organizationId: schedule.organization_id,
              userId: schedule.user_id,
            });
            businessById.set(profileKey, businessProfile);
          }
          const invoiceNumber = await nextInvoiceNumber(
            database,
            businessProfile,
            runDate,
          );

          // Client names, emails, and schedule descriptions are already encrypted
          // in Kowope. Copy the ciphertext as an invoice snapshot: encrypting it
          // a second time would make the user-visible values incorrect.
          await database.execute(
            `INSERT INTO invoices (
               id, number, client_id, client_name, client_email,
               description, amount, currency, due_date, status,
               schedule_id, issue_date, organization_id, user_id,
               business_profile_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoiceId,
              invoiceNumber,
              client.id,
              client.name,
              client.email,
              schedule.description,
              Number(price.amount),
              schedule.currency_code,
              runDate,
              'Draft',
              schedule.id,
              runDate,
              schedule.organization_id ?? null,
              schedule.user_id ?? null,
              businessProfile.id,
            ],
          );

          await database.execute(
            `INSERT INTO line_items (
               invoice_id, description, quantity, unit_price
             ) VALUES (?, ?, ?, ?)`,
            [invoiceId, schedule.description, 1, Number(price.amount)],
          );

          createdInvoiceNumbers.push(invoiceNumber);
        }

        runDate = addInterval(runDate, frequency);
      }

      const completed = Boolean(endDate && runDate > endDate);
      await database.execute(
        'UPDATE recurring_schedules SET frequency = ?, next_run_at = ?, status = ? WHERE id = ?',
        [frequency, runDate, completed ? 'completed' : 'active', schedule.id],
      );
    }
  });

  // The transaction commits before the result is returned. If an operation
  // fails, the adapter rolls back all inserts and schedule date changes.
  await processDueSchedules();
  return createdInvoiceNumbers;
}
