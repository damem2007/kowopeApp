import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import nodemailer from 'nodemailer'
import { decryptValue } from '../security/crypto.js'

const executeFile = promisify(execFile)
const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000

function selectEmailIntegration(db) {
  const preferredProvider = db.prepare('SELECT preferred_email_provider FROM business_profile WHERE id = 1').get()?.preferred_email_provider || ''
  return db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY CASE WHEN provider = ? THEN 0 WHEN provider = 'mailjet' THEN 1 WHEN provider = 'outlook' THEN 2 WHEN provider = 'gmail' THEN 3 ELSE 4 END, connected_at DESC LIMIT 1").get(preferredProvider)
}

async function createZipBackup(db, databasePath) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kowope-backup-'))
  const temporaryDatabasePath = path.join(temporaryDirectory, 'kowope.sqlite')
  const zipPath = path.join(temporaryDirectory, `kowope-backup-${new Date().toISOString().slice(0, 10)}.zip`)
  await db.backup(temporaryDatabasePath)
  await executeFile('zip', ['-j', zipPath, temporaryDatabasePath])
  return { temporaryDirectory, zipPath, databasePath }
}

async function sendWithMailjet(integration, recipientEmail, zipPath, businessName) {
  const config = JSON.parse(decryptValue(integration.config_json || '{}'))
  const authorization = Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64')
  const response = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: config.senderEmail, Name: config.fromName || businessName }, To: [{ Email: recipientEmail }], Subject: 'Kowope SQLite backup', TextPart: 'Attached is your scheduled Kowope SQLite backup.', Attachments: [{ ContentType: 'application/zip', Filename: path.basename(zipPath), Base64Content: (await fs.readFile(zipPath)).toString('base64') }] }] }) })
  if (!response.ok) throw new Error(`Mailjet rejected the backup: ${await response.text()}`)
}

async function sendWithSmtp(integration, recipientEmail, zipPath, businessName) {
  const config = JSON.parse(decryptValue(integration.config_json || '{}'))
  const transporter = nodemailer.createTransport({ host: config.host || process.env.SMTP_HOST, port: Number(config.port || process.env.SMTP_PORT || 587), secure: config.secure ?? process.env.SMTP_SECURE === 'true', auth: { user: config.emailAddress || process.env.SMTP_USER, pass: config.smtpPassword || process.env.SMTP_PASS } })
  await transporter.sendMail({ from: process.env.INVOICE_FROM || config.emailAddress || process.env.SMTP_USER, to: recipientEmail, subject: 'Kowope SQLite backup', text: `Scheduled backup for ${businessName}.`, attachments: [{ filename: path.basename(zipPath), content: await fs.readFile(zipPath), contentType: 'application/zip' }] })
}

export async function runScheduledBackup(db, databasePath, force = false) {
  const settings = db.prepare('SELECT * FROM backup_settings WHERE id = 1').get()
  if (!settings?.enabled || !settings.recipient_email || (!force && new Date(settings.next_run_at).getTime() > Date.now())) return { skipped: true, nextRunAt: settings?.next_run_at || null }
  const integration = selectEmailIntegration(db)
  if (!integration) throw new Error('No connected email provider is available for the scheduled backup.')
  const businessName = decryptValue(db.prepare('SELECT name FROM business_profile WHERE id = 1').get()?.name) || 'Kowope'
  const backup = await createZipBackup(db, databasePath)
  try {
    if (integration.provider === 'mailjet') await sendWithMailjet(integration, settings.recipient_email, backup.zipPath, businessName)
    else await sendWithSmtp(integration, settings.recipient_email, backup.zipPath, businessName)
    const nextRunAt = new Date(Date.now() + (Number(settings.interval_days) || 14) * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('UPDATE backup_settings SET last_sent_at = CURRENT_TIMESTAMP, next_run_at = ? WHERE id = 1').run(nextRunAt)
    return { sent: true, provider: integration.provider, recipient: settings.recipient_email, nextRunAt }
  } finally { await fs.rm(backup.temporaryDirectory, { recursive: true, force: true }) }
}

export function startBackupService(db, databasePath) {
  const check = () => runScheduledBackup(db, databasePath).catch(error => console.error('Ledgerly backup failed:', error.message))
  const timer = setInterval(check, 60 * 60 * 1000)
  timer.unref?.()
  return timer
}
