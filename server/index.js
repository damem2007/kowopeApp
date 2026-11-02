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
import { runScheduledBackup, runManualBusinessBackup } from './services/backup.js';
import { decryptFields, decryptValue, encryptValue, businessFields, invoiceFields, clientFields } from './security/crypto.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Logo data URLs are sent as JSON. Keep the API parser above the 512 KB
// binary-logo limit because base64 encoding increases the request size.
app.use(express.json({ limit: '1mb' }));
const db = initializeDatabase();
const databasePath = path.join(__dirname, '../data/invoices.db');
startBackupService(db, databasePath);
const getBusinessProfile = (organizationId = null, userId = null) => {
  const profile = organizationId
    ? db.prepare('SELECT * FROM business_profile WHERE organization_id = ? ORDER BY id LIMIT 1').get(organizationId)
    : userId
      ? db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id LIMIT 1').get(userId)
      : null;
  return decryptFields(profile, businessFields);
};
const getScopedBusinessProfile = user => {
  const profile = user.organization_id
    ? db.prepare(`
        SELECT * FROM business_profile
        WHERE organization_id = ? OR (organization_id IS NULL AND user_id = ?)
        ORDER BY CASE WHEN organization_id = ? THEN 0 ELSE 1 END, id
        LIMIT 1
      `).get(user.organization_id, user.id, user.organization_id)
    : db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id LIMIT 1').get(user.id)
  return decryptFields(profile, businessFields) || {}
};
const getScopedBusinessProfiles = user => {
  const rows = user.organization_id
    ? db.prepare(`
        SELECT * FROM business_profile
        WHERE organization_id = ? OR (organization_id IS NULL AND user_id = ?)
        ORDER BY CASE WHEN organization_id = ? THEN 0 ELSE 1 END, id
      `).all(user.organization_id, user.id, user.organization_id)
    : db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id').all(user.id)
  return rows.map(row => decryptFields(row, businessFields))
};
const getIntegrationConfig = integration => integration ? { ...integration, config_json: decryptValue(integration.config_json || '{}') } : integration;
const decryptInvoice = invoice => decryptFields(invoice, invoiceFields);
const decryptClient = client => decryptFields(client, clientFields);
const oauthStates = new Map();
const sessions = new Map();
const passwordResetTokens = new Map();
const sessionCookie = 'kowope_session';
const guestSessionCookie = 'kowope_guest_session';
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const verifyPassword = (password, storedHash) => { const [salt, hash] = storedHash.split(':'); const candidate = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex')); };
const readSession = req => { const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`)); if (!cookie) return null; const token = cookie.slice(sessionCookie.length + 1); const cachedUserId = sessions.get(token); if (cachedUserId) return cachedUserId; const session = db.prepare('SELECT user_id FROM auth_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP').get(token); if (session) sessions.set(token, session.user_id); return session?.user_id || null; };
const sessionUser = req => { const userId = readSession(req); return userId ? db.prepare('SELECT u.id, u.email, u.role, m.organization_id FROM users u LEFT JOIN organization_members m ON m.user_id = u.id WHERE u.id = ?').get(userId) : null; };
const requireOwner = (req, res, next) => { const user = sessionUser(req); if (!user) return res.status(401).json({ error: 'Authentication required.' }); if (user.role !== 'owner') return res.status(403).json({ error: 'Owner access required.' }); req.user = user; next(); };
const requireAuthenticated = (req, res, next) => { const user = sessionUser(req); if (!user) return res.status(401).json({ error: 'Authentication required.' }); req.user = user; next(); };
const guestSessionId = req => {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${guestSessionCookie}=`));
  if (cookie) return cookie.slice(guestSessionCookie.length + 1);
  const sessionId = crypto.randomUUID();
  req.res.setHeader('Set-Cookie', `${guestSessionCookie}=${sessionId}; SameSite=Lax; Path=/; Max-Age=86400`);
  return sessionId;
};
const logGuestEvent = (req, event) => db.prepare('INSERT INTO guest_analytics (id, account_key, session_id, event) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), 'guest', guestSessionId(req), event);
const getSecuritySettings = () => db.prepare('SELECT * FROM security_settings WHERE id = 1').get();
const templateTokens = {
  invoice: ['{{client}}', '{{business_name}}', '{{invoice_number}}', '{{amount}}', '{{due_date}}'],
  password_reset: ['{{reset_link}}'],
  email_verification: ['{{verification_link}}'],
};
const validateEmailTemplate = (templateKey, subject, body) => {
  const content = `${subject || ''}\n${body || ''}`;
  const missingTokens = (templateTokens[templateKey] || []).filter(token => !content.includes(token));
  return missingTokens.length ? `Template must include: ${missingTokens.join(', ')}` : null;
};
const renderEmailTemplate = (template, values) => String(template || '').replace(/\{\{([a-z_]+)\}\}/g, (_match, token) => values[token] ?? '');
const platformEmailTemplate = templateKey => db.prepare('SELECT * FROM platform_email_templates WHERE template_key = ?').get(templateKey);
const userEmailTemplate = (userId, templateKey) => db.prepare('SELECT * FROM email_templates WHERE user_id = ? AND template_key = ?').get(userId, templateKey);
const passwordPolicyError = password => { const settings = getSecuritySettings(); if (!settings?.configured_at) return null; if (password.length < settings.password_min_length) return `Password must be at least ${settings.password_min_length} characters.`; if (settings.require_uppercase && !/[A-Z]/.test(password)) return 'Password must include an uppercase letter.'; if (settings.require_lowercase && !/[a-z]/.test(password)) return 'Password must include a lowercase letter.'; if (settings.require_number && !/[0-9]/.test(password)) return 'Password must include a number.'; if (settings.require_symbol && !/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol.'; return null; };
function ensureUserOrganizations() {
  const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get()
  if (!owner) return
  let organization = db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get()
  if (!organization) {
    const result = db.prepare('INSERT INTO organizations (name) VALUES (?)').run('Default organization')
    organization = { id: result.lastInsertRowid }
  }
  db.prepare("INSERT OR IGNORE INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'owner')").run(organization.id, owner.id)
  db.prepare('UPDATE organization_members SET membership_role = ? WHERE organization_id = ? AND user_id = ?').run('owner', organization.id, owner.id)
  for (const table of ['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'integrations']) {
    db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`).run(organization.id)
  }
  db.prepare('UPDATE currencies SET organization_id = ? WHERE user_id IS NOT NULL AND organization_id IS NULL').run(organization.id)
  db.prepare('UPDATE clients SET created_by_user_id = ? WHERE created_by_user_id IS NULL').run(owner.id)
}

// Bootstrap only the platform owner from environment configuration. Ordinary
// users are always created through the signup flow.
if (!db.prepare('SELECT id FROM users LIMIT 1').get() && process.env.KOWOPE_OWNER_EMAIL && process.env.KOWOPE_OWNER_PASSWORD) {
  db.prepare('INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    crypto.randomUUID(),
    process.env.KOWOPE_OWNER_EMAIL.trim().toLowerCase(),
    hashPassword(process.env.KOWOPE_OWNER_PASSWORD),
    'owner',
  )
}

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
const hasUsers = () => Boolean(db.prepare('SELECT id FROM users LIMIT 1').get());
const ownerSetupRequired = () => {
  const ownerExists = Boolean(db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get())
  // A missing business email means the existing owner still needs to finish
  // setup; it must not create a second platform owner or show owner signup.
  return !ownerExists
}
const signupIsAllowed = () => ownerSetupRequired() || Boolean(db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get()?.allow_user_signup);
app.get('/api/auth/status', (_req, res) => { const user = sessionUser(_req); res.json({ authenticated: Boolean(user), allowSignup: signupIsAllowed(), ownerSetupRequired: ownerSetupRequired(), role: user?.role || null }); });
function getPublicAppUrl(request) {
  const configuredUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  if (configuredUrl && (process.env.NODE_ENV !== 'production' || !configuredUrl.includes('localhost'))) return configuredUrl
  const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '')
  if (renderUrl) return renderUrl
  if (process.env.NODE_ENV === 'production') {
    const forwardedProtocol = String(request?.get('x-forwarded-proto') || 'https').split(',')[0].trim()
    const forwardedHost = String(request?.get('x-forwarded-host') || request?.get('host') || '').split(',')[0].trim()
    if (forwardedHost) return `${forwardedProtocol}://${forwardedHost}`
    throw new Error('Set PUBLIC_APP_URL or RENDER_EXTERNAL_URL for production email links.')
  }
  return 'http://localhost:5173'
}
async function sendVerificationEmail(email, verificationUrl) {
  const subject = 'Verify your Kowope account'
  const message = `Verify your Kowope account by opening this link:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`
  const connectedMailjet = db.prepare("SELECT config_json FROM integrations WHERE provider = 'mailjet' AND status = 'connected' ORDER BY connected_at DESC LIMIT 1").get()
  const mailjetConfig = connectedMailjet ? JSON.parse(decryptValue(connectedMailjet.config_json || '{}')) : {}
  const mailjetKey = mailjetConfig.apiKey || process.env.MAILJET_API_KEY
  const mailjetSecret = mailjetConfig.secretKey || process.env.MAILJET_SECRET_KEY
  const senderEmail = mailjetConfig.senderEmail || process.env.INVOICE_FROM || process.env.SMTP_USER
  if (!senderEmail) throw new Error('Verification email is not configured. Connect Mailjet or set INVOICE_FROM and SMTP credentials.')
  if (mailjetKey && mailjetSecret) {
    const authorization = Buffer.from(`${mailjetKey}:${mailjetSecret}`).toString('base64')
    const response = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: senderEmail, Name: mailjetConfig.fromName || 'Kowope' }, To: [{ Email: email }], Subject: subject, TextPart: message }] }) })
    if (!response.ok) throw new Error(`Mailjet rejected the verification email (${response.status}).`)
    return
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('Verification email is not configured. Set Mailjet credentials or SMTP_HOST, SMTP_USER, and SMTP_PASS.')
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  await transporter.sendMail({ from: process.env.INVOICE_FROM || process.env.SMTP_USER, to: email, subject, text: message })
}
async function createAndSendVerification(user, request) {
  const rawToken = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(rawToken), user.id, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
  await sendVerificationEmail(user.email, `${getPublicAppUrl(request)}/?verify=${rawToken}`)
}
app.post('/api/auth/signup', async (req, res) => {
  const isOwnerSetup = ownerSetupRequired()
  if (!isOwnerSetup && !signupIsAllowed()) return res.status(403).json({ error: 'New user accounts are disabled by the owner.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const policyError = passwordPolicyError(password);
  if (!/^\S+@\S+\.\S+$/.test(email) || policyError) return res.status(400).json({ error: policyError || 'Use a valid email.' });
  let createdUserId = null
  let firstOwner = false
  let accountPersisted = false
  try {
    firstOwner = isOwnerSetup
    createdUserId = crypto.randomUUID()
    const emailVerifiedAt = firstOwner ? new Date().toISOString() : null

    // Keep account creation atomic. In particular, a failed email provider must
    // not leave an unusable user row that blocks first-owner setup or retries.
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, ?)').run(createdUserId, email, hashPassword(password), firstOwner ? 'owner' : 'user', emailVerifiedAt)
      if (firstOwner) {
        db.prepare('UPDATE business_profile SET user_id = ? WHERE id = 1 AND user_id IS NULL').run(createdUserId)
      } else {
        db.prepare('INSERT INTO business_profile (name, user_id) VALUES (?, ?)').run('', createdUserId)
      }
      if (firstOwner) db.prepare('UPDATE business_profile SET allow_user_signup = 0 WHERE id = 1').run()
    })()
    accountPersisted = true

    const createdUser = { id: createdUserId, email }
    if (!firstOwner) await createAndSendVerification(createdUser, req)
    res.status(201).json(firstOwner
      ? { verificationRequired: false, ownerCreated: true, message: 'Platform owner account created. You can sign in without email verification.' }
      : { verificationRequired: true, message: 'Account created. Check your email to verify your account before signing in.' })
  }
  catch (error) {
    // Owner creation must be fully atomic so a failed first setup cannot lock
    // the platform. Ordinary users remain as unverified accounts when mail
    // delivery fails, allowing the owner to resend verification later.
    if (createdUserId && firstOwner) {
      try {
        db.transaction(() => {
          db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(createdUserId)
          db.prepare('DELETE FROM organization_members WHERE user_id = ?').run(createdUserId)
          db.prepare('DELETE FROM users WHERE id = ?').run(createdUserId)
        })()
      } catch (cleanupError) {
        console.error('Signup rollback failed:', cleanupError)
      }
    }
    const duplicate = error.message.includes('UNIQUE')
    if (!duplicate && !firstOwner && accountPersisted && createdUserId) {
      return res.status(502).json({
        accountCreated: true,
        verificationRequired: true,
        userId: createdUserId,
        error: `Account created, but the verification email could not be sent: ${error.message}`,
      })
    }
    res.status(duplicate ? 409 : 502).json({ error: duplicate ? 'An account with that email already exists.' : error.message })
  }
});
app.post('/api/auth/resend-verification', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const user = db.prepare('SELECT id, email, email_verified_at FROM users WHERE email = ?').get(email)
  if (!user || user.email_verified_at) return res.json({ ok: true, message: 'If the account needs verification, a new link has been sent.' })
  try {
    db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id)
    await createAndSendVerification(user, req)
    res.json({ ok: true, message: 'A new verification link has been sent. It expires in 24 hours.' })
  } catch (error) {
    console.error('Verification email failed:', error)
    res.status(502).json({ error: error.message })
  }
})
app.get('/api/platform/users', requireOwner, (_req, res) => {
  res.json(db.prepare("SELECT id, email, role, email_verified_at, suspended_at FROM users WHERE role != 'owner' ORDER BY email").all())
})
app.get('/api/organization', requireAuthenticated, (req, res) => {
  if (!req.user.organization_id) return res.json({ organization: null, members: [], membership_role: null })
  const organization = db.prepare('SELECT id, name, created_at FROM organizations WHERE id = ?').get(req.user.organization_id)
  const members = db.prepare('SELECT u.id, u.email, u.role, m.membership_role, m.created_at FROM organization_members m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? ORDER BY m.created_at').all(req.user.organization_id)
  const membership = db.prepare('SELECT membership_role FROM organization_members WHERE organization_id = ? AND user_id = ?').get(req.user.organization_id, req.user.id)
  res.json({ organization, members, membership_role: membership?.membership_role || null })
})
app.post('/api/organization', requireAuthenticated, (req, res) => {
  if (req.user.organization_id) return res.status(409).json({ error: 'You already belong to an organization.' })
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Enter an organization name.' })
  const createOrganization = db.transaction(() => {
    const organizationResult = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(name)
    db.prepare("INSERT INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'owner')").run(organizationResult.lastInsertRowid, req.user.id)
    return db.prepare('SELECT id, name, created_at FROM organizations WHERE id = ?').get(organizationResult.lastInsertRowid)
  })
  const organization = createOrganization()
  res.status(201).json({ organization, members: [{ id: req.user.id, email: req.user.email, role: req.user.role, membership_role: 'owner' }], membership_role: 'owner' })
})
app.post('/api/organization/members', requireAuthenticated, (req, res) => {
  if (req.user.membership_role !== 'owner' && db.prepare('SELECT membership_role FROM organization_members WHERE organization_id = ? AND user_id = ?').get(req.user.organization_id, req.user.id)?.membership_role !== 'owner') return res.status(403).json({ error: 'Only the organization owner can invite members.' })
  const email = String(req.body.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid user email.' })
  const invitedUser = db.prepare("SELECT id, email, role FROM users WHERE email = ? AND role != 'owner'").get(email)
  if (!invitedUser) return res.status(404).json({ error: 'The user must create and verify a Kowope account before joining this organization.' })
  try {
    db.prepare("INSERT INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'member')").run(req.user.organization_id, invitedUser.id)
    res.status(201).json({ ok: true, message: `${email} added to the organization.` })
  } catch (error) {
    res.status(error.message.includes('UNIQUE') ? 409 : 500).json({ error: error.message.includes('UNIQUE') ? 'This user already belongs to an organization.' : error.message })
  }
})
app.post('/api/platform/users/:userId/resend-verification', requireOwner, async (req, res) => {
  const user = db.prepare("SELECT id, email, email_verified_at FROM users WHERE id = ? AND role != 'owner'").get(req.params.userId)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  if (user.email_verified_at) return res.status(400).json({ error: 'This user is already verified.' })
  try {
    db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id)
    await createAndSendVerification(user)
    res.json({ ok: true, message: `A new verification link was sent to ${user.email}.` })
  } catch (error) {
    console.error('Owner resend verification failed:', error)
    res.status(502).json({ error: error.message })
  }
})
app.patch('/api/platform/users/:userId/suspension', requireOwner, (req, res) => {
  const user = db.prepare("SELECT id, email, role, suspended_at FROM users WHERE id = ? AND role != 'owner'").get(req.params.userId)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  const suspended = Boolean(req.body.suspended)
  db.prepare('UPDATE users SET suspended_at = ? WHERE id = ?').run(suspended ? new Date().toISOString() : null, user.id)
  res.json({ ok: true, suspended, message: suspended ? `${user.email} suspended.` : `${user.email} reactivated.` })
})
app.post('/api/auth/verify-email', (req, res) => {
  const tokenHash = hashToken(String(req.body.token || ''))
  const verification = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL').get(tokenHash)
  if (!verification || new Date(verification.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'This verification link is invalid or expired.' })
  db.transaction(() => {
    db.prepare('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(verification.user_id)
    db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash)
  })()
  res.json({ ok: true, message: 'Email verified. You can now sign in.' })
})
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  if (user.suspended_at) return res.status(403).json({ error: 'This account has been suspended. Contact the platform owner.' });
  if (user.role !== 'owner' && !user.email_verified_at) return res.status(403).json({ error: 'Verify your email address before signing in.' });
  const token = crypto.randomBytes(32).toString('hex'); const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt); sessions.set(token, user.id);
  const firstLogin = user.role === 'owner' && !user.last_login_at;
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  res.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/`); res.json({ authenticated: true, firstLogin });
});
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const genericResponse = { message: `If an account exists for that email, a reset link has been sent. The link expires in ${getSecuritySettings().reset_token_minutes} minutes.` };
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) return res.json(genericResponse);
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const securitySettings = getSecuritySettings();
    passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + securitySettings.reset_token_minutes * 60 * 1000 });
    const resetUrl = `${getPublicAppUrl(req)}/?reset=${token}`;
    const integration = db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY connected_at DESC LIMIT 1").get();
    const config = integration ? JSON.parse(decryptValue(integration.config_json || '{}')) : {};
    const business = getBusinessProfile(db.prepare('SELECT organization_id FROM organization_members WHERE user_id = ?').get(user.id)?.organization_id) || {};
    const subject = 'Reset your Kowope password';
    const message = `Use this link to reset your Kowope password:\n\n${resetUrl}\n\nThis link expires in ${securitySettings.reset_token_minutes} minutes. If you did not request this, you can ignore this email.`;
    if (integration?.provider === 'mailjet' && config.apiKey && config.secretKey) {
      const authorization = Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64');
      const response = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: config.senderEmail || business.email, Name: config.fromName || business.name || 'Kowope' }, To: [{ Email: user.email }], Subject: subject, TextPart: message }] }) });
      if (!response.ok) throw new Error('Mail provider rejected the reset email.');
    } else {
      const transporter = nodemailer.createTransport({ host: config.host || process.env.SMTP_HOST, port: Number(config.port || process.env.SMTP_PORT || 587), secure: config.secure ?? process.env.SMTP_SECURE === 'true', auth: { user: config.emailAddress || process.env.SMTP_USER, pass: config.smtpPassword || process.env.SMTP_PASS } });
      await transporter.sendMail({ from: process.env.INVOICE_FROM || config.emailAddress || process.env.SMTP_USER, to: user.email, subject, text: message });
    }
    return res.json(genericResponse);
  } catch (error) {
    passwordResetTokens.delete([...passwordResetTokens.keys()].find(token => passwordResetTokens.get(token)?.userId === user.id));
    return res.status(502).json({ error: `Unable to send reset email: ${error.message}` });
  }
});
app.post('/api/auth/reset-password', (req, res) => {
  const token = String(req.body.token || '');
  const newPassword = String(req.body.newPassword || '');
  const reset = passwordResetTokens.get(token);
  if (!reset || reset.expiresAt < Date.now()) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return res.status(400).json({ error: policyError });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), reset.userId);
  passwordResetTokens.delete(token);
  res.json({ ok: true });
});
app.post('/api/auth/password', (req, res) => {
  const userId = readSession(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return res.status(400).json({ error: policyError });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  res.json({ ok: true });
});
app.get('/api/platform/user-management', requireOwner, (_req, res) => { res.json({ allowSignup: Boolean(db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get()?.allow_user_signup) }); });
app.put('/api/platform/user-management', requireOwner, (req, res) => { db.prepare('UPDATE business_profile SET allow_user_signup = ? WHERE id = 1').run(req.body.allowSignup ? 1 : 0); res.json({ allowSignup: Boolean(req.body.allowSignup) }); });
app.get('/api/account/security', requireOwner, (_req, res) => res.json({ backup: db.prepare('SELECT * FROM backup_settings WHERE id = 1').get(), password: getSecuritySettings() }));
app.put('/api/account/security', requireOwner, (req, res) => {
  const backup = req.body.backup || {}, password = req.body.password || {};
  const intervalDays = Math.min(365, Math.max(1, Number(backup.intervalDays) || 14));
  const resetTokenMinutes = Math.min(1440, Math.max(5, Number(password.resetTokenMinutes) || 15));
  const passwordMinLength = Math.min(128, Math.max(8, Number(password.passwordMinLength) || 12));
  const recipientEmail = String(backup.recipientEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) return res.status(400).json({ error: 'Enter a valid backup email.' });
  const nextRunAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE backup_settings SET recipient_email = ?, interval_days = ?, enabled = ?, next_run_at = ? WHERE id = 1').run(recipientEmail, intervalDays, backup.enabled === false ? 0 : 1, nextRunAt);
  db.prepare('UPDATE security_settings SET reset_token_minutes = ?, password_min_length = ?, require_uppercase = ?, require_lowercase = ?, require_number = ?, require_symbol = ?, configured_at = CURRENT_TIMESTAMP WHERE id = 1').run(resetTokenMinutes, passwordMinLength, password.requireUppercase ? 1 : 0, password.requireLowercase ? 1 : 0, password.requireNumber ? 1 : 0, password.requireSymbol ? 1 : 0);
  res.json({ backup: db.prepare('SELECT * FROM backup_settings WHERE id = 1').get(), password: getSecuritySettings() });
});
app.get('/api/email-templates', requireAuthenticated, (req, res) => {
  const platformTemplate = platformEmailTemplate('invoice');
  const personalTemplate = userEmailTemplate(req.user.id, 'invoice');
  res.json({
    templateKey: 'invoice',
    subject: personalTemplate?.subject || platformTemplate?.subject || '{{invoice_number}} from {{business_name}}',
    body: personalTemplate?.body || platformTemplate?.body || 'Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}.',
    customized: Boolean(personalTemplate),
    availableTokens: templateTokens.invoice,
  });
});
app.put('/api/email-templates/:templateKey', requireAuthenticated, (req, res) => {
  if (req.params.templateKey !== 'invoice') return res.status(400).json({ error: 'Only invoice templates can be customized by a user.' });
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  const validationError = validateEmailTemplate('invoice', subject, body);
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
  if (validationError) return res.status(400).json({ error: validationError });
  db.prepare(`INSERT INTO email_templates (id, user_id, template_key, subject, body, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, template_key) DO UPDATE SET subject = excluded.subject, body = excluded.body, updated_at = CURRENT_TIMESTAMP`).run(crypto.randomUUID(), req.user.id, 'invoice', subject, body);
  res.json({ ok: true, ...userEmailTemplate(req.user.id, 'invoice'), availableTokens: templateTokens.invoice });
});
app.post('/api/email-templates/:templateKey/preview', requireAuthenticated, (req, res) => {
  if (req.params.templateKey !== 'invoice') return res.status(400).json({ error: 'Unsupported template.' });
  const subject = String(req.body.subject || '');
  const body = String(req.body.body || '');
  const values = { client: 'Example client', business_name: 'Your business', invoice_number: 'INV-2026-0001', amount: 'USD 250.00', due_date: 'Dec 15, 2026' };
  res.json({ subject: renderEmailTemplate(subject, values), body: renderEmailTemplate(body, values) });
});
app.get('/api/platform/email-templates', requireOwner, (_req, res) => res.json(db.prepare('SELECT template_key AS templateKey, subject, body, updated_at AS updatedAt FROM platform_email_templates ORDER BY template_key').all().map(template => ({ ...template, availableTokens: templateTokens[template.templateKey] || [] }))));
app.put('/api/platform/email-templates/:templateKey', requireOwner, (req, res) => {
  const templateKey = String(req.params.templateKey || '');
  if (!templateTokens[templateKey]) return res.status(400).json({ error: 'Unsupported platform template.' });
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  const validationError = validateEmailTemplate(templateKey, subject, body);
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
  if (validationError) return res.status(400).json({ error: validationError });
  db.prepare('UPDATE platform_email_templates SET subject = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE template_key = ?').run(subject, body, templateKey);
  res.json({ ok: true, template: platformEmailTemplate(templateKey), availableTokens: templateTokens[templateKey] });
});
app.post('/api/platform/email-templates/:templateKey/preview', requireOwner, (req, res) => {
  const templateKey = String(req.params.templateKey || '');
  const values = { client: 'Example client', business_name: 'Your business', invoice_number: 'INV-2026-0001', amount: 'USD 250.00', due_date: 'Dec 15, 2026', reset_link: 'https://kowope.example/reset?token=example', verification_link: 'https://kowope.example/verify?token=example' };
  const template = { subject: String(req.body.subject ?? platformEmailTemplate(templateKey)?.subject ?? ''), body: String(req.body.body ?? platformEmailTemplate(templateKey)?.body ?? '') };
  if (!templateTokens[templateKey]) return res.status(400).json({ error: 'Unsupported platform template.' });
  res.json({ subject: renderEmailTemplate(template.subject, values), body: renderEmailTemplate(template.body, values) });
});
app.post('/api/auth/logout', (req, res) => { const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`)); if (cookie) { const token = cookie.slice(sessionCookie.length + 1); sessions.delete(token); db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token); } res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); res.status(204).end(); });
app.post('/api/guest/session', (req, res) => { const sessionId = guestSessionId(req); logGuestEvent(req, 'session_started'); res.json({ ok: true, sessionId }); });
const guestInvoicePayload = body => ({
  number: String(body.number || 'GUEST-INVOICE'),
  client_name: String(body.clientName || 'Client'),
  client_email: String(body.clientEmail || ''),
  client_address: String(body.clientAddress || ''),
  description: String(body.description || 'Line item'),
  lineItems: Array.isArray(body.lineItems) ? body.lineItems : [],
  business: body.business ? { ...body.business, logo_data_url: String(body.business.logoDataUrl || body.business.logo_data_url || '') } : null,
  amount: Number(body.amount || 0),
  currency: String(body.currency || 'USD'),
  due_date: body.dueDate || null,
  created_at: new Date().toISOString(),
  payment_instructions: String(body.paymentInstructions || ''),
});
app.post('/api/guest/invoices/preview/pdf', async (req, res) => { logGuestEvent(req, 'invoice_created'); const pdf = await createPdf(guestInvoicePayload(req.body)); logGuestEvent(req, 'invoice_generated'); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="guest-invoice.pdf"' }).send(pdf); });
app.post('/api/guest/invoices/download/pdf', async (req, res) => { const invoice = guestInvoicePayload(req.body); const pdf = await createPdf(invoice); logGuestEvent(req, 'invoice_downloaded'); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` }).send(pdf); });
app.post('/api/guest/analytics', (req, res) => { const allowedEvents = new Set(['invoice_created', 'invoice_generated', 'invoice_downloaded']); const event = String(req.body.event || ''); if (!allowedEvents.has(event)) return res.status(400).json({ error: 'Unsupported guest event.' }); logGuestEvent(req, event); res.status(204).end(); });
app.use('/api', (req, res, next) => { if (req.path.startsWith('/auth/') || req.path.startsWith('/guest/')) return next(); const user = sessionUser(req); if (!user) return res.status(401).json({ error: 'Authentication required.' }); req.user = user; next(); });
app.post('/api/backups/run', async (_req, res) => { try { const result = await runManualBusinessBackup(db, databasePath); res.json(result); } catch (error) { res.status(502).json({ error: error.message }); } });
app.get('/api/integrations', (req, res) => {
  const integrations = db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations ORDER BY provider').all()
  res.json(integrations.map(integration => {
    const publicIntegration = { ...getIntegrationConfig(integration), connected: String(integration.status || '').toLowerCase() === 'connected' }
    if (req.user.role !== 'owner') {
      return { ...publicIntegration, config_json: null }
    }
    return publicIntegration
  }))
})
app.put('/api/integrations/:provider', requireOwner, (req, res) => {
  const { status = 'connected', accountLabel = '', config = {} } = req.body
  db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error, organization_id, user_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL) ON CONFLICT(provider) DO UPDATE SET status=excluded.status, account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL, organization_id=NULL, user_id=NULL`).run(req.params.provider, status, accountLabel, encryptValue(JSON.stringify(config)))
  res.json(getIntegrationConfig(db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations WHERE provider = ?').get(req.params.provider)))
})
app.delete('/api/integrations/:provider', requireOwner, (req, res) => { db.prepare('DELETE FROM integrations WHERE provider = ?').run(req.params.provider); res.status(204).end() })
app.get('/api/integrations/outlook/oauth/start', requireOwner, (req, res) => {
  if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_REDIRECT_URI) return res.status(400).send('Configure OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI in .env first.');
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, response_type: 'code', redirect_uri: process.env.OUTLOOK_REDIRECT_URI, response_mode: 'query', scope: 'openid profile email offline_access Mail.Send', state });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});
app.get('/api/integrations/outlook/oauth/callback', requireOwner, async (req, res) => {
  const expiresAt = oauthStates.get(req.query.state);
  oauthStates.delete(req.query.state);
  if (!expiresAt || expiresAt < Date.now() || !req.query.code) return res.status(400).send('Invalid or expired Microsoft OAuth request.');
  try {
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, client_secret: process.env.OUTLOOK_CLIENT_SECRET || '', grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.OUTLOOK_REDIRECT_URI, scope: 'openid profile email offline_access Mail.Send' }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(400).send(token.error_description || 'Microsoft authorization failed.');
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json();
    db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error, organization_id, user_id) VALUES ('outlook', 'connected', ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL) ON CONFLICT(provider) DO UPDATE SET status='connected', account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL, organization_id=NULL, user_id=NULL`).run(profile.mail || profile.userPrincipalName || 'Microsoft Outlook', encryptValue(JSON.stringify({ authType: 'oauth2', accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, emailAddress: profile.mail || profile.userPrincipalName || '' })));
    res.redirect('/?outlook=connected');
  } catch (error) { res.status(500).send(error.message); }
});
app.get('/api/recurring', (req, res) => res.json(db.prepare(req.user.organization_id ? 'SELECT s.*, c.name AS client_name, p.amount AS current_amount FROM recurring_schedules s JOIN clients c ON c.id = s.client_id LEFT JOIN schedule_price_history p ON p.schedule_id = s.id AND p.id = (SELECT id FROM schedule_price_history WHERE schedule_id = s.id ORDER BY effective_from DESC, id DESC LIMIT 1) WHERE s.organization_id = ? ORDER BY s.next_run_at' : 'SELECT s.*, c.name AS client_name, p.amount AS current_amount FROM recurring_schedules s JOIN clients c ON c.id = s.client_id LEFT JOIN schedule_price_history p ON p.schedule_id = s.id AND p.id = (SELECT id FROM schedule_price_history WHERE schedule_id = s.id ORDER BY effective_from DESC, id DESC LIMIT 1) WHERE s.organization_id IS NULL AND s.user_id = ? ORDER BY s.next_run_at').all(req.user.organization_id || req.user.id).map(schedule => ({ ...schedule, client_name: decryptValue(schedule.client_name), description: decryptValue(schedule.description) }))));
app.post('/api/recurring', (req, res) => {
  const { clientId, description, amount, frequency, nextRunAt, currency = 'USD', autoSend = 0, sourceInvoiceId = null } = req.body;
  if (!clientId || !description || !(Number(amount) > 0) || !frequency || !nextRunAt) return res.status(400).json({ error: 'Client, description, amount, frequency, and next invoice date are required.' });
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND organization_id = ?').get(clientId, req.user.organization_id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const createSchedule = db.transaction(() => {
    const result = db.prepare('INSERT INTO recurring_schedules (client_id, description, frequency, currency_code, next_run_at, auto_send, source_invoice_id, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(clientId, encryptValue(description), frequency, currency, nextRunAt, autoSend ? 1 : 0, sourceInvoiceId, req.user.organization_id);
    db.prepare('INSERT INTO schedule_price_history (schedule_id, amount, effective_from) VALUES (?, ?, ?)').run(result.lastInsertRowid, Number(amount), nextRunAt);
    return result;
  });
  const result = createSchedule();
  res.status(201).json({ ...db.prepare('SELECT * FROM recurring_schedules WHERE id = ? AND organization_id = ?').get(result.lastInsertRowid, req.user.organization_id), description });
});
app.patch('/api/recurring/:id', (req, res) => {
  const { status, nextRunAt } = req.body;
  if (status && !['active', 'paused'].includes(status)) return res.status(400).json({ error: 'Invalid recurring schedule status.' });
  const schedule = db.prepare('SELECT * FROM recurring_schedules WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found.' });
  db.prepare('UPDATE recurring_schedules SET status = COALESCE(?, status), next_run_at = COALESCE(?, next_run_at) WHERE id = ?').run(status || null, nextRunAt || null, req.params.id);
  res.json(db.prepare('SELECT * FROM recurring_schedules WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id));
});
app.post('/api/recurring/run', (_req, res) => res.json({ created: runDueSchedules(db) }));
app.post('/api/recurring/:id/price', (req, res) => { const { amount, effectiveFrom, priceChangeNote = false } = req.body; if (!(Number(amount) > 0) || !effectiveFrom) return res.status(400).json({ error: 'Enter a valid amount and effective date.' }); const schedule = db.prepare('SELECT id FROM recurring_schedules WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id); if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found.' }); const result = db.prepare('INSERT INTO schedule_price_history (schedule_id, amount, effective_from, price_change_note) VALUES (?, ?, ?, ?)').run(req.params.id, Number(amount), effectiveFrom, priceChangeNote ? 1 : 0); res.status(201).json(db.prepare('SELECT * FROM schedule_price_history WHERE id = ?').get(result.lastInsertRowid)); });

// Render Cron authenticates as a service with the shared CRON_SECRET rather
// than using an interactive Kowope session.
app.post('/internal/cron/run', async (req, res) => {
  const authorizationHeader = req.get('authorization')
  const expectedAuthorization = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null

  if (!expectedAuthorization || authorizationHeader !== expectedAuthorization) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const recurringResult = runDueSchedules(db)
    const backupResult = await runScheduledBackup(db, databasePath)
    return res.json({ ok: true, recurring: recurringResult, backup: backupResult })
  } catch (error) {
    console.error('Cron execution failed:', error)
    return res.status(500).json({ error: 'Cron execution failed' })
  }
})

app.get("/api/business-profile", (req, res) => res.json(getScopedBusinessProfile(req.user)));
app.get('/api/business-profiles', (req, res) => res.json(getScopedBusinessProfiles(req.user)));
app.get('/api/currencies', (req, res) => res.json(db.prepare('SELECT code, name, sign FROM currencies WHERE user_id IS NULL OR user_id = ? ORDER BY code').all(req.user.id)));
app.post('/api/currencies', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  const sign = String(req.body.sign || '').trim();
  if (!/^[A-Z]{3}$/.test(code) || !name || !sign) return res.status(400).json({ error: 'Currency code, name, and sign are required.' });
  try { db.prepare('INSERT INTO currencies (code, user_id, organization_id, name, sign) VALUES (?, ?, ?, ?, ?)').run(code, req.user.id, req.user.organization_id, name, sign); res.status(201).json(db.prepare('SELECT code, name, sign FROM currencies WHERE code = ? AND user_id = ?').get(code, req.user.id)); }
  catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? `${code} is already in your currency list.` : error.message }); }
});
app.delete('/api/currencies/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (code === 'USD') return res.status(400).json({ error: 'USD cannot be removed.' });
  const defaultCurrency = getScopedBusinessProfile(req.user).default_currency;
  if (code === defaultCurrency) return res.status(400).json({ error: 'Choose another default currency first.' });
  if (['USD', 'CAD', 'EUR'].includes(code)) return res.status(400).json({ error: 'System currencies cannot be removed.' });
  db.prepare('DELETE FROM currencies WHERE code = ? AND user_id = ?').run(code, req.user.id); res.status(204).end();
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
    logoDataUrl,
    profileId = null,
  } = req.body;
  const logoWasProvided = Object.prototype.hasOwnProperty.call(req.body, 'logoDataUrl');
  const logoValue = logoDataUrl === null ? null : (logoWasProvided ? String(logoDataUrl || '') : null);
  if (logoValue !== null && Buffer.byteLength(logoValue, 'utf8') > 512 * 1024) return res.status(400).json({ error: 'Logo must be 512 KB or smaller.' });
  try {
    const defaultScopeColumn = req.user.organization_id ? 'organization_id' : 'user_id';
    const defaultScopeValue = req.user.organization_id || req.user.id;
    const existing = profileId
      ? db.prepare(`
          SELECT id, organization_id, user_id
          FROM business_profile
          WHERE id = ?
            AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))
        `).get(profileId, req.user.organization_id || null, req.user.id)
      : null;
    const scopeColumn = existing ? (existing.organization_id ? 'organization_id' : 'user_id') : defaultScopeColumn;
    const scopeValue = existing ? (existing.organization_id || existing.user_id) : defaultScopeValue;
    const values = [encryptValue(name), encryptValue(address), encryptValue(email), encryptValue(phone), encryptValue(paymentInstructions), invoicePrefix, Math.min(10, Math.max(1, Number(invoiceNumberPadding) || 4)), invoiceNumberFormat || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider, defaultCurrency];
    let savedProfileId = existing?.id;
    if (savedProfileId) {
      const logoUpdate = logoWasProvided ? ', logo_data_url = ?' : '';
      const updateValues = logoWasProvided ? [...values, logoValue, savedProfileId, scopeValue] : [...values, savedProfileId, scopeValue];
      db.prepare(`UPDATE business_profile SET name = ?, address = ?, email = ?, phone = ?, payment_instructions = ?, invoice_prefix = ?, invoice_number_padding = ?, invoice_number_format = ?, preferred_email_provider = ?, default_currency = ?${logoUpdate} WHERE id = ? AND ${scopeColumn} = ?`).run(...updateValues);
    } else {
      const result = db.prepare(`INSERT INTO business_profile (organization_id, user_id, name, address, email, phone, payment_instructions, invoice_prefix, invoice_number_padding, invoice_number_format, preferred_email_provider, default_currency, logo_data_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.organization_id || null, req.user.organization_id ? null : req.user.id, ...values, logoWasProvided ? logoValue : null);
      savedProfileId = result.lastInsertRowid;
    }
    const savedProfile = db.prepare('SELECT * FROM business_profile WHERE id = ?').get(savedProfileId);
    res.json(decryptFields(savedProfile, businessFields));
  } catch (error) {
    console.error('Business profile update failed:', error);
    res.status(500).json({ error: 'Unable to save the business profile.' });
  }
});
app.get("/api/clients", (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT c.*, COUNT(i.id) AS invoice_count, COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount ELSE 0 END), 0) AS outstanding FROM clients c LEFT JOIN invoices i ON i.client_id = c.id WHERE c.created_by_user_id = ? GROUP BY c.id ORDER BY c.name`,
      )
      .all(req.user.id).map(decryptClient),
  ),
);
app.get("/api/clients/:id/invoices", (req, res) =>
  res.json(
    db
      .prepare("SELECT i.* FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.client_id = ? AND c.created_by_user_id = ? ORDER BY i.id DESC")
      .all(req.params.id, req.user.id).map(decryptInvoice),
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
    const clientId = crypto.randomUUID();
    const result = db
      .prepare(
        "INSERT INTO clients (id, name, email, company, address, phone, notes, organization_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(clientId, encryptValue(name), encryptValue(email), encryptValue(company), encryptValue(address), encryptValue(phone), encryptValue(notes), req.user.organization_id, req.user.id);
    res
      .status(201)
      .json(
        decryptClient(
          db
            .prepare("SELECT * FROM clients WHERE id = ? AND created_by_user_id = ?")
            .get(clientId, req.user.id),
        ),
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
      "UPDATE clients SET name = ?, email = ?, company = ?, address = ?, phone = ?, notes = ? WHERE id = ? AND created_by_user_id = ?",
    ).run(encryptValue(name), encryptValue(email), encryptValue(company), encryptValue(address), encryptValue(phone), encryptValue(notes), req.params.id, req.user.id);
    res.json(
      decryptClient(db.prepare("SELECT * FROM clients WHERE id = ? AND created_by_user_id = ?").get(req.params.id, req.user.id)),
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
    .prepare("SELECT COUNT(*) AS count FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.client_id = ? AND c.created_by_user_id = ?")
    .get(req.params.id, req.user.id).count;
  if (linked > 0)
    return res
      .status(409)
      .json({
        error: "This client has linked invoices and cannot be deleted.",
      });
  db.prepare("DELETE FROM clients WHERE id = ? AND created_by_user_id = ?").run(req.params.id, req.user.id);
  res.status(204).end();
});
app.get("/api/invoices", (req, res) =>
  res.json(
    db
      .prepare(
        req.user.organization_id
          ? "SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? ORDER BY i.created_at DESC"
          : "SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id IS NULL AND i.user_id = ? ORDER BY i.created_at DESC",
      )
      .all(req.user.organization_id)
      .map(decryptInvoice),
  ),
);
app.get('/api/invoices/:id', (req, res) => {
  const invoice = decryptInvoice(db.prepare(req.user.organization_id ? 'SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)' : 'SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id IS NULL AND i.user_id = ? AND (i.id = ? OR i.number = ?)').get(req.user.organization_id || req.user.id, req.params.id, req.params.id));
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
    ? db.prepare("SELECT * FROM clients WHERE id = ? AND organization_id = ?").get(clientId, req.user.organization_id)
    : null;
  if (!client && clientName && clientEmail) {
    try {
      const newClientId = crypto.randomUUID()
      db.prepare("INSERT INTO clients (id, name, email, address, organization_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(newClientId, encryptValue(clientName), encryptValue(clientEmail), encryptValue(clientAddress), req.user.organization_id, req.user.id);
      client = db
        .prepare("SELECT * FROM clients WHERE id = ?")
        .get(newClientId);
    } catch (error) {
      client = db
        .prepare("SELECT * FROM clients WHERE organization_id = ?")
        .all(req.user.organization_id)
        .map(decryptClient)
        .find(savedClient => savedClient.email === clientEmail);
      if (!client) return res.status(409).json({ error: error.message });
    }
  }
  if (!client || !description || !amount)
    return res
      .status(400)
      .json({
        error: "Select a client or enter the recipient name and email.",
      });
  const invoiceScope = req.user.organization_id
    ? { column: 'organization_id', value: req.user.organization_id }
    : { column: 'user_id', value: req.user.id };
  const next = db.prepare(`SELECT COUNT(*) AS count FROM invoices WHERE ${invoiceScope.column} = ?`).get(invoiceScope.value).count + 1;
  const businessProfile = getScopedBusinessProfile(req.user);
  const invoicePrefix = businessProfile.invoice_prefix || 'INV-';
  const invoicePadding = Math.min(10, Math.max(1, Number(businessProfile.invoice_number_padding) || 4));
  const numberFormat = businessProfile.invoice_number_format || '{PREFIX}{YYYY}-{NUMBER}';
  const number = requestedNumber || numberFormat.replaceAll('{PREFIX}', invoicePrefix).replaceAll('{YYYY}', String(new Date().getFullYear())).replaceAll('{YY}', String(new Date().getFullYear()).slice(-2)).replaceAll('{NUMBER}', String(next).padStart(invoicePadding, '0'));
  const invoiceId = crypto.randomUUID();
  const result = db
    .prepare(
      "INSERT INTO invoices (id, number, client_id, client_name, client_email, description, amount, currency, payment_instructions, due_date, issue_date, is_past, organization_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      invoiceId,
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
      req.user.organization_id,
      req.user.id,
    );
  const insertLineItem = db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    if (item.description || Number(item.unitPrice) > 0) insertLineItem.run(invoiceId, encryptValue(item.description || 'Line item'), Number(item.quantity) || 1, Number(item.unitPrice) || 0);
  }
  res
    .status(201)
    .json(
      decryptInvoice(db.prepare("SELECT * FROM invoices WHERE id = ? AND organization_id = ?").get(invoiceId, req.user.organization_id)),
    );
});
app.patch('/api/invoices/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  const { clientId, description, amount, dueDate, currency = 'USD', paymentInstructions = '', lineItems = [] } = req.body;
  const client = clientId ? db.prepare('SELECT * FROM clients WHERE id = ? AND organization_id = ?').get(clientId, req.user.organization_id) : null;
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
  res.json(decryptInvoice(db.prepare('SELECT * FROM invoices WHERE id = ? AND organization_id = ?').get(invoice.id, req.user.organization_id)));
});
app.patch('/api/invoices/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['Draft', 'Sent', 'Paid', 'Overdue'].includes(status)) return res.status(400).json({ error: 'Invalid invoice status.' });
  const invoice = db.prepare('SELECT * FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  db.prepare('UPDATE invoices SET status = ?, sent_at = CASE WHEN ? = \'Sent\' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ?').run(status, status, invoice.id);
  res.json(decryptInvoice(db.prepare('SELECT * FROM invoices WHERE id = ? AND organization_id = ?').get(invoice.id, req.user.organization_id)));
});
app.delete('/api/invoices/:id', (req, res) => {
  const invoice = db.prepare('SELECT id FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  db.prepare('DELETE FROM invoices WHERE id = ? AND organization_id = ?').run(invoice.id, req.user.organization_id);
  res.status(204).end();
});
app.post('/api/payments', (req, res) => {
  const { invoiceId, method = 'Manual', date, amount } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, invoiceId, invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!date || !(Number(amount) > 0)) return res.status(400).json({ error: 'Payment date and amount are required.' });
  const result = db.prepare('INSERT INTO payments (invoice_id, client_id, date, source, method, amount, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(invoice.id, invoice.client_id, date, 'Manual', method, Number(amount), req.user.organization_id);
  db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(invoice.id);
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid));
});
app.get('/api/payments', (req, res) => res.json(db.prepare('SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.organization_id = ? ORDER BY p.id DESC').all(req.user.organization_id)));
function createPdf(invoice) {
  return new Promise((resolve) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 55 });
    const business = invoice.business ? decryptFields(invoice.business, businessFields) : getBusinessProfile(invoice.organization_id, invoice.user_id) || {};
    const logoDataUrl = invoice.business?.logoDataUrl || invoice.business?.logo_data_url || business.logo_data_url || '';
    const lineItems = invoice.lineItems || (invoice.id ? db.prepare('SELECT description, quantity, unit_price AS unitPrice FROM line_items WHERE invoice_id = ? ORDER BY id').all(invoice.id).map(item => ({ ...item, description: decryptValue(item.description) })) : []);
    const items = lineItems.length ? lineItems : [{ description: invoice.description || 'Line item', quantity: 1, unitPrice: Number(invoice.amount) || 0 }];
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitPrice || 0), 0);
    const money = value => `${invoice.currency || 'USD'} ${Number(value || 0).toFixed(2)}`;
    const date = value => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set';
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const left = 55, right = 540, width = right - left;
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(logoDataUrl)) {
      try { doc.image(Buffer.from(logoDataUrl.split(',')[1], 'base64'), left, 48, { fit: [42, 42] }); } catch { /* invalid optional logo does not prevent invoice generation */ }
    }
    const businessNameX = logoDataUrl ? left + 52 : left;
    doc.font('Times-Bold').fontSize(25).fillColor('#1b1a24').text(business.name || 'Your business', businessNameX, 55);
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
    .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)")
    .get(req.user.organization_id, req.params.id, req.params.id));
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
    .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)")
    .get(req.user.organization_id, req.params.id, req.params.id));
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  const preferredProvider = getBusinessProfile(invoice.organization_id, invoice.user_id).preferred_email_provider;
  const emailIntegration = db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY CASE WHEN provider = ? THEN 0 WHEN provider = 'mailjet' THEN 1 WHEN provider = 'outlook' THEN 2 WHEN provider = 'gmail' THEN 3 ELSE 4 END, connected_at DESC LIMIT 1").get(preferredProvider || '');
  const savedMailConfig = emailIntegration ? JSON.parse(decryptValue(emailIntegration.config_json || '{}')) : {};
  const businessProfile = getBusinessProfile(invoice.organization_id, invoice.user_id) || {};
  const transientLogoDataUrl = typeof req.body?.logoDataUrl === 'string' ? req.body.logoDataUrl : '';
  const invoiceForDelivery = transientLogoDataUrl
    ? { ...invoice, business: { ...businessProfile, logoDataUrl: transientLogoDataUrl } }
    : invoice;
  const businessName = businessProfile.name || process.env.BUSINESS_NAME || 'Your business';
  const userTemplate = userEmailTemplate(req.user.id, 'invoice');
  const platformTemplate = platformEmailTemplate('invoice');
  const templateValues = { client: invoice.client_name || 'there', invoice_number: invoice.number, amount: `${invoice.currency || 'USD'} ${Number(invoice.amount || 0).toFixed(2)}`, due_date: invoice.due_date || 'the due date', business_name: businessName };
  const templateMessage = renderEmailTemplate(userTemplate?.body || platformTemplate?.body || savedMailConfig.message || 'Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}.', templateValues);
  const templateSubject = renderEmailTemplate(userTemplate?.subject || platformTemplate?.subject || savedMailConfig.subject || '{{invoice_number}} from {{business_name}}', templateValues);
  const smtpHost = savedMailConfig.host || process.env.SMTP_HOST;
  const smtpUser = savedMailConfig.emailAddress || process.env.SMTP_USER;
  const smtpPass = savedMailConfig.smtpPassword || process.env.SMTP_PASS;
  if (emailIntegration?.provider === 'outlook' && savedMailConfig.authType === 'oauth2') {
    try {
      const pdf = await createPdf(invoiceForDelivery);
      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${savedMailConfig.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { subject: templateSubject, body: { contentType: 'Text', content: templateMessage }, toRecipients: [{ emailAddress: { address: invoice.client_email } }], attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: `${invoice.number}.pdf`, contentType: 'application/pdf', contentBytes: pdf.toString('base64') }] }, saveToSentItems: true }) });
      if (!graphResponse.ok) { const graphError = await graphResponse.text(); return res.status(502).json({ error: `Microsoft Graph rejected the message: ${graphError}` }); }
      db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
      return res.json({ ok: true, message: `Invoice ${invoice.number} sent to ${invoice.client_email}.` });
    } catch (error) { return res.status(502).json({ error: error.message }); }
  }
  if (emailIntegration?.provider === 'mailjet' && savedMailConfig.authType === 'mailjet') {
    try {
      const pdf = await createPdf(invoiceForDelivery);
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
    const pdf = await createPdf(invoiceForDelivery);
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
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(__dirname, "../dist/index.html")),
  );
}
app.listen(port, '0.0.0.0', () =>
  console.log(`Invoice API running on http://localhost:${port}`),
);
