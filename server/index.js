import express from "express";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { initializeDatabase } from "./db/index.js";
import { runDueSchedules } from './services/recurrence.js';
import { startBackupService } from './services/backup.js';
import { runScheduledBackup } from './services/backup.js';
import { decryptFields, decryptValue, encryptValue, businessFields, invoiceFields } from './security/crypto.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
const db = initializeDatabase();
const databasePath = path.join(__dirname, '../data/invoices.db');
startBackupService(db, databasePath);
if (!db.prepare('SELECT id FROM users LIMIT 1').get() && process.env.KOWOPE_OWNER_EMAIL && process.env.KOWOPE_OWNER_PASSWORD) {
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(process.env.KOWOPE_OWNER_EMAIL.trim().toLowerCase(), hashPassword(process.env.KOWOPE_OWNER_PASSWORD), 'owner');
}
const getBusinessProfile = () => decryptFields(db.prepare('SELECT * FROM business_profile WHERE id = 1').get(), businessFields);
const getIntegrationConfig = integration => integration ? { ...integration, config_json: decryptValue(integration.config_json || '{}') } : integration;
const decryptInvoice = invoice => decryptFields(invoice, invoiceFields);
const oauthStates = new Map();
const sessions = new Map();
const sessionCookie = 'ledgerly_session';
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, storedHash) => { const [salt, hash] = storedHash.split(':'); const candidate = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex')); };
const readSession = req => { const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`)); return cookie ? sessions.get(cookie.slice(sessionCookie.length + 1)) : null; };

function getProviders() {
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
  const host = (process.env.SMTP_HOST || "").toLowerCase();
  const gmailConfigured = smtpConfigured && host.includes("gmail");
  const outlookConfigured =
    smtpConfigured && (host.includes("office365") || host.includes("outlook"));
  return [
    {
      id: "gmail",
      name: "Google Gmail",
      type: "mail",
      connected: gmailConfigured,
      description: gmailConfigured
        ? "Connected through configured Gmail SMTP."
        : "Configure Gmail SMTP credentials in .env.",
    },
    {
      id: "outlook",
      name: "Microsoft Outlook",
      type: "mail",
      connected: outlookConfigured,
      description: outlookConfigured
        ? "Connected through configured Outlook SMTP."
        : "Configure Outlook SMTP credentials in .env.",
    },
    {
      id: "mailjet",
      name: "Mailjet",
      type: "mail",
      connected: Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY),
      description: "Connect Mailjet to send invoice emails with the Mailjet API.",
    },
    {
      id: "stripe",
      name: "Stripe",
      type: "payments",
      connected: Boolean(process.env.STRIPE_SECRET_KEY),
      description: "Add STRIPE_SECRET_KEY to enable payment links.",
    },
    {
      id: "quickbooks",
      name: "QuickBooks",
      type: "accounting",
      connected: Boolean(
        process.env.QUICKBOOKS_CLIENT_ID &&
        process.env.QUICKBOOKS_CLIENT_SECRET,
      ),
      description: "Add QuickBooks OAuth credentials to enable sync.",
    },
  ];
}

app.get("/api/providers", (_req, res) => res.json(getProviders()));
app.get('/api/auth/status', (_req, res) => res.json({ authenticated: Boolean(readSession(_req)), allowSignup: Boolean(db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get()?.allow_user_signup) }));
app.post('/api/auth/signup', (req, res) => {
  if (!db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get()?.allow_user_signup) return res.status(403).json({ error: 'New user accounts are disabled by the owner.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12) return res.status(400).json({ error: 'Use a valid email and a password of at least 12 characters.' });
  try { const user = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, hashPassword(password), 'user'); const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.lastInsertRowid); res.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/`); res.status(201).json({ authenticated: true }); }
  catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? 'An account with that email already exists.' : error.message }); }
});
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.id);
  res.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/`); res.json({ authenticated: true });
});
app.post('/api/auth/password', (req, res) => {
  const userId = readSession(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (newPassword.length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  res.json({ ok: true });
});
app.get('/api/platform/user-management', (req, res) => { if (!readSession(req)) return res.status(401).json({ error: 'Authentication required.' }); res.json({ allowSignup: Boolean(db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get()?.allow_user_signup) }); });
app.put('/api/platform/user-management', (req, res) => { if (!readSession(req)) return res.status(401).json({ error: 'Authentication required.' }); db.prepare('UPDATE business_profile SET allow_user_signup = ? WHERE id = 1').run(req.body.allowSignup ? 1 : 0); res.json({ allowSignup: Boolean(req.body.allowSignup) }); });
app.post('/api/auth/logout', (req, res) => { const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`)); if (cookie) sessions.delete(cookie.slice(sessionCookie.length + 1)); res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); res.status(204).end(); });
app.use('/api', (req, res, next) => { if (req.path.startsWith('/auth/')) return next(); if (!readSession(req)) return res.status(401).json({ error: 'Authentication required.' }); next(); });
app.post('/api/backups/run', async (_req, res) => { try { const result = await runScheduledBackup(db, databasePath, true); res.json(result); } catch (error) { res.status(502).json({ error: error.message }); } });
app.get('/api/integrations', (_req, res) => res.json(db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations ORDER BY provider').all().map(getIntegrationConfig)))
app.put('/api/integrations/:provider', (req, res) => {
  const { status = 'connected', accountLabel = '', config = {} } = req.body
  db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL) ON CONFLICT(provider) DO UPDATE SET status=excluded.status, account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL`).run(req.params.provider, status, accountLabel, encryptValue(JSON.stringify(config)))
  res.json(getIntegrationConfig(db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations WHERE provider = ?').get(req.params.provider)))
})
app.delete('/api/integrations/:provider', (req, res) => { db.prepare('DELETE FROM integrations WHERE provider = ?').run(req.params.provider); res.status(204).end() })
app.get('/api/integrations/outlook/oauth/start', (req, res) => {
  if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_REDIRECT_URI) return res.status(400).send('Configure OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI in .env first.');
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, response_type: 'code', redirect_uri: process.env.OUTLOOK_REDIRECT_URI, response_mode: 'query', scope: 'openid profile email offline_access Mail.Send', state });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});
app.get('/api/integrations/outlook/oauth/callback', async (req, res) => {
  const expiresAt = oauthStates.get(req.query.state);
  oauthStates.delete(req.query.state);
  if (!expiresAt || expiresAt < Date.now() || !req.query.code) return res.status(400).send('Invalid or expired Microsoft OAuth request.');
  try {
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, client_secret: process.env.OUTLOOK_CLIENT_SECRET || '', grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.OUTLOOK_REDIRECT_URI, scope: 'openid profile email offline_access Mail.Send' }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(400).send(token.error_description || 'Microsoft authorization failed.');
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json();
    db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error) VALUES ('outlook', 'connected', ?, ?, CURRENT_TIMESTAMP, NULL) ON CONFLICT(provider) DO UPDATE SET status='connected', account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL`).run(profile.mail || profile.userPrincipalName || 'Microsoft Outlook', encryptValue(JSON.stringify({ authType: 'oauth2', accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, emailAddress: profile.mail || profile.userPrincipalName || '' })));
    res.redirect('/?outlook=connected');
  } catch (error) { res.status(500).send(error.message); }
});
app.get('/api/recurring', (_req, res) => res.json(db.prepare('SELECT s.*, c.name AS client_name, p.amount AS current_amount FROM recurring_schedules s JOIN clients c ON c.id = s.client_id LEFT JOIN schedule_price_history p ON p.schedule_id = s.id AND p.id = (SELECT id FROM schedule_price_history WHERE schedule_id = s.id ORDER BY effective_from DESC, id DESC LIMIT 1) ORDER BY s.next_run_at').all().map(schedule => ({ ...schedule, description: decryptValue(schedule.description) }))));
app.post('/api/recurring', (req, res) => {
  const { clientId, description, amount, frequency, nextRunAt, currency = 'USD', autoSend = 0, sourceInvoiceId = null } = req.body;
  if (!clientId || !description || !(Number(amount) > 0) || !frequency || !nextRunAt) return res.status(400).json({ error: 'Client, description, amount, frequency, and next invoice date are required.' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const createSchedule = db.transaction(() => {
    const result = db.prepare('INSERT INTO recurring_schedules (client_id, description, frequency, currency_code, next_run_at, auto_send, source_invoice_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(clientId, encryptValue(description), frequency, currency, nextRunAt, autoSend ? 1 : 0, sourceInvoiceId);
    db.prepare('INSERT INTO schedule_price_history (schedule_id, amount, effective_from) VALUES (?, ?, ?)').run(result.lastInsertRowid, Number(amount), nextRunAt);
    return result;
  });
  const result = createSchedule();
  res.status(201).json({ ...db.prepare('SELECT * FROM recurring_schedules WHERE id = ?').get(result.lastInsertRowid), description });
});
app.patch('/api/recurring/:id', (req, res) => {
  const { status, nextRunAt } = req.body;
  if (status && !['active', 'paused'].includes(status)) return res.status(400).json({ error: 'Invalid recurring schedule status.' });
  const schedule = db.prepare('SELECT * FROM recurring_schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found.' });
  db.prepare('UPDATE recurring_schedules SET status = COALESCE(?, status), next_run_at = COALESCE(?, next_run_at) WHERE id = ?').run(status || null, nextRunAt || null, req.params.id);
  res.json(db.prepare('SELECT * FROM recurring_schedules WHERE id = ?').get(req.params.id));
});
app.post('/api/recurring/run', (_req, res) => res.json({ created: runDueSchedules(db) }));
app.post('/api/recurring/:id/price', (req, res) => { const { amount, effectiveFrom, priceChangeNote = false } = req.body; if (!(Number(amount) > 0) || !effectiveFrom) return res.status(400).json({ error: 'Enter a valid amount and effective date.' }); const result = db.prepare('INSERT INTO schedule_price_history (schedule_id, amount, effective_from, price_change_note) VALUES (?, ?, ?, ?)').run(req.params.id, Number(amount), effectiveFrom, priceChangeNote ? 1 : 0); res.status(201).json(db.prepare('SELECT * FROM schedule_price_history WHERE id = ?').get(result.lastInsertRowid)); });
app.get("/api/business-profile", (_req, res) => res.json(getBusinessProfile()));
app.get('/api/currencies', (_req, res) => res.json(db.prepare('SELECT code, name, sign FROM currencies ORDER BY code').all()));
app.post('/api/currencies', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  const sign = String(req.body.sign || '').trim();
  if (!/^[A-Z]{3}$/.test(code) || !name || !sign) return res.status(400).json({ error: 'Currency code, name, and sign are required.' });
  try { db.prepare('INSERT INTO currencies (code, name, sign) VALUES (?, ?, ?)').run(code, name, sign); res.status(201).json(db.prepare('SELECT code, name, sign FROM currencies WHERE code = ?').get(code)); }
  catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? `${code} is already in your currency list.` : error.message }); }
});
app.delete('/api/currencies/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (code === 'USD') return res.status(400).json({ error: 'USD cannot be removed.' });
  const defaultCurrency = db.prepare('SELECT default_currency FROM business_profile WHERE id = 1').get()?.default_currency;
  if (code === defaultCurrency) return res.status(400).json({ error: 'Choose another default currency first.' });
  db.prepare('DELETE FROM currencies WHERE code = ?').run(code); res.status(204).end();
});
app.put("/api/business-profile", (req, res) => {
  const {
    number: requestedNumber,
    name = "",
    address = "",
    email = "",
    phone = "",
    paymentInstructions = "",
    invoicePrefix = "INV-",
    invoiceNumberPadding = 4,
    invoiceNumberFormat = "{PREFIX}{YYYY}-{NUMBER}",
    preferredEmailProvider = null,
    defaultCurrency = 'USD',
  } = req.body;
  db.prepare(
    "UPDATE business_profile SET name = ?, address = ?, email = ?, phone = ?, payment_instructions = ?, invoice_prefix = ?, invoice_number_padding = ?, invoice_number_format = ?, preferred_email_provider = ?, default_currency = ? WHERE id = 1",
  ).run(encryptValue(name), encryptValue(address), encryptValue(email), encryptValue(phone), encryptValue(paymentInstructions), invoicePrefix, Math.min(10, Math.max(1, Number(invoiceNumberPadding) || 4)), invoiceNumberFormat || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider, defaultCurrency);
  res.json(getBusinessProfile());
});
app.get("/api/clients", (_req, res) =>
  res.json(
    db
      .prepare(
        `SELECT c.*, COUNT(i.id) AS invoice_count, COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount ELSE 0 END), 0) AS outstanding FROM clients c LEFT JOIN invoices i ON i.client_id = c.id GROUP BY c.id ORDER BY c.name`,
      )
      .all().map(decryptInvoice),
  ),
);
app.get("/api/clients/:id/invoices", (req, res) =>
  res.json(
    db
      .prepare("SELECT * FROM invoices WHERE client_id = ? ORDER BY id DESC")
      .all(req.params.id),
  ),
);
app.post("/api/clients", (req, res) => {
  const {
    name,
    email,
    company = "",
    address = "",
    phone = "",
    notes = "",
  } = req.body;
  if (!name || !email)
    return res
      .status(400)
      .json({ error: "Client name and email are required." });
  try {
    const result = db
      .prepare(
        "INSERT INTO clients (name, email, company, address, phone, notes) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(name, email, company, address, phone, notes);
    res
      .status(201)
      .json(
        db
          .prepare("SELECT * FROM clients WHERE id = ?")
          .get(result.lastInsertRowid),
      );
  } catch (error) {
    res
      .status(409)
      .json({
        error: error.message.includes("UNIQUE")
          ? "A client with this email already exists."
          : error.message,
      });
  }
});
app.patch("/api/clients/:id", (req, res) => {
  const {
    name,
    email,
    company = "",
    address = "",
    phone = "",
    notes = "",
  } = req.body;
  if (!name || !email)
    return res
      .status(400)
      .json({ error: "Client name and email are required." });
  try {
    db.prepare(
      "UPDATE clients SET name = ?, email = ?, company = ?, address = ?, phone = ?, notes = ? WHERE id = ?",
    ).run(name, email, company, address, phone, notes, req.params.id);
    res.json(
      db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id),
    );
  } catch (error) {
    res
      .status(409)
      .json({
        error: error.message.includes("UNIQUE")
          ? "A client with this email already exists."
          : error.message,
      });
  }
});
app.delete("/api/clients/:id", (req, res) => {
  const linked = db
    .prepare("SELECT COUNT(*) AS count FROM invoices WHERE client_id = ?")
    .get(req.params.id).count;
  if (linked > 0)
    return res
      .status(409)
      .json({
        error: "This client has linked invoices and cannot be deleted.",
      });
  db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
app.get("/api/invoices", (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id ORDER BY i.id DESC",
      )
      .all(),
  ),
);
app.get('/api/invoices/:id', (req, res) => {
  const invoice = decryptInvoice(db.prepare('SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ? OR i.number = ?').get(req.params.id, req.params.id));
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  invoice.lineItems = db.prepare('SELECT id, description, quantity, unit_price FROM line_items WHERE invoice_id = ? ORDER BY id').all(invoice.id).map(item => ({ ...item, description: decryptValue(item.description) }));
  res.json(invoice);
});
app.post("/api/invoices", (req, res) => {
  const {
    number: requestedNumber,
    clientId,
    clientName,
    clientEmail,
    clientAddress = "",
    description,
    amount,
    dueDate,
    currency = "USD",
    paymentInstructions = "",
    lineItems = [],
    issueDate = null,
    isPast = false,
  } = req.body;
  let client = clientId
    ? db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId)
    : null;
  if (!client && clientName && clientEmail) {
    try {
      const result = db
        .prepare("INSERT INTO clients (name, email, address) VALUES (?, ?, ?)")
        .run(clientName, clientEmail, clientAddress);
      client = db
        .prepare("SELECT * FROM clients WHERE id = ?")
        .get(result.lastInsertRowid);
    } catch (error) {
      client = db
        .prepare("SELECT * FROM clients WHERE email = ?")
        .get(clientEmail);
      if (!client) return res.status(409).json({ error: error.message });
    }
  }
  if (!client || !description || !amount)
    return res
      .status(400)
      .json({
        error: "Select a client or enter the recipient name and email.",
      });
  const next =
    db.prepare("SELECT COUNT(*) AS count FROM invoices").get().count + 1;
  const businessProfile = db.prepare('SELECT invoice_prefix, invoice_number_padding, invoice_number_format FROM business_profile WHERE id = 1').get() || { invoice_prefix: 'INV-', invoice_number_padding: 4, invoice_number_format: '{PREFIX}{YYYY}-{NUMBER}' };
  const invoicePrefix = businessProfile.invoice_prefix || 'INV-';
  const invoicePadding = Math.min(10, Math.max(1, Number(businessProfile.invoice_number_padding) || 4));
  const numberFormat = businessProfile.invoice_number_format || '{PREFIX}{YYYY}-{NUMBER}';
  const number = requestedNumber || numberFormat.replaceAll('{PREFIX}', invoicePrefix).replaceAll('{YYYY}', String(new Date().getFullYear())).replaceAll('{YY}', String(new Date().getFullYear()).slice(-2)).replaceAll('{NUMBER}', String(next).padStart(invoicePadding, '0'));
  const result = db
    .prepare(
      "INSERT INTO invoices (number, client_id, client_name, client_email, description, amount, currency, payment_instructions, due_date, issue_date, is_past) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      number,
      client.id,
      encryptValue(client.name),
      encryptValue(client.email),
      encryptValue(description),
      Number(amount),
      currency,
      encryptValue(paymentInstructions),
      dueDate || null,
      issueDate || null,
      isPast ? 1 : 0,
    );
  const insertLineItem = db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    if (item.description || Number(item.unitPrice) > 0) insertLineItem.run(result.lastInsertRowid, encryptValue(item.description || 'Line item'), Number(item.quantity) || 1, Number(item.unitPrice) || 0);
  }
  res
    .status(201)
    .json(
      decryptInvoice(db.prepare("SELECT * FROM invoices WHERE id = ?").get(result.lastInsertRowid)),
    );
});
app.patch('/api/invoices/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR number = ?').get(req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  const { clientId, description, amount, dueDate, currency = 'USD', paymentInstructions = '', lineItems = [] } = req.body;
  const client = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : null;
  if (!client || !description || !(Number(amount) > 0)) return res.status(400).json({ error: 'Select a client and add at least one priced line item.' });
  const update = db.prepare('UPDATE invoices SET client_id = ?, client_name = ?, client_email = ?, description = ?, amount = ?, currency = ?, payment_instructions = ?, due_date = ? WHERE id = ?');
  const replaceItems = db.transaction(() => {
    update.run(client.id, encryptValue(client.name), encryptValue(client.email), encryptValue(description), Number(amount), currency, encryptValue(paymentInstructions), dueDate || null, invoice.id);
    db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(invoice.id);
    const insertLineItem = db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
    for (const item of Array.isArray(lineItems) ? lineItems : []) {
      if (item.description || Number(item.unitPrice) > 0) insertLineItem.run(invoice.id, encryptValue(item.description || 'Line item'), Number(item.quantity) || 1, Number(item.unitPrice) || 0);
    }
  });
  replaceItems();
  res.json(decryptInvoice(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id)));
});
app.patch('/api/invoices/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['Draft', 'Sent', 'Paid', 'Overdue'].includes(status)) return res.status(400).json({ error: 'Invalid invoice status.' });
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR number = ?').get(req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  db.prepare('UPDATE invoices SET status = ?, sent_at = CASE WHEN ? = \'Sent\' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ?').run(status, status, invoice.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id));
});
app.delete('/api/invoices/:id', (req, res) => {
  const invoice = db.prepare('SELECT id FROM invoices WHERE id = ? OR number = ?').get(req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  db.prepare('DELETE FROM invoices WHERE id = ?').run(invoice.id);
  res.status(204).end();
});
app.post('/api/payments', (req, res) => {
  const { invoiceId, method = 'Manual', date, amount } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR number = ?').get(invoiceId, invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!date || !(Number(amount) > 0)) return res.status(400).json({ error: 'Payment date and amount are required.' });
  const result = db.prepare('INSERT INTO payments (invoice_id, client_id, date, source, method, amount) VALUES (?, ?, ?, ?, ?, ?)').run(invoice.id, invoice.client_id, date, 'Manual', method, Number(amount));
  db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(invoice.id);
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid));
});
app.get('/api/payments', (_req, res) => res.json(db.prepare('SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id ORDER BY p.id DESC').all()));
function createPdf(invoice) {
  return new Promise((resolve) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 55 });
    const business = invoice.business ? decryptFields(invoice.business, businessFields) : getBusinessProfile() || {};
    const lineItems = invoice.lineItems || (invoice.id ? db.prepare('SELECT description, quantity, unit_price AS unitPrice FROM line_items WHERE invoice_id = ? ORDER BY id').all(invoice.id).map(item => ({ ...item, description: decryptValue(item.description) })) : []);
    const items = lineItems.length ? lineItems : [{ description: invoice.description || 'Line item', quantity: 1, unitPrice: Number(invoice.amount) || 0 }];
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitPrice || 0), 0);
    const money = value => `${invoice.currency || 'USD'} ${Number(value || 0).toFixed(2)}`;
    const date = value => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set';
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const left = 55, right = 540, width = right - left;
    doc.font('Times-Bold').fontSize(25).fillColor('#1b1a24').text(business.name || 'Your business', left, 55);
    doc.font('Times-Roman').fontSize(10).fillColor('#5f5c6e').text([business.address, business.email, business.phone].filter(Boolean).join('\n'), left, 88, { width: 210 });
    doc.font('Times-Bold').fontSize(30).fillColor('#1b1a24').text('INVOICE', 370, 55, { width: 170, align: 'right' });
    doc.font('Times-Roman').fontSize(11).fillColor('#5f5c6e').text(`No. ${invoice.number}`, 370, 92, { width: 170, align: 'right' });
    doc.moveTo(left, 155).lineTo(right, 155).lineWidth(1.5).strokeColor('#1b1a24').stroke();
    doc.font('Times-Italic').fontSize(11).fillColor('#5f5c6e').text('Billed to', left, 180);
    doc.font('Times-Bold').fontSize(16).fillColor('#1b1a24').text(invoice.client_name || 'Client not selected', left, 198, { width: 220 });
    doc.font('Times-Roman').fontSize(10).fillColor('#5f5c6e').text([invoice.client_address, invoice.client_email].filter(Boolean).join('\n'), left, 222, { width: 220 });
    const meta = [['Invoice number', invoice.number], ['Date of issue', date(invoice.created_at?.slice(0, 10))], ['Payment due', date(invoice.due_date)], ['Currency', invoice.currency || 'USD']];
    meta.forEach(([label, value], index) => { const y = 180 + index * 21; doc.font('Times-Roman').fontSize(10).fillColor('#5f5c6e').text(label, 360, y); doc.fillColor('#1b1a24').text(value, 470, y, { width: 70, align: 'right' }); });
    doc.rect(left, 285, width, 42).strokeColor('#1b1a24').stroke();
    doc.font('Times-Bold').fontSize(12).fillColor('#1b1a24').text(`Amount due by ${date(invoice.due_date)}`, left + 14, 301); doc.fontSize(18).text(money(invoice.amount), 410, 298, { width: 115, align: 'right' });
    let y = 350;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#1b1a24').stroke();
    doc.font('Times-Bold').fontSize(10).text('No.', left, y + 10).text('Description', left + 35, y + 10).text('Qty', 330, y + 10, { width: 35, align: 'right' }).text('Unit price', 385, y + 10, { width: 65, align: 'right' }).text('Amount', 470, y + 10, { width: 70, align: 'right' });
    y += 32; doc.moveTo(left, y).lineTo(right, y).strokeColor('#1b1a24').stroke();
    doc.font('Times-Roman').fontSize(10);
    items.forEach((item, index) => { const amount = Number(item.quantity || 1) * Number(item.unitPrice || 0); doc.text(String(index + 1), left, y + 10).text(item.description || '—', left + 35, y + 10, { width: 250 }).text(String(item.quantity || 1), 330, y + 10, { width: 35, align: 'right' }).text(money(item.unitPrice), 385, y + 10, { width: 65, align: 'right' }).text(money(amount), 470, y + 10, { width: 70, align: 'right' }); y += 28; doc.moveTo(left, y).lineTo(right, y).strokeColor('#cfccd8').stroke(); });
    y += 18; doc.font('Times-Roman').text('Subtotal', 375, y, { width: 95 }).text(money(subtotal), 470, y, { width: 70, align: 'right' }); y += 28; doc.moveTo(375, y).lineTo(right, y).strokeColor('#1b1a24').stroke(); y += 16; doc.font('Times-Bold').fontSize(15).text('Total due', 375, y).text(money(invoice.amount), 470, y, { width: 70, align: 'right' });
    y += 55; doc.font('Times-Bold').fontSize(11).text('Payment terms and instructions', left, y); doc.font('Times-Roman').fontSize(10).fillColor('#5f5c6e').text(`Payment is due on ${date(invoice.due_date)}. Please quote invoice number ${invoice.number} with your payment.${invoice.payment_instructions ? `\n\n${invoice.payment_instructions}` : ''}`, left, y + 20, { width });
    doc.moveTo(left, 690).lineTo(right, 690).strokeColor('#cfccd8').stroke(); doc.font('Times-Italic').fontSize(10).text('Thank you for your business.', left, 704, { width, align: 'center' }); doc.font('Times-Roman').text(`${business.name || 'Your business'}${business.email ? `, ${business.email}` : ''}`, left, 720, { width, align: 'center' });
    doc.end();
  });
}
app.get("/api/invoices/:id/pdf", async (req, res) => {
  const invoice = decryptInvoice(db
    .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ? OR i.number = ?")
    .get(req.params.id, req.params.id));
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  const pdf = await createPdf(invoice);
  res
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    })
    .send(pdf);
});
app.post('/api/invoices/preview/pdf', async (req, res) => {
  const invoice = { number: req.body.number || 'PREVIEW', client_name: req.body.clientName || 'Client', client_email: req.body.clientEmail || '', client_address: req.body.clientAddress || '', description: req.body.description || 'Line item', lineItems: req.body.lineItems || [], business: req.body.business || null, amount: Number(req.body.amount || 0), currency: req.body.currency || 'USD', due_date: req.body.dueDate || null, created_at: new Date().toISOString(), payment_instructions: req.body.paymentInstructions || '' }
  const pdf = await createPdf(invoice)
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` }).send(pdf)
})
app.post("/api/invoices/:id/send", async (req, res) => {
  const invoice = decryptInvoice(db
    .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ? OR i.number = ?")
    .get(req.params.id, req.params.id));
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  const preferredProvider = db.prepare('SELECT preferred_email_provider FROM business_profile WHERE id = 1').get()?.preferred_email_provider;
  const emailIntegration = db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY CASE WHEN provider = ? THEN 0 WHEN provider = 'mailjet' THEN 1 WHEN provider = 'outlook' THEN 2 WHEN provider = 'gmail' THEN 3 ELSE 4 END, connected_at DESC LIMIT 1").get(preferredProvider || '');
  const savedMailConfig = emailIntegration ? JSON.parse(decryptValue(emailIntegration.config_json || '{}')) : {};
  const businessProfile = getBusinessProfile() || {};
  const businessName = businessProfile.name || process.env.BUSINESS_NAME || 'Your business';
  const templateMessage = (savedMailConfig.message || 'Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}.')
    .replaceAll('{{client}}', invoice.client_name || 'there')
    .replaceAll('{{invoice_number}}', invoice.number)
    .replaceAll('{{amount}}', `${invoice.currency || 'USD'} ${Number(invoice.amount || 0).toFixed(2)}`)
    .replaceAll('{{due_date}}', invoice.due_date || 'the due date');
  const templateSubject = (savedMailConfig.subject || '{{invoice_number}} from {{business_name}}')
    .replaceAll('{{client}}', invoice.client_name || 'there')
    .replaceAll('{{invoice_number}}', invoice.number)
    .replaceAll('{{amount}}', `${invoice.currency || 'USD'} ${Number(invoice.amount || 0).toFixed(2)}`)
    .replaceAll('{{due_date}}', invoice.due_date || 'the due date')
    .replaceAll('{{business_name}}', businessName);
  const smtpHost = savedMailConfig.host || process.env.SMTP_HOST;
  const smtpUser = savedMailConfig.emailAddress || process.env.SMTP_USER;
  const smtpPass = savedMailConfig.smtpPassword || process.env.SMTP_PASS;
  if (emailIntegration?.provider === 'outlook' && savedMailConfig.authType === 'oauth2') {
    try {
      const pdf = await createPdf(invoice);
      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${savedMailConfig.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { subject: templateSubject, body: { contentType: 'Text', content: templateMessage }, toRecipients: [{ emailAddress: { address: invoice.client_email } }], attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: `${invoice.number}.pdf`, contentType: 'application/pdf', contentBytes: pdf.toString('base64') }] }, saveToSentItems: true }) });
      if (!graphResponse.ok) { const graphError = await graphResponse.text(); return res.status(502).json({ error: `Microsoft Graph rejected the message: ${graphError}` }); }
      db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
      return res.json({ ok: true, message: `Invoice ${invoice.number} sent to ${invoice.client_email}.` });
    } catch (error) { return res.status(502).json({ error: error.message }); }
  }
  if (emailIntegration?.provider === 'mailjet' && savedMailConfig.authType === 'mailjet') {
    try {
      const pdf = await createPdf(invoice);
      const authorization = Buffer.from(`${savedMailConfig.apiKey}:${savedMailConfig.secretKey}`).toString('base64');
      const mailjetResponse = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: savedMailConfig.senderEmail, Name: savedMailConfig.fromName || savedMailConfig.senderName || businessName }, To: [{ Email: invoice.client_email, Name: invoice.client_name }], Subject: templateSubject, TextPart: templateMessage, Attachments: [{ ContentType: 'application/pdf', Filename: `${invoice.number}.pdf`, Base64Content: pdf.toString('base64') }] }] }) });
      if (!mailjetResponse.ok) { const mailjetError = await mailjetResponse.text(); return res.status(502).json({ error: `Mailjet rejected the message: ${mailjetError}` }); }
      db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
      return res.json({ ok: true, message: `Invoice ${invoice.number} sent to ${invoice.client_email}.` });
    } catch (error) { return res.status(502).json({ error: error.message }); }
  }
  if (!smtpHost || !smtpUser || !smtpPass)
    return res
      .status(400)
      .json({
        error:
          "Email is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and INVOICE_FROM to .env.",
      });
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(savedMailConfig.port || process.env.SMTP_PORT || 587),
      secure: savedMailConfig.secure ?? process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPass },
    });
    const pdf = await createPdf(invoice);
    await transporter.sendMail({
      from: process.env.INVOICE_FROM || smtpUser,
      to: invoice.client_email,
      subject: templateSubject,
      text: templateMessage,
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
    });
    db.prepare(
      "UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(invoice.id);
    res.json({
      ok: true,
      message: `Invoice ${invoice.number} sent to ${invoice.client_email}.`,
    });
  } catch (error) {
    res.status(500).json({ error: `Email failed: ${error.message}` });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(__dirname, "../dist/index.html")),
  );
}
app.listen(port, () =>
  console.log(`Invoice API running on http://localhost:${port}`),
);
