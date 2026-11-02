import { decryptValue, encryptValue } from '../security/crypto.js'
import { randomUUID } from 'node:crypto'

const asDate = (value) => new Date(`${value}T00:00:00Z`)
export function addInterval(value, frequency) {
  const date = asDate(value)
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  if (frequency === 'biweekly') date.setUTCDate(date.getUTCDate() + 14)
  if (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') {
    const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12
    const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months)
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, last))
  }
  return date.toISOString().slice(0, 10)
}
export function resolvePrice(db, scheduleId, runDate) {
  return db.prepare('SELECT * FROM schedule_price_history WHERE schedule_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1').get(scheduleId, runDate)
}
export function runDueSchedules(db, today = new Date().toISOString().slice(0, 10)) {
  const schedules = db.prepare("SELECT * FROM recurring_schedules WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at, id").all(today)
  const created = []
  const run = db.transaction(() => {
    for (const schedule of schedules) {
      let runDate = schedule.next_run_at
      while (runDate <= today) {
        const exists = db.prepare('SELECT id FROM invoices WHERE schedule_id = ? AND issue_date = ?').get(schedule.id, runDate)
        if (!exists) {
          const price = resolvePrice(db, schedule.id, runDate)
          const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(schedule.client_id)
          const count = db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count + 1
          const number = `INV-${String(count).padStart(4, '0')}`
          const description = decryptValue(schedule.description)
          const invoiceId = randomUUID()
          db.prepare('INSERT INTO invoices (id, number, client_id, client_name, client_email, description, amount, currency, due_date, status, schedule_id, issue_date, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(invoiceId, number, client.id, encryptValue(client.name), encryptValue(client.email), encryptValue(description), price.amount, schedule.currency_code, runDate, 'Draft', schedule.id, runDate, schedule.organization_id)
          db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, 1, ?)').run(invoiceId, encryptValue(description), price.amount)
          created.push(number)
        }
        runDate = addInterval(runDate, schedule.frequency)
      }
      db.prepare('UPDATE recurring_schedules SET next_run_at = ? WHERE id = ?').run(runDate, schedule.id)
    }
  })()
  return created
}
