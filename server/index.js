import express from "express";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { initializeDatabase } from "./db/index.js";
import {
  resolveInvoiceBusiness,
  nextInvoiceNumber,
  validateInvoiceFormat,
  normalizeInvoiceDate,
} from './services/invoice-numbering.js';
import {
    isSupportedRecurringFrequency,
    normalizeRecurringFrequency,
    addInterval,
    runDueSchedules,
} from './services/recurrence.js';
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
const db = await initializeDatabase();
const databasePath = process.env.SQLITE_DATABASE_PATH || path.join(__dirname, '../data/invoices.db');
// Preserve the original SQLite backup implementation against its native
// better-sqlite3 connection. API routes use the common async adapter.
const sqliteBackupDatabase = db.client === 'sqlite' ? db.legacyBackupDatabase : null;
if (sqliteBackupDatabase) {
    startBackupService(sqliteBackupDatabase, databasePath);
} else {
    console.warn('Kowope PostgreSQL: recurring invoices enabled; configure provider-managed pg_dump backups.');
}
const getBusinessProfile = async (organizationId = null, userId = null, businessProfileId = null) => {
    const profile = businessProfileId != null
        ? await db.prepare(`SELECT * FROM business_profile
            WHERE id = ? AND (organization_id = ? OR
              (organization_id IS NULL AND user_id = ?))`).get(
                businessProfileId, organizationId, userId)
        : organizationId != null
            ? await db.prepare('SELECT * FROM business_profile WHERE organization_id = ? ORDER BY id LIMIT 1').get(organizationId)
            : userId != null
                ? await db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id LIMIT 1').get(userId)
                : null;
    return decryptFields(profile, businessFields);
};
const getScopedBusinessProfile = async (user) => {
    const profile = user.organization_id
        ? await db.prepare(`
        SELECT * FROM business_profile
        WHERE organization_id = ? OR (organization_id IS NULL AND user_id = ?)
        ORDER BY CASE WHEN organization_id = ? THEN 0 ELSE 1 END, id
        LIMIT 1
      `).get(user.organization_id, user.id, user.organization_id) : await db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id LIMIT 1').get(user.id);
    return decryptFields(profile, businessFields) || {};
};
const getScopedBusinessProfiles = async (user) => {
    const rows = user.organization_id
        ? await db.prepare(`
        SELECT * FROM business_profile
        WHERE organization_id = ? OR (organization_id IS NULL AND user_id = ?)
        ORDER BY CASE WHEN organization_id = ? THEN 0 ELSE 1 END, id
      `).all(user.organization_id, user.id, user.organization_id) : await db.prepare('SELECT * FROM business_profile WHERE organization_id IS NULL AND user_id = ? ORDER BY id').all(user.id);
    return rows.map(row => decryptFields(row, businessFields));
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
const verifyPassword = (password, storedHash) => {
    const [salt, hash] = storedHash.split(':');
    const candidate = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
};
const readSession = async (req) => {
    const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`));
    if (!cookie)
        return null;
    const token = cookie.slice(sessionCookie.length + 1);
    const cachedUserId = sessions.get(token);
    console.log(token, cachedUserId);
    if (cachedUserId)
        return cachedUserId;
    const session = await db.prepare('SELECT user_id FROM auth_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP').get(token);
    if (session)
        sessions.set(token, session.user_id);
    return session?.user_id || null;
};
const sessionUser = async (req) => {
    const userId = await readSession(req);
    //console.log(userId);
    return userId ? await db.prepare('SELECT u.id, u.email, u.role, m.organization_id FROM users u LEFT JOIN organization_members m ON m.user_id = u.id WHERE u.id = ?').get(userId) : null;
};
const requireOwner = async (req, res, next) => {
    const user = await sessionUser(req);
    if (!user)
        return res.status(401).json({ error: 'Authentication required.' });
    if (user.role !== 'owner')
        return res.status(403).json({ error: 'Owner access required.' });
    req.user = user;
    next();
};
const requireAuthenticated = async (req, res, next) => {
    const user = await sessionUser(req);
    if (!user)
        return res.status(401).json({ error: 'Authentication required.' });
    req.user = user;
    next();
};
const guestSessionId = req => {
    const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${guestSessionCookie}=`));
    if (cookie)
        return cookie.slice(guestSessionCookie.length + 1);
    const sessionId = crypto.randomUUID();
    req.res.setHeader('Set-Cookie', `${guestSessionCookie}=${sessionId}; SameSite=Lax; Path=/; Max-Age=86400`);
    return sessionId;
};
const logGuestEvent = async (req, event) => await db.prepare('INSERT INTO guest_analytics (id, account_key, session_id, event) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), 'guest', guestSessionId(req), event);
const getSecuritySettings = async () => await db.prepare('SELECT * FROM security_settings WHERE id = 1').get();
const ensureBackupSettings = async (recipientEmail = '') => {
    let backupSettings = await db.prepare('SELECT * FROM backup_settings WHERE id = 1').get();
    if (backupSettings)
        return backupSettings;
    const nextRunAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(`INSERT INTO backup_settings (id, recipient_email, interval_days, enabled, next_run_at)
        VALUES (1, ?, 14, 0, ?)
        ON CONFLICT (id) DO NOTHING`).run(String(recipientEmail || ''), nextRunAt);
    backupSettings = await db.prepare('SELECT * FROM backup_settings WHERE id = 1').get();
    return backupSettings;
};
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
const platformEmailTemplate = async (templateKey) => await db.prepare('SELECT * FROM platform_email_templates WHERE template_key = ?').get(templateKey);
const userEmailTemplate = async (userId, templateKey) => await db.prepare('SELECT * FROM email_templates WHERE user_id = ? AND template_key = ?').get(userId, templateKey);
const passwordPolicyError = async (password) => { const settings = await getSecuritySettings(); if (!settings?.configured_at)
    return null; if (password.length < settings.password_min_length)
    return `Password must be at least ${settings.password_min_length} characters.`; if (settings.require_uppercase && !/[A-Z]/.test(password))
    return 'Password must include an uppercase letter.'; if (settings.require_lowercase && !/[a-z]/.test(password))
    return 'Password must include a lowercase letter.'; if (settings.require_number && !/[0-9]/.test(password))
    return 'Password must include a number.'; if (settings.require_symbol && !/[^A-Za-z0-9]/.test(password))
    return 'Password must include a symbol.'; return null; };
async function ensureUserOrganizations() {
    const owner = await db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get();
    if (!owner)
        return;
    let organization = await db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get();
    if (!organization) {
        const result = await db.prepare('INSERT INTO organizations (name) VALUES (?)').run('Default organization');
        organization = { id: result.lastInsertRowid };
    }
    await db.prepare("INSERT INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'owner') ON CONFLICT DO NOTHING").run(organization.id, owner.id);
    await db.prepare('UPDATE organization_members SET membership_role = ? WHERE organization_id = ? AND user_id = ?').run('owner', organization.id, owner.id);
    for (const table of ['business_profile', 'clients', 'invoices', 'payments', 'recurring_schedules', 'integrations']) {
        await db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`).run(organization.id);
    }
    await db.prepare('UPDATE currencies SET organization_id = ? WHERE user_id IS NOT NULL AND organization_id IS NULL').run(organization.id);
    await db.prepare('UPDATE clients SET created_by_user_id = ? WHERE created_by_user_id IS NULL').run(owner.id);
}
// Bootstrap only the platform owner from environment configuration. Ordinary
// users are always created through the signup flow.
if (!await db.prepare('SELECT id FROM users LIMIT 1').get() && process.env.KOWOPE_OWNER_EMAIL && process.env.KOWOPE_OWNER_PASSWORD) {
    await db.prepare('INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').run(crypto.randomUUID(), process.env.KOWOPE_OWNER_EMAIL.trim().toLowerCase(), hashPassword(process.env.KOWOPE_OWNER_PASSWORD), 'owner');
}
function getProviders() {
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const host = (process.env.SMTP_HOST || "").toLowerCase();
    const gmailConfigured = smtpConfigured && host.includes("gmail");
    const outlookConfigured = smtpConfigured && (host.includes("office365") || host.includes("outlook"));
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
            connected: Boolean(process.env.QUICKBOOKS_CLIENT_ID &&
                process.env.QUICKBOOKS_CLIENT_SECRET),
            description: "Add QuickBooks OAuth credentials to enable sync.",
        },
    ];
}
app.get("/api/providers", (_req, res) => res.json(getProviders()));
const hasUsers = async () => Boolean(await db.prepare('SELECT id FROM users LIMIT 1').get());
const ownerSetupRequired = async () => {
    const ownerExists = Boolean(await db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get());
    // A missing business email means the existing owner still needs to finish
    // setup; it must not create a second platform owner or show owner signup.
    return !ownerExists;
};
const signupIsAllowed = async () => await ownerSetupRequired() || Boolean((await db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get())?.allow_user_signup);
app.get('/api/auth/status', async (_req, res) => { 
    const user = await sessionUser(_req);
    //console.log(`status response from the index: ${user}`);
    res.json({
        authenticated: Boolean(user),
        allowSignup: await signupIsAllowed(),
        ownerSetupRequired: await ownerSetupRequired(),
        role: user?.role || null,
        email: user?.email || null
    });
});
function getPublicAppUrl(request) {
    const configuredUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    if (configuredUrl && (process.env.NODE_ENV !== 'production' || !configuredUrl.includes('localhost')))
        return configuredUrl;
    const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
    if (renderUrl)
        return renderUrl;
    if (process.env.NODE_ENV === 'production') {
        const forwardedProtocol = String(request?.get('x-forwarded-proto') || 'https').split(',')[0].trim();
        const forwardedHost = String(request?.get('x-forwarded-host') || request?.get('host') || '').split(',')[0].trim();
        if (forwardedHost)
            return `${forwardedProtocol}://${forwardedHost}`;
        throw new Error('Set PUBLIC_APP_URL or RENDER_EXTERNAL_URL for production email links.');
    }
    return 'http://localhost:5173';
}
async function sendVerificationEmail(email, verificationUrl) {
    const subject = 'Verify your Kowope account';
    const message = `Verify your Kowope account by opening this link:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`;
    const connectedMailjet = await db.prepare("SELECT config_json FROM integrations WHERE provider = 'mailjet' AND status = 'connected' ORDER BY connected_at DESC LIMIT 1").get();
    const mailjetConfig = connectedMailjet ? JSON.parse(decryptValue(connectedMailjet.config_json || '{}')) : {};
    const mailjetKey = mailjetConfig.apiKey || process.env.MAILJET_API_KEY;
    const mailjetSecret = mailjetConfig.secretKey || process.env.MAILJET_SECRET_KEY;
    const senderEmail = mailjetConfig.senderEmail || process.env.INVOICE_FROM || process.env.SMTP_USER;
    if (!senderEmail)
        throw new Error('Verification email is not configured. Connect Mailjet or set INVOICE_FROM and SMTP credentials.');
    if (mailjetKey && mailjetSecret) {
        const authorization = Buffer.from(`${mailjetKey}:${mailjetSecret}`).toString('base64');
        const response = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: senderEmail, Name: mailjetConfig.fromName || 'Kowope' }, To: [{ Email: email }], Subject: subject, TextPart: message }] }) });
        if (!response.ok)
            throw new Error(`Mailjet rejected the verification email (${response.status}).`);
        return;
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)
        throw new Error('Verification email is not configured. Set Mailjet credentials or SMTP_HOST, SMTP_USER, and SMTP_PASS.');
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transporter.sendMail({ from: process.env.INVOICE_FROM || process.env.SMTP_USER, to: email, subject, text: message });
}
async function createAndSendVerification(user, request) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await db.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(rawToken), user.id, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    await sendVerificationEmail(user.email, `${getPublicAppUrl(request)}/?verify=${rawToken}`);
}
app.post('/api/auth/signup', async (req, res) => {
    const isOwnerSetup = await ownerSetupRequired();
    if (!isOwnerSetup && !await signupIsAllowed())
        return res.status(403).json({ error: 'New user accounts are disabled by the owner.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const policyError = await passwordPolicyError(password);
    if (!/^\S+@\S+\.\S+$/.test(email) || policyError)
        return res.status(400).json({ error: policyError || 'Use a valid email.' });
    let createdUserId = null;
    let firstOwner = false;
    let accountPersisted = false;
    try {
        firstOwner = isOwnerSetup;
        createdUserId = crypto.randomUUID();
        const emailVerifiedAt = firstOwner ? new Date().toISOString() : null;
        // Keep account creation atomic. In particular, a failed email provider must
        // not leave an unusable user row that blocks first-owner setup or retries.
        await db.transaction(async () => {
            await db.prepare('INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, ?)').run(createdUserId, email, hashPassword(password), firstOwner ? 'owner' : 'user', emailVerifiedAt);
            if (firstOwner) {
                await db.prepare('UPDATE business_profile SET user_id = ? WHERE id = 1 AND user_id IS NULL').run(createdUserId);
            }
            else {
                await db.prepare('INSERT INTO business_profile (name, user_id) VALUES (?, ?)').run('', createdUserId);
            }
            if (firstOwner)
                await db.prepare('UPDATE business_profile SET allow_user_signup = 0 WHERE id = 1').run();
        })();
        accountPersisted = true;
        const createdUser = { id: createdUserId, email };
        if (!firstOwner)
            await createAndSendVerification(createdUser, req);
        res.status(201).json(firstOwner
            ? { verificationRequired: false, ownerCreated: true, message: 'Platform owner account created. You can sign in without email verification.' }
            : { verificationRequired: true, message: 'Account created. Check your email to verify your account before signing in.' });
    }
    catch (error) {
        // Owner creation must be fully atomic so a failed first setup cannot lock
        // the platform. Ordinary users remain as unverified accounts when mail
        // delivery fails, allowing the owner to resend verification later.
        if (createdUserId && firstOwner) {
            try {
                await db.transaction(async () => {
                    await db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(createdUserId);
                    await db.prepare('DELETE FROM organization_members WHERE user_id = ?').run(createdUserId);
                    await db.prepare('DELETE FROM users WHERE id = ?').run(createdUserId);
                })();
            }
            catch (cleanupError) {
                console.error('Signup rollback failed:', cleanupError);
            }
        }
        const duplicate = /unique|duplicate key/i.test(error.message);
        if (!duplicate && !firstOwner && accountPersisted && createdUserId) {
            return res.status(502).json({
                accountCreated: true,
                verificationRequired: true,
                userId: createdUserId,
                error: `Account created, but the verification email could not be sent: ${error.message}`,
            });
        }
        res.status(duplicate ? 409 : 502).json({ error: duplicate ? 'An account with that email already exists.' : error.message });
    }
});
app.post('/api/auth/resend-verification', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await db.prepare('SELECT id, email, email_verified_at FROM users WHERE email = ?').get(email);
    if (!user || user.email_verified_at)
        return res.json({ ok: true, message: 'If the account needs verification, a new link has been sent.' });
    try {
        await db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id);
        await createAndSendVerification(user, req);
        res.json({ ok: true, message: 'A new verification link has been sent. It expires in 24 hours.' });
    }
    catch (error) {
        console.error('Verification email failed:', error);
        res.status(502).json({ error: error.message });
    }
});
app.get('/api/platform/users', requireOwner, async (_req, res) => {
    res.json(await db.prepare("SELECT id, email, role, email_verified_at, suspended_at FROM users WHERE role != 'owner' ORDER BY email").all());
});
app.get('/api/organization', requireAuthenticated, async (req, res) => {
    if (!req.user.organization_id)
        return res.json({ organization: null, members: [], membership_role: null });
    const organization = await db.prepare('SELECT id, name, created_at FROM organizations WHERE id = ?').get(req.user.organization_id);
    const members = await db.prepare('SELECT u.id, u.email, u.role, m.membership_role, m.created_at FROM organization_members m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? ORDER BY m.created_at').all(req.user.organization_id);
    const membership = await db.prepare('SELECT membership_role FROM organization_members WHERE organization_id = ? AND user_id = ?').get(req.user.organization_id, req.user.id);
    res.json({ organization, members, membership_role: membership?.membership_role || null });
});
app.post('/api/organization', requireAuthenticated, async (req, res) => {
    if (req.user.organization_id)
        return res.status(409).json({ error: 'You already belong to an organization.' });
    const name = String(req.body.name || '').trim();
    if (!name)
        return res.status(400).json({ error: 'Enter an organization name.' });
    const createOrganization = db.transaction(async () => {
        const organizationResult = await db.prepare('INSERT INTO organizations (name) VALUES (?)').run(name);
        await db.prepare("INSERT INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'owner')").run(organizationResult.lastInsertRowid, req.user.id);
        return await db.prepare('SELECT id, name, created_at FROM organizations WHERE id = ?').get(organizationResult.lastInsertRowid);
    });
    const organization = await createOrganization();
    res.status(201).json({ organization, members: [{ id: req.user.id, email: req.user.email, role: req.user.role, membership_role: 'owner' }], membership_role: 'owner' });
});
app.post('/api/organization/members', requireAuthenticated, async (req, res) => {
    if (req.user.membership_role !== 'owner' && (await db.prepare('SELECT membership_role FROM organization_members WHERE organization_id = ? AND user_id = ?').get(req.user.organization_id, req.user.id))?.membership_role !== 'owner')
        return res.status(403).json({ error: 'Only the organization owner can invite members.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
        return res.status(400).json({ error: 'Enter a valid user email.' });
    const invitedUser = await db.prepare("SELECT id, email, role FROM users WHERE email = ? AND role != 'owner'").get(email);
    if (!invitedUser)
        return res.status(404).json({ error: 'The user must create and verify a Kowope account before joining this organization.' });
    try {
        await db.prepare("INSERT INTO organization_members (organization_id, user_id, membership_role) VALUES (?, ?, 'member')").run(req.user.organization_id, invitedUser.id);
        res.status(201).json({ ok: true, message: `${email} added to the organization.` });
    }
    catch (error) {
        res.status(/unique|duplicate key/i.test(error.message) ? 409 : 500).json({ error: /unique|duplicate key/i.test(error.message) ? 'This user already belongs to an organization.' : error.message });
    }
});
app.post('/api/platform/users/:userId/resend-verification', requireOwner, async (req, res) => {
    const user = await db.prepare("SELECT id, email, email_verified_at FROM users WHERE id = ? AND role != 'owner'").get(req.params.userId);
    if (!user)
        return res.status(404).json({ error: 'User not found.' });
    if (user.email_verified_at)
        return res.status(400).json({ error: 'This user is already verified.' });
    try {
        await db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id);
        await createAndSendVerification(user);
        res.json({ ok: true, message: `A new verification link was sent to ${user.email}.` });
    }
    catch (error) {
        console.error('Owner resend verification failed:', error);
        res.status(502).json({ error: error.message });
    }
});
app.patch('/api/platform/users/:userId/suspension', requireOwner, async (req, res) => {
    const user = await db.prepare("SELECT id, email, role, suspended_at FROM users WHERE id = ? AND role != 'owner'").get(req.params.userId);
    if (!user)
        return res.status(404).json({ error: 'User not found.' });
    const suspended = Boolean(req.body.suspended);
    await db.prepare('UPDATE users SET suspended_at = ? WHERE id = ?').run(suspended ? new Date().toISOString() : null, user.id);
    res.json({ ok: true, suspended, message: suspended ? `${user.email} suspended.` : `${user.email} reactivated.` });
});
app.post('/api/auth/verify-email', async (req, res) => {
    const tokenHash = hashToken(String(req.body.token || ''));
    const verification = await db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL').get(tokenHash);
    if (!verification || new Date(verification.expires_at).getTime() < Date.now())
        return res.status(400).json({ error: 'This verification link is invalid or expired.' });
    await db.transaction(async () => {
        await db.prepare('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(verification.user_id);
        await db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
    })();
    res.json({ ok: true, message: 'Email verified. You can now sign in.' });
});
app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash))
        return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.suspended_at)
        return res.status(403).json({ error: 'This account has been suspended. Contact the platform owner.' });
    if (user.role !== 'owner' && !user.email_verified_at)
        return res.status(403).json({ error: 'Verify your email address before signing in.' });
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
    sessions.set(token, user.id);
    const firstLogin = user.role === 'owner' && !user.last_login_at;
    await db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/`);
    res.json({ authenticated: true, firstLogin });
});
app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericResponse = { message: `If an account exists for that email, a reset link has been sent. The link expires in ${(await getSecuritySettings()).reset_token_minutes} minutes.` };
    const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (!user)
        return res.json(genericResponse);
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const securitySettings = await getSecuritySettings();
        passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + securitySettings.reset_token_minutes * 60 * 1000 });
        const resetUrl = `${getPublicAppUrl(req)}/?reset=${token}`;
        const integration = await db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY connected_at DESC LIMIT 1").get();
        const config = integration ? JSON.parse(decryptValue(integration.config_json || '{}')) : {};
        const business = await getBusinessProfile((await db.prepare('SELECT organization_id FROM organization_members WHERE user_id = ?').get(user.id))?.organization_id) || {};
        const subject = 'Reset your Kowope password';
        const message = `Use this link to reset your Kowope password:\n\n${resetUrl}\n\nThis link expires in ${securitySettings.reset_token_minutes} minutes. If you did not request this, you can ignore this email.`;
        if (integration?.provider === 'mailjet' && config.apiKey && config.secretKey) {
            const authorization = Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64');
            const response = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: config.senderEmail || business.email, Name: config.fromName || business.name || 'Kowope' }, To: [{ Email: user.email }], Subject: subject, TextPart: message }] }) });
            if (!response.ok)
                throw new Error('Mail provider rejected the reset email.');
        }
        else {
            const transporter = nodemailer.createTransport({ host: config.host || process.env.SMTP_HOST, port: Number(config.port || process.env.SMTP_PORT || 587), secure: config.secure ?? process.env.SMTP_SECURE === 'true', auth: { user: config.emailAddress || process.env.SMTP_USER, pass: config.smtpPassword || process.env.SMTP_PASS } });
            await transporter.sendMail({ from: process.env.INVOICE_FROM || config.emailAddress || process.env.SMTP_USER, to: user.email, subject, text: message });
        }
        return res.json(genericResponse);
    }
    catch (error) {
        passwordResetTokens.delete([...passwordResetTokens.keys()].find(token => passwordResetTokens.get(token)?.userId === user.id));
        return res.status(502).json({ error: `Unable to send reset email: ${error.message}` });
    }
});
app.post('/api/auth/reset-password', async (req, res) => {
    const token = String(req.body.token || '');
    const newPassword = String(req.body.newPassword || '');
    const reset = passwordResetTokens.get(token);
    if (!reset || reset.expiresAt < Date.now())
        return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    const policyError = await passwordPolicyError(newPassword);
    if (policyError)
        return res.status(400).json({ error: policyError });
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), reset.userId);
    passwordResetTokens.delete(token);
    res.json({ ok: true });
});
app.post('/api/auth/password', async (req, res) => {
    const userId = await readSession(req);
    if (!userId)
        return res.status(401).json({ error: 'Authentication required.' });
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !verifyPassword(currentPassword, user.password_hash))
        return res.status(400).json({ error: 'Current password is incorrect.' });
    const policyError = await passwordPolicyError(newPassword);
    if (policyError)
        return res.status(400).json({ error: policyError });
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
    res.json({ ok: true });
});
app.get('/api/platform/user-management', requireOwner, async (_req, res) => { res.json({ allowSignup: Boolean((await db.prepare('SELECT allow_user_signup FROM business_profile WHERE id = 1').get())?.allow_user_signup) }); });
app.put('/api/platform/user-management', requireOwner, async (req, res) => { await db.prepare('UPDATE business_profile SET allow_user_signup = ? WHERE id = 1').run(req.body.allowSignup ? 1 : 0); res.json({ allowSignup: Boolean(req.body.allowSignup) }); });
app.get('/api/account/security', requireOwner, async (req, res) => res.json({ backup: await ensureBackupSettings(req.user.email), password: await getSecuritySettings() }));
app.put('/api/account/security', requireOwner, async (req, res) => {
    const backup = req.body.backup || {}, password = req.body.password || {};
    const intervalDays = Math.min(365, Math.max(1, Number(backup.intervalDays) || 14));
    const resetTokenMinutes = Math.min(1440, Math.max(5, Number(password.resetTokenMinutes) || 15));
    const passwordMinLength = Math.min(128, Math.max(8, Number(password.passwordMinLength) || 12));
    const recipientEmail = String(backup.recipientEmail || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail))
        return res.status(400).json({ error: 'Enter a valid backup email.' });
    const nextRunAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
    await ensureBackupSettings(req.user.email);
    await db.prepare('UPDATE backup_settings SET recipient_email = ?, interval_days = ?, enabled = ?, next_run_at = ? WHERE id = 1').run(recipientEmail, intervalDays, backup.enabled === false ? 0 : 1, nextRunAt);
    await db.prepare('UPDATE security_settings SET reset_token_minutes = ?, password_min_length = ?, require_uppercase = ?, require_lowercase = ?, require_number = ?, require_symbol = ?, configured_at = CURRENT_TIMESTAMP WHERE id = 1').run(resetTokenMinutes, passwordMinLength, password.requireUppercase ? 1 : 0, password.requireLowercase ? 1 : 0, password.requireNumber ? 1 : 0, password.requireSymbol ? 1 : 0);
    res.json({ backup: await db.prepare('SELECT * FROM backup_settings WHERE id = 1').get(), password: await getSecuritySettings() });
});
app.get('/api/email-templates', requireAuthenticated, async (req, res) => {
    const platformTemplate = await platformEmailTemplate('invoice');
    const personalTemplate = await userEmailTemplate(req.user.id, 'invoice');
    res.json({
        templateKey: 'invoice',
        subject: personalTemplate?.subject || platformTemplate?.subject || '{{invoice_number}} from {{business_name}}',
        body: personalTemplate?.body || platformTemplate?.body || 'Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}.',
        customized: Boolean(personalTemplate),
        availableTokens: templateTokens.invoice,
    });
});
app.put('/api/email-templates/:templateKey', requireAuthenticated, async (req, res) => {
    if (req.params.templateKey !== 'invoice')
        return res.status(400).json({ error: 'Only invoice templates can be customized by a user.' });
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    const validationError = validateEmailTemplate('invoice', subject, body);
    if (!subject || !body)
        return res.status(400).json({ error: 'Subject and body are required.' });
    if (validationError)
        return res.status(400).json({ error: validationError });
    await db.prepare(`INSERT INTO email_templates (id, user_id, template_key, subject, body, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, template_key) DO UPDATE SET subject = excluded.subject, body = excluded.body, updated_at = CURRENT_TIMESTAMP`).run(crypto.randomUUID(), req.user.id, 'invoice', subject, body);
    res.json({ ok: true, ...await userEmailTemplate(req.user.id, 'invoice'), availableTokens: templateTokens.invoice });
});
app.post('/api/email-templates/:templateKey/preview', requireAuthenticated, (req, res) => {
    if (req.params.templateKey !== 'invoice')
        return res.status(400).json({ error: 'Unsupported template.' });
    const subject = String(req.body.subject || '');
    const body = String(req.body.body || '');
    const values = { client: 'Example client', business_name: 'Your business', invoice_number: 'INV-2026-0001', amount: 'USD 250.00', due_date: 'Dec 15, 2026' };
    res.json({ subject: renderEmailTemplate(subject, values), body: renderEmailTemplate(body, values) });
});
app.get('/api/platform/email-templates', requireOwner, async (_req, res) => res.json((await db.prepare('SELECT template_key AS "templateKey", subject, body, updated_at AS "updatedAt" FROM platform_email_templates ORDER BY template_key').all()).map(template => ({ ...template, availableTokens: templateTokens[template.templateKey] || [] }))));
app.put('/api/platform/email-templates/:templateKey', requireOwner, async (req, res) => {
    const templateKey = String(req.params.templateKey || '');
    if (!templateTokens[templateKey])
        return res.status(400).json({ error: 'Unsupported platform template.' });
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    const validationError = validateEmailTemplate(templateKey, subject, body);
    if (!subject || !body)
        return res.status(400).json({ error: 'Subject and body are required.' });
    if (validationError)
        return res.status(400).json({ error: validationError });
    await db.prepare('UPDATE platform_email_templates SET subject = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE template_key = ?').run(subject, body, templateKey);
    res.json({ ok: true, template: await platformEmailTemplate(templateKey), availableTokens: templateTokens[templateKey] });
});
app.post('/api/platform/email-templates/:templateKey/preview', requireOwner, async (req, res) => {
    const templateKey = String(req.params.templateKey || '');
    const values = { client: 'Example client', business_name: 'Your business', invoice_number: 'INV-2026-0001', amount: 'USD 250.00', due_date: 'Dec 15, 2026', reset_link: 'https://kowope.example/reset?token=example', verification_link: 'https://kowope.example/verify?token=example' };
    const template = { subject: String(req.body.subject ?? (await platformEmailTemplate(templateKey))?.subject ?? ''), body: String(req.body.body ?? (await platformEmailTemplate(templateKey))?.body ?? '') };
    if (!templateTokens[templateKey])
        return res.status(400).json({ error: 'Unsupported platform template.' });
    res.json({ subject: renderEmailTemplate(template.subject, values), body: renderEmailTemplate(template.body, values) });
});
app.post('/api/auth/logout', async (req, res) => { const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`)); if (cookie) {
    const token = cookie.slice(sessionCookie.length + 1);
    sessions.delete(token);
    await db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
} res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); res.status(204).end(); });
app.post('/api/guest/session', async (req, res) => { const sessionId = guestSessionId(req); await logGuestEvent(req, 'session_started'); res.json({ ok: true, sessionId }); });
const guestInvoicePayload = body => ({
    number: String(body.number || 'GUEST-INVOICE'),
    client_name: String(body.clientName || 'Client'),
    client_email: String(body.clientEmail || ''),
    client_address: String(body.clientAddress || ''),
    description: String(body.description || 'Line item'),
    lineItems: Array.isArray(body.lineItems) ? body.lineItems : [],
    business: body.business ? { ...body.business, logo_data_url: String(body.business.logoDataUrl || body.business.logo_data_url || '') } : null,
    amount: Number(body.amount || 0),
    subtotal: Number(body.subtotal),
    discount: Number(body.discount),
    taxAmount: Number(body.taxAmount),
    taxName: String(body.taxName || 'Tax'),
    taxRate: Number(body.taxRate || 0),
    currency: String(body.currency || 'USD'),
    currencySymbol: String(body.currencySymbol || ''),
    due_date: body.dueDate || null,
    created_at: new Date().toISOString(),
    payment_instructions: String(body.paymentInstructions || ''),
});
app.post('/api/guest/invoices/preview/pdf', async (req, res) => { await logGuestEvent(req, 'invoice_created'); const pdf = await createPdf(guestInvoicePayload(req.body)); await logGuestEvent(req, 'invoice_generated'); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="guest-invoice.pdf"' }).send(pdf); });
app.post('/api/guest/invoices/download/pdf', async (req, res) => { const invoice = guestInvoicePayload(req.body); const pdf = await createPdf(invoice); await logGuestEvent(req, 'invoice_downloaded'); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` }).send(pdf); });
app.post('/api/guest/analytics', async (req, res) => { const allowedEvents = new Set(['invoice_created', 'invoice_generated', 'invoice_downloaded']); const event = String(req.body.event || ''); if (!allowedEvents.has(event))
    return res.status(400).json({ error: 'Unsupported guest event.' }); await logGuestEvent(req, event); res.status(204).end(); });
app.use('/api', async (req, res, next) => { if (req.path.startsWith('/auth/') || req.path.startsWith('/guest/'))
    return next(); const user = await sessionUser(req); if (!user)
    return res.status(401).json({ error: 'Authentication required.' }); req.user = user; next(); });
app.post('/api/backups/run', async (_req, res) => { if (!sqliteBackupDatabase)
    return res.status(501).json({ error: 'PostgreSQL backup requires a provider-managed pg_dump backup. The SQLite ZIP-backup endpoint is not supported.' }); try {
    const result = await runManualBusinessBackup(sqliteBackupDatabase, databasePath);
    res.json(result);
}
catch (error) {
    res.status(502).json({ error: error.message });
} });
app.get('/api/integrations', async (req, res) => {
    const integrations = await db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations ORDER BY provider').all();
    res.json(integrations.map(integration => {
        const publicIntegration = { ...getIntegrationConfig(integration), connected: String(integration.status || '').toLowerCase() === 'connected' };
        if (req.user.role !== 'owner') {
            return { ...publicIntegration, config_json: null };
        }
        return publicIntegration;
    }));
});
app.put('/api/integrations/:provider', requireOwner, async (req, res) => {
    const { status = 'connected', accountLabel = '', config = {} } = req.body;
    await db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error, organization_id, user_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL) ON CONFLICT(provider) DO UPDATE SET status=excluded.status, account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL, organization_id=NULL, user_id=NULL`).run(req.params.provider, status, accountLabel, encryptValue(JSON.stringify(config)));
    res.json(getIntegrationConfig(await db.prepare('SELECT provider, status, account_label, config_json, connected_at, last_error FROM integrations WHERE provider = ?').get(req.params.provider)));
});
app.delete('/api/integrations/:provider', requireOwner, async (req, res) => { await db.prepare('DELETE FROM integrations WHERE provider = ?').run(req.params.provider); res.status(204).end(); });
app.get('/api/integrations/outlook/oauth/start', requireOwner, (req, res) => {
    if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_REDIRECT_URI)
        return res.status(400).send('Configure OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI in .env first.');
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const params = new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, response_type: 'code', redirect_uri: process.env.OUTLOOK_REDIRECT_URI, response_mode: 'query', scope: 'openid profile email offline_access Mail.Send', state });
    res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});
app.get('/api/integrations/outlook/oauth/callback', requireOwner, async (req, res) => {
    const expiresAt = oauthStates.get(req.query.state);
    oauthStates.delete(req.query.state);
    if (!expiresAt || expiresAt < Date.now() || !req.query.code)
        return res.status(400).send('Invalid or expired Microsoft OAuth request.');
    try {
        const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.OUTLOOK_CLIENT_ID, client_secret: process.env.OUTLOOK_CLIENT_SECRET || '', grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.OUTLOOK_REDIRECT_URI, scope: 'openid profile email offline_access Mail.Send' }) });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok)
            return res.status(400).send(token.error_description || 'Microsoft authorization failed.');
        const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
        const profile = await profileResponse.json();
        await db.prepare(`INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error, organization_id, user_id) VALUES ('outlook', 'connected', ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL) ON CONFLICT(provider) DO UPDATE SET status='connected', account_label=excluded.account_label, config_json=excluded.config_json, connected_at=excluded.connected_at, last_error=NULL, organization_id=NULL, user_id=NULL`).run(profile.mail || profile.userPrincipalName || 'Microsoft Outlook', encryptValue(JSON.stringify({ authType: 'oauth2', accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, emailAddress: profile.mail || profile.userPrincipalName || '' })));
        res.redirect('/?outlook=connected');
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});
app.get('/api/recurring', async (req, res) => res.json((await db.prepare(req.user.organization_id ? 'SELECT s.*, c.name AS client_name, p.amount AS current_amount FROM recurring_schedules s JOIN clients c ON c.id = s.client_id LEFT JOIN schedule_price_history p ON p.schedule_id = s.id AND p.id = (SELECT id FROM schedule_price_history WHERE schedule_id = s.id ORDER BY effective_from DESC, id DESC LIMIT 1) WHERE s.organization_id = ? ORDER BY s.next_run_at' : 'SELECT s.*, c.name AS client_name, p.amount AS current_amount FROM recurring_schedules s JOIN clients c ON c.id = s.client_id LEFT JOIN schedule_price_history p ON p.schedule_id = s.id AND p.id = (SELECT id FROM schedule_price_history WHERE schedule_id = s.id ORDER BY effective_from DESC, id DESC LIMIT 1) WHERE s.organization_id IS NULL AND s.user_id = ? ORDER BY s.next_run_at').all(req.user.organization_id || req.user.id)).map(schedule => ({ ...schedule, client_name: decryptValue(schedule.client_name), description: decryptValue(schedule.description) }))));
app.post('/api/recurring', async (req, res) => {
    const {
        clientId, description, amount, frequency, nextRunAt,
        currency = 'USD', perpetual = true, occurrenceCount = null,
        autoSend = 0, sourceInvoiceId = null, historicalInvoiceIds = [],
        businessProfileId = null,
    } = req.body;

    const normalizedFrequency = normalizeRecurringFrequency(frequency);

    if (!clientId || !description || !(Number(amount) > 0) || !normalizedFrequency || !nextRunAt) {
        return res.status(400).json({ error: 'Client, description, amount, frequency, and next invoice date are required.' });
    }
    if (!isSupportedRecurringFrequency(normalizedFrequency)) {
        return res.status(400).json({ error: 'Choose a supported recurring frequency.' });
    }
    const isPerpetual = perpetual !== false;
    const selectedOccurrenceCount = Number(occurrenceCount);
    if (!isPerpetual && (!Number.isInteger(selectedOccurrenceCount) || selectedOccurrenceCount < 1 || selectedOccurrenceCount > 120)) {
        return res.status(400).json({ error: 'Choose between 1 and 120 future invoices, or select a perpetual schedule.' });
    }

    let endAt = null;
    try {
        // Validate the start date with the scheduler's own date rules. A finite
        // schedule stores the date of its final invoice; existing schedules
        // remain perpetual because their end date is NULL.
        addInterval(nextRunAt, normalizedFrequency);
        if (!isPerpetual) {
            endAt = nextRunAt;
            for (let occurrenceIndex = 1; occurrenceIndex < selectedOccurrenceCount; occurrenceIndex += 1) {
                endAt = addInterval(endAt, normalizedFrequency);
            }
        }
    } catch {
        return res.status(400).json({ error: 'Choose a valid first invoice date.' });
    }

    try {
        const created = await db.transaction(async () => {
            const profile = await resolveInvoiceBusiness(db, {
                businessProfileId,
                organizationId: req.user.organization_id,
                userId: req.user.id,
            });
            const client = await db.maybeOne(
                `SELECT id FROM clients WHERE id = ? AND
                  (organization_id = ? OR (organization_id IS NULL AND created_by_user_id = ?))`,
                [clientId, req.user.organization_id, req.user.id],
            );
            if (!client) throw new Error('Client not found.');
            if (sourceInvoiceId != null) {
                const sourceInvoice = await db.maybeOne(
                    'SELECT id FROM invoices WHERE id = ? AND business_profile_id = ?',
                    [sourceInvoiceId, profile.id],
                );
                if (!sourceInvoice) {
                    throw new Error('The source invoice must belong to the selected business.');
                }
            }

            const result = await db.execute(
                `INSERT INTO recurring_schedules
                 (client_id, description, frequency, currency_code, next_run_at, end_at,
                  auto_send, source_invoice_id, organization_id, user_id, business_profile_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [clientId, encryptValue(description), normalizedFrequency, currency, nextRunAt, endAt,
                 autoSend ? 1 : 0, sourceInvoiceId, req.user.organization_id ?? null,
                 req.user.id, profile.id],
            );
            await db.execute(
                `INSERT INTO schedule_price_history
                 (schedule_id, amount, effective_from) VALUES (?, ?, ?)`,
                [result.lastInsertRowid, Number(amount), nextRunAt],
            );
            const historicalIds = Array.isArray(historicalInvoiceIds)
                ? historicalInvoiceIds.filter(invoiceId => typeof invoiceId === 'string' && invoiceId)
                : [];
            if (historicalIds.length) {
                const placeholders = historicalIds.map(() => '?').join(', ');
                await db.execute(
                    `UPDATE invoices SET schedule_id = ?
                     WHERE id IN (${placeholders})
                       AND client_id = ?
                       AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`,
                    [result.lastInsertRowid, ...historicalIds, clientId,
                     req.user.organization_id, req.user.id],
                );
            }
            return db.maybeOne('SELECT * FROM recurring_schedules WHERE id = ?', [result.lastInsertRowid]);
        })();
        res.status(201).json({ ...created, description });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});
app.patch('/api/recurring/:id', async (req, res) => {
    const { status, nextRunAt } = req.body;
    if (status && !['active', 'paused'].includes(status))
        return res.status(400).json({ error: 'Invalid recurring schedule status.' });
    const schedule = await db.prepare(`SELECT * FROM recurring_schedules
        WHERE id = ? AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`)
        .get(req.params.id, req.user.organization_id, req.user.id);
    if (!schedule)
        return res.status(404).json({ error: 'Recurring schedule not found.' });
    const reachesEnd = nextRunAt && schedule.end_at && String(nextRunAt).slice(0, 10) > String(schedule.end_at).slice(0, 10);
    await db.prepare('UPDATE recurring_schedules SET status = COALESCE(?, status), next_run_at = COALESCE(?, next_run_at) WHERE id = ?').run(status || (reachesEnd ? 'completed' : null), nextRunAt || null, req.params.id);
    res.json(await db.prepare(`SELECT * FROM recurring_schedules
        WHERE id = ? AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`)
        .get(req.params.id, req.user.organization_id, req.user.id));
});
app.delete('/api/recurring/:id', async (req, res) => {
    const schedule = await db.prepare(`SELECT * FROM recurring_schedules
        WHERE id = ? AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`)
        .get(req.params.id, req.user.organization_id, req.user.id);
    if (!schedule)
        return res.status(404).json({ error: 'Recurring schedule not found.' });

    // Preserve a cancelled schedule only once it has issued or paid invoice
    // history. A schedule with no client-facing history can be removed safely.
    const issuedInvoiceCount = await db.prepare(`SELECT COUNT(*) AS count
        FROM invoices
        WHERE (schedule_id = ? OR id = ?)
          AND (status <> 'Draft' OR is_past = 1 OR paid_at IS NOT NULL)`)
        .get(schedule.id, schedule.source_invoice_id || null);
    if (Number(issuedInvoiceCount?.count || 0) > 0) {
        await db.prepare("UPDATE recurring_schedules SET status = 'cancelled' WHERE id = ?").run(schedule.id);
        const cancelledSchedule = await db.prepare('SELECT * FROM recurring_schedules WHERE id = ?').get(schedule.id);
        return res.json({ action: 'cancelled', schedule: cancelledSchedule });
    }

    await db.prepare('DELETE FROM recurring_schedules WHERE id = ?').run(schedule.id);
    return res.json({ action: 'deleted', id: schedule.id });
});
app.post('/api/recurring/run', async (_req, res) => {
    try {
        return res.json({ created: await runDueSchedules(db) });
    } catch (error) {
        console.error('Recurring run failed:', error);
        return res.status(500).json({ error: 'Recurring invoice generation failed.' });
    }
});
app.post('/api/recurring/:id/price', async (req, res) => { const { amount, effectiveFrom, priceChangeNote = false } = req.body; if (!(Number(amount) > 0) || !effectiveFrom)
    return res.status(400).json({ error: 'Enter a valid amount and effective date.' }); const schedule = await db.prepare('SELECT id FROM recurring_schedules WHERE id = ? AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))').get(req.params.id, req.user.organization_id, req.user.id); if (!schedule)
    return res.status(404).json({ error: 'Recurring schedule not found.' }); const result = await db.prepare('INSERT INTO schedule_price_history (schedule_id, amount, effective_from, price_change_note) VALUES (?, ?, ?, ?)').run(req.params.id, Number(amount), effectiveFrom, priceChangeNote ? 1 : 0); res.status(201).json(await db.prepare('SELECT * FROM schedule_price_history WHERE id = ?').get(result.lastInsertRowid)); });
// Render Cron authenticates as a service with the shared CRON_SECRET rather
// than using an interactive Kowope session.
app.post('/internal/cron/run', async (req, res) => {
    const authorizationHeader = req.get('authorization');
    const expectedAuthorization = process.env.CRON_SECRET
        ? `Bearer ${process.env.CRON_SECRET}`
        : null;
    if (!expectedAuthorization || authorizationHeader !== expectedAuthorization) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const recurringResult = await runDueSchedules(db);
        const backupResult = sqliteBackupDatabase
            ? await runScheduledBackup(sqliteBackupDatabase, databasePath)
            : { skipped: true, reason: 'Hosted PostgreSQL backup is configured separately.' };
        return res.json({ ok: true, recurring: recurringResult, backup: backupResult });
    }
    catch (error) {
        console.error('Cron execution failed:', error);
        return res.status(500).json({ error: 'Cron execution failed' });
    }
});
/** Update only the selected business's numbering settings; never wipe contact fields. */
app.patch('/api/business-profile/:id/invoice-numbering', async (req, res) => {
    const id = Number(req.params.id);
    const { invoicePrefix, invoiceNumberPadding, invoiceNumberFormat } = req.body;
    if (!Number.isSafeInteger(id) || id < 1 || typeof invoicePrefix !== 'string' ||
        typeof invoiceNumberFormat !== 'string' ||
        !Number.isInteger(Number(invoiceNumberPadding)) ||
        Number(invoiceNumberPadding) < 1 || Number(invoiceNumberPadding) > 10) {
        return res.status(400).json({ error: 'Invalid business invoice numbering settings.' });
    }
    try {
        validateInvoiceFormat(invoiceNumberFormat);
        const profile = await db.maybeOne(
            `SELECT id FROM business_profile WHERE id = ? AND
             (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`,
            [id, req.user.organization_id, req.user.id],
        );
        if (!profile) return res.status(404).json({ error: 'Business profile not found.' });
        await db.execute(
            `UPDATE business_profile
             SET invoice_prefix = ?, invoice_number_padding = ?, invoice_number_format = ?
             WHERE id = ?`,
            [invoicePrefix, Number(invoiceNumberPadding), invoiceNumberFormat, id],
        );
        const saved = await db.maybeOne('SELECT * FROM business_profile WHERE id = ?', [id]);
        res.json(decryptFields(saved, businessFields));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.patch('/api/business-profile/:id/default-currency', async (req, res) => {
    const id = Number(req.params.id);
    const defaultCurrency = String(req.body.defaultCurrency || '').trim().toUpperCase();
    if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z]{3}$/.test(defaultCurrency)) {
        return res.status(400).json({ error: 'Invalid business or currency code.' });
    }
    const profile = await db.maybeOne(
        `SELECT id FROM business_profile WHERE id = ? AND
         (organization_id = ? OR (organization_id IS NULL AND user_id = ?))`,
        [id, req.user.organization_id, req.user.id],
    );
    if (!profile) return res.status(404).json({ error: 'Business profile not found.' });
    await db.execute('UPDATE business_profile SET default_currency = ? WHERE id = ?', [defaultCurrency, id]);
    const saved = await db.maybeOne('SELECT * FROM business_profile WHERE id = ?', [id]);
    res.json(decryptFields(saved, businessFields));
});

app.get("/api/business-profile", async (req, res) => res.json(await getScopedBusinessProfile(req.user)));
app.get('/api/business-profiles', async (req, res) => res.json(await getScopedBusinessProfiles(req.user)));
app.get('/api/currencies', async (req, res) => res.json(await db.prepare('SELECT code, name, sign FROM currencies WHERE user_id IS NULL OR user_id = ? ORDER BY code').all(req.user.id)));
app.post('/api/currencies', async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    const sign = String(req.body.sign || '').trim();
    if (!/^[A-Z]{3}$/.test(code) || !name || !sign)
        return res.status(400).json({ error: 'Currency code, name, and sign are required.' });
    try {
        await db.prepare('INSERT INTO currencies (code, user_id, organization_id, name, sign) VALUES (?, ?, ?, ?, ?)').run(code, req.user.id, req.user.organization_id, name, sign);
        res.status(201).json(await db.prepare('SELECT code, name, sign FROM currencies WHERE code = ? AND user_id = ?').get(code, req.user.id));
    }
    catch (error) {
        res.status(409).json({ error: /unique|duplicate key/i.test(error.message) ? `${code} is already in your currency list.` : error.message });
    }
});
app.delete('/api/currencies/:code', async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (code === 'USD')
        return res.status(400).json({ error: 'USD cannot be removed.' });
    const defaultCurrency = (await getScopedBusinessProfile(req.user)).default_currency;
    if (code === defaultCurrency)
        return res.status(400).json({ error: 'Choose another default currency first.' });
    if (['USD', 'CAD', 'EUR'].includes(code))
        return res.status(400).json({ error: 'System currencies cannot be removed.' });
    await db.prepare('DELETE FROM currencies WHERE code = ? AND user_id = ?').run(code, req.user.id);
    res.status(204).end();
});
app.put("/api/business-profile", async (req, res) => {
    const { number: requestedNumber, name = "", address = "", email = "", phone = "", paymentInstructions = "", invoicePrefix = "INV-", invoiceNumberPadding = 4, invoiceNumberFormat = "{PREFIX}{YYYY}-{NUMBER}", preferredEmailProvider = null, defaultCurrency = 'USD', logoDataUrl, profileId = null, } = req.body;
    const logoWasProvided = Object.prototype.hasOwnProperty.call(req.body, 'logoDataUrl');
    const logoValue = logoDataUrl === null ? null : (logoWasProvided ? String(logoDataUrl || '') : null);
    if (logoValue !== null && Buffer.byteLength(logoValue, 'utf8') > 512 * 1024)
        return res.status(400).json({ error: 'Logo must be 512 KB or smaller.' });
    try {
        const defaultScopeColumn = req.user.organization_id ? 'organization_id' : 'user_id';
        const defaultScopeValue = req.user.organization_id || req.user.id;
        const existing = profileId
            ? await db.prepare(`
          SELECT id, organization_id, user_id
          FROM business_profile
          WHERE id = ?
            AND (organization_id = ? OR (organization_id IS NULL AND user_id = ?))
        `).get(profileId, req.user.organization_id || null, req.user.id) : null;
        if (profileId != null && profileId !== '' && !existing) {
            return res.status(404).json({ error: 'Selected business profile was not found.' });
        }
        try {
            validateInvoiceFormat(String(invoiceNumberFormat));
        } catch (validationError) {
            return res.status(400).json({ error: validationError.message });
        }
        const scopeColumn = existing ? (existing.organization_id ? 'organization_id' : 'user_id') : defaultScopeColumn;
        const scopeValue = existing ? (existing.organization_id || existing.user_id) : defaultScopeValue;
        const values = [encryptValue(name), encryptValue(address), encryptValue(email), encryptValue(phone), encryptValue(paymentInstructions), invoicePrefix, Math.min(10, Math.max(1, Number(invoiceNumberPadding) || 4)), invoiceNumberFormat || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider, defaultCurrency];
        let savedProfileId = existing?.id;
        if (savedProfileId) {
            const logoUpdate = logoWasProvided ? ', logo_data_url = ?' : '';
            const updateValues = logoWasProvided ? [...values, logoValue, savedProfileId, scopeValue] : [...values, savedProfileId, scopeValue];
            await db.prepare(`UPDATE business_profile SET name = ?, address = ?, email = ?, phone = ?, payment_instructions = ?, invoice_prefix = ?, invoice_number_padding = ?, invoice_number_format = ?, preferred_email_provider = ?, default_currency = ?${logoUpdate} WHERE id = ? AND ${scopeColumn} = ?`).run(...updateValues);
        }
        else {
            const result = await db.prepare(`INSERT INTO business_profile (organization_id, user_id, name, address, email, phone, payment_instructions, invoice_prefix, invoice_number_padding, invoice_number_format, preferred_email_provider, default_currency, logo_data_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.organization_id || null, req.user.organization_id ? null : req.user.id, ...values, logoWasProvided ? logoValue : null);
            savedProfileId = result.lastInsertRowid;
        }
        const savedProfile = await db.prepare('SELECT * FROM business_profile WHERE id = ?').get(savedProfileId);
        res.json(decryptFields(savedProfile, businessFields));
    }
    catch (error) {
        console.error('Business profile update failed:', error);
        res.status(500).json({ error: 'Unable to save the business profile.' });
    }
});
app.get("/api/clients", async (req, res) => res.json((await db
    .prepare(`SELECT c.*, COUNT(i.id) AS invoice_count, COALESCE(SUM(CASE WHEN i.status != 'Paid' THEN i.amount ELSE 0 END), 0) AS outstanding FROM clients c LEFT JOIN invoices i ON i.client_id = c.id WHERE c.created_by_user_id = ? GROUP BY c.id ORDER BY c.name`)
    .all(req.user.id)).map(decryptClient)));
app.get("/api/clients/:id/invoices", async (req, res) => res.json((await db
    .prepare("SELECT i.* FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.client_id = ? AND c.created_by_user_id = ? ORDER BY i.id DESC")
    .all(req.params.id, req.user.id)).map(decryptInvoice)));
app.post("/api/clients", async (req, res) => {
    const { name, email, company = "", address = "", phone = "", notes = "", } = req.body;
    if (!name || !email)
        return res
            .status(400)
            .json({ error: "Client name and email are required." });
    try {
        const clientId = crypto.randomUUID();
        const result = await db
            .prepare("INSERT INTO clients (id, name, email, company, address, phone, notes, organization_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(clientId, encryptValue(name), encryptValue(email), encryptValue(company), encryptValue(address), encryptValue(phone), encryptValue(notes), req.user.organization_id, req.user.id);
        res
            .status(201)
            .json(decryptClient(await db
            .prepare("SELECT * FROM clients WHERE id = ? AND created_by_user_id = ?")
            .get(clientId, req.user.id)));
    }
    catch (error) {
        res
            .status(409)
            .json({
            error: error.message.includes("UNIQUE")
                ? "A client with this email already exists."
                : error.message,
        });
    }
});
app.patch("/api/clients/:id", async (req, res) => {
    const { name, email, company = "", address = "", phone = "", notes = "", } = req.body;
    if (!name || !email)
        return res
            .status(400)
            .json({ error: "Client name and email are required." });
    try {
        await db.prepare("UPDATE clients SET name = ?, email = ?, company = ?, address = ?, phone = ?, notes = ? WHERE id = ? AND created_by_user_id = ?").run(encryptValue(name), encryptValue(email), encryptValue(company), encryptValue(address), encryptValue(phone), encryptValue(notes), req.params.id, req.user.id);
        res.json(decryptClient(await db.prepare("SELECT * FROM clients WHERE id = ? AND created_by_user_id = ?").get(req.params.id, req.user.id)));
    }
    catch (error) {
        res
            .status(409)
            .json({
            error: error.message.includes("UNIQUE")
                ? "A client with this email already exists."
                : error.message,
        });
    }
});
app.delete("/api/clients/:id", async (req, res) => {
    const linked = (await db
        .prepare("SELECT COUNT(*) AS count FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.client_id = ? AND c.created_by_user_id = ?")
        .get(req.params.id, req.user.id)).count;
    if (linked > 0)
        return res
            .status(409)
            .json({
            error: "This client has linked invoices and cannot be deleted.",
        });
    await db.prepare("DELETE FROM clients WHERE id = ? AND created_by_user_id = ?").run(req.params.id, req.user.id);
    res.status(204).end();
});
app.get("/api/invoices", async (req, res) => res.json((await db
    .prepare(req.user.organization_id
    ? "SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? ORDER BY i.created_at DESC"
    : "SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id IS NULL AND i.user_id = ? ORDER BY i.created_at DESC")
    .all(req.user.organization_id || req.user.id)).map(decryptInvoice)));
app.get('/api/invoices/:id', async (req, res) => {
    const invoice = decryptInvoice(await db.prepare(req.user.organization_id ? 'SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)' : 'SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id IS NULL AND i.user_id = ? AND (i.id = ? OR i.number = ?)').get(req.user.organization_id || req.user.id, req.params.id, req.params.id));
    if (!invoice)
        return res.status(404).json({ error: 'Invoice not found.' });
    invoice.lineItems = (await db.prepare('SELECT id, description, quantity, unit_price FROM line_items WHERE invoice_id = ? ORDER BY id').all(invoice.id)).map(item => ({ ...item, description: decryptValue(item.description) }));
    res.json(invoice);
});
app.post('/api/invoices', async (req, res) => {
    const {
        clientId, clientName, clientEmail, clientAddress = '',
        description, amount, dueDate, currency = 'USD',
        paymentInstructions = '', lineItems = [], issueDate = null,
        isPast = false, businessProfileId = null,
    } = req.body;

    if (!description || !(Number(amount) > 0)) {
        return res.status(400).json({ error: 'A description and positive invoice amount are required.' });
    }

    try {
        const invoice = await db.transaction(async () => {
            // A selected business is mandatory when several are accessible.
            const profile = await resolveInvoiceBusiness(db, {
                businessProfileId,
                organizationId: req.user.organization_id,
                userId: req.user.id,
            });

            let client = clientId ? await db.maybeOne(
                `SELECT * FROM clients WHERE id = ? AND
                  (organization_id = ? OR (organization_id IS NULL AND created_by_user_id = ?))`,
                [clientId, req.user.organization_id, req.user.id],
            ) : null;

            if (!client && !clientId && clientName && clientEmail) {
                const newClientId = crypto.randomUUID();
                await db.execute(
                    `INSERT INTO clients
                     (id, name, email, address, organization_id, created_by_user_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [newClientId, encryptValue(clientName), encryptValue(clientEmail),
                     encryptValue(clientAddress), req.user.organization_id ?? null, req.user.id],
                );
                client = await db.maybeOne('SELECT * FROM clients WHERE id = ?', [newClientId]);
            }
            if (!client) throw new Error('Select a client or provide recipient name and email.');

            // Ignore legacy req.body.number. All generated invoice identifiers
            // follow their owning business profile, with no client-side override.
            const number = await nextInvoiceNumber(db, profile, normalizeInvoiceDate(issueDate ?? new Date()));
            const invoiceId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO invoices (
                    id, number, client_id, client_name, client_email,
                    description, amount, currency, payment_instructions,
                    due_date, issue_date, is_past, organization_id, user_id,
                    business_profile_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [invoiceId, number, client.id, client.name, client.email,
                 encryptValue(description), Number(amount), currency,
                 encryptValue(paymentInstructions), dueDate || null,
                 issueDate || null, isPast ? 1 : 0,
                 req.user.organization_id ?? null, req.user.id, profile.id],
            );
            for (const item of Array.isArray(lineItems) ? lineItems : []) {
                if (item.description || Number(item.unitPrice) > 0) {
                    await db.execute(
                        `INSERT INTO line_items
                         (invoice_id, description, quantity, unit_price)
                         VALUES (?, ?, ?, ?)`,
                        [invoiceId, encryptValue(item.description || 'Line item'),
                         Number(item.quantity) || 1, Number(item.unitPrice) || 0],
                    );
                }
            }
            return db.one('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
        })();
        res.status(201).json(decryptInvoice(invoice));
    } catch (error) {
        console.error('Invoice creation failed:', error);
        const knownIssue = /business|client|invoice|profile|number|format|date|duplicate|unique/i.test(error.message);
        res.status(knownIssue ? 400 : 500).json({ error: knownIssue ? error.message : 'Unable to create invoice.' });
    }
});
app.patch('/api/invoices/:id', async (req, res) => {
    const invoice = await db.prepare('SELECT * FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
    if (!invoice)
        return res.status(404).json({ error: 'Invoice not found.' });
    const { clientId, description, amount, dueDate, currency = 'USD', paymentInstructions = '', lineItems = [] } = req.body;
    const client = clientId ? await db.prepare('SELECT * FROM clients WHERE id = ? AND organization_id = ?').get(clientId, req.user.organization_id) : null;
    if (!client || !description || !(Number(amount) > 0))
        return res.status(400).json({ error: 'Select a client and add at least one priced line item.' });
    const update = db.prepare('UPDATE invoices SET client_id = ?, client_name = ?, client_email = ?, description = ?, amount = ?, currency = ?, payment_instructions = ?, due_date = ? WHERE id = ?');
    const replaceItems = db.transaction(async () => {
        await update.run(client.id, encryptValue(client.name), encryptValue(client.email), encryptValue(description), Number(amount), currency, encryptValue(paymentInstructions), dueDate || null, invoice.id);
        await db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(invoice.id);
        const insertLineItem = db.prepare('INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
        for (const item of Array.isArray(lineItems) ? lineItems : []) {
            if (item.description || Number(item.unitPrice) > 0)
                await insertLineItem.run(invoice.id, encryptValue(item.description || 'Line item'), Number(item.quantity) || 1, Number(item.unitPrice) || 0);
        }
    });
    await replaceItems();
    res.json(decryptInvoice(await db.prepare('SELECT * FROM invoices WHERE id = ? AND organization_id = ?').get(invoice.id, req.user.organization_id)));
});
app.patch('/api/invoices/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['Draft', 'Sent', 'Paid', 'Overdue'].includes(status))
        return res.status(400).json({ error: 'Invalid invoice status.' });
    const invoice = await db.prepare('SELECT * FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
    if (!invoice)
        return res.status(404).json({ error: 'Invoice not found.' });
    await db.prepare('UPDATE invoices SET status = ?, sent_at = CASE WHEN ? = \'Sent\' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ?').run(status, status, invoice.id);
    res.json(decryptInvoice(await db.prepare('SELECT * FROM invoices WHERE id = ? AND organization_id = ?').get(invoice.id, req.user.organization_id)));
});
app.delete('/api/invoices/:id', async (req, res) => {
    const invoice = await db.prepare('SELECT id FROM invoices WHERE organization_id = ? AND (id = ? OR number = ?)').get(req.user.organization_id, req.params.id, req.params.id);
    if (!invoice)
        return res.status(404).json({ error: 'Invoice not found.' });
    await db.prepare('DELETE FROM invoices WHERE id = ? AND organization_id = ?').run(invoice.id, req.user.organization_id);
    res.status(204).end();
});
app.post('/api/payments', async (req, res) => {
    const { invoiceId, method = 'Manual', date, amount } = req.body;
    const invoice = await db.prepare('SELECT * FROM invoices WHERE (user_id = ? OR organization_id = ?) AND (id = ? OR number = ?)').get(req.user.id, req.user.organization_id, invoiceId, invoiceId);
    //console.log("Creating payment:", { invoice });
    if (!invoice)
        return res.status(404).json({ error: 'Invoice not found.' });
    if (!date || !(Number(amount) > 0))
        return res.status(400).json({ error: 'Payment date and amount are required.' });
    const result = await db.prepare('INSERT INTO payments (invoice_id, client_id, date, source, method, amount, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(invoice.id, invoice.client_id, date, 'Manual', method, Number(amount), req.user.organization_id);
    await db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(invoice.id);
    res.status(201).json(await db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid));
});
app.get('/api/payments', async (req, res) => res.json(await db.prepare('SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.organization_id = ? ORDER BY p.id DESC').all(req.user.organization_id)));
async function createPdf(invoice) {
    const business = invoice.business ? decryptFields(invoice.business, businessFields) : (await getBusinessProfile(invoice.organization_id, invoice.user_id, invoice.business_profile_id)) || {};
    const logoDataUrl = invoice.business?.logoDataUrl || invoice.business?.logo_data_url || business.logo_data_url || '';
    const lineItems = invoice.lineItems || (invoice.id ? (await db.prepare('SELECT description, quantity, unit_price AS "unitPrice" FROM line_items WHERE invoice_id = ? ORDER BY id').all(invoice.id)).map(item => ({ ...item, description: decryptValue(item.description) })) : []);
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({ margin: 56, size: 'LETTER' });
        doc.on('error', reject);
        const items = lineItems.length ? lineItems : [{ description: invoice.description || 'Line item', quantity: 1, unitPrice: Number(invoice.amount) || 0 }];
        const lineItemSubtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitPrice || 0), 0);
        const subtotal = Number.isFinite(Number(invoice.subtotal)) ? Number(invoice.subtotal) : lineItemSubtotal;
        const discount = Number.isFinite(Number(invoice.discount)) ? Number(invoice.discount) : 0;
        const taxAmount = Number.isFinite(Number(invoice.taxAmount)) ? Number(invoice.taxAmount) : 0;
        const total = Number.isFinite(Number(invoice.amount)) ? Number(invoice.amount) : subtotal - discount + taxAmount;
        const currencySymbols = { USD: '$', CAD: 'CA$', EUR: '€', GBP: '£', NGN: '₦' };
        const currencyCode = String(invoice.currency || 'USD').toUpperCase();
        const currencySymbol = String(invoice.currencySymbol || currencySymbols[currencyCode] || `${currencyCode} `);
        const money = value => `${currencySymbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const date = value => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set';
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        const left = 56, right = doc.page.width - 56, width = right - left;
        const ink = '#1b1a24', muted = '#5f5c6e', rule = '#cfccd8';
        const clientAddress = [invoice.client_address, invoice.client_email, invoice.client_phone].filter(Boolean).join('\n');
        const businessContact = [business.address, business.email, business.phone].filter(Boolean).join('\n');
        if (/^data:image\/(png|jpe?g|webp);base64,/i.test(logoDataUrl)) {
            try {
                doc.image(Buffer.from(logoDataUrl.split(',')[1], 'base64'), left, 54, { fit: [56, 56] });
            }
            catch { /* invalid optional logo does not prevent invoice generation */ }
        }
        const businessNameX = logoDataUrl ? left + 68 : left;
        doc.font('Times-Bold').fontSize(25).fillColor(ink).text(business.name || 'Your business', businessNameX, 58, { width: 235 });
        doc.font('Times-Bold').fontSize(30).fillColor(ink).text('INVOICE', 350, 58, { width: right - 350, align: 'right' });
        doc.font('Times-Roman').fontSize(11).fillColor(muted).text(`No. ${invoice.number || 'PREVIEW'}`, 350, 96, { width: right - 350, align: 'right' });
        const headerContactTop = 124;
        doc.font('Times-Roman').fontSize(10).fillColor(muted).text(businessContact, left, headerContactTop, { width: 235 });
        const headerBottom = Math.max(headerContactTop + doc.heightOfString(businessContact || ' ', { width: 235 }), 150);
        let y = headerBottom + 18;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).strokeColor(ink).stroke();
        y += 26;

        const clientWidth = 250;
        const metaWidth = 190;
        doc.font('Times-Italic').fontSize(11).fillColor(muted).text('Billed to', left, y);
        const clientName = invoice.client_name || 'Client not selected';
        const clientNameTop = y + 18;
        doc.font('Times-Bold').fontSize(16).fillColor(ink).text(clientName, left, clientNameTop, { width: clientWidth });
        const clientContactTop = clientNameTop + doc.heightOfString(clientName, { width: clientWidth }) + 6;
        doc.font('Times-Roman').fontSize(10).fillColor(muted).text(clientAddress, left, clientContactTop, { width: clientWidth });
        const metadata = [
            ['Date of issue', date(invoice.created_at?.slice(0, 10))],
            ['Due date', date(invoice.due_date)],
            ['Currency', currencyCode],
        ];
        const metadataX = right - metaWidth;
        metadata.forEach(([label, value], index) => {
            const rowY = y + index * 22;
            doc.font('Times-Roman').fontSize(10).fillColor(muted).text(label, metadataX, rowY);
            doc.fillColor(ink).text(value, metadataX + 82, rowY, { width: metaWidth - 82, align: 'right' });
        });
        const bodyBottom = Math.max(clientContactTop + doc.heightOfString(clientAddress || ' ', { width: clientWidth }), y + metadata.length * 22);
        y = bodyBottom + 24;

        doc.rect(left, y, width, 42).lineWidth(1).strokeColor(ink).stroke();
        doc.font('Times-Roman').fontSize(12).fillColor(ink).text(`Amount due by ${date(invoice.due_date)}`, left + 14, y + 14);
        doc.font('Times-Bold').fontSize(18).text(money(total), right - 155, y + 10, { width: 140, align: 'right' });
        y += 66;

        const columns = { number: left, description: left + 32, quantity: right - 194, unitPrice: right - 128, amount: right - 60 };
        doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(ink).stroke();
        doc.font('Times-Bold').fontSize(10).fillColor(ink)
            .text('No.', columns.number + 4, y + 10)
            .text('Description', columns.description, y + 10)
            .text('Qty', columns.quantity, y + 10, { width: 44, align: 'right' })
            .text('Unit price', columns.unitPrice, y + 10, { width: 62, align: 'right' })
            .text('Amount', columns.amount, y + 10, { width: 60, align: 'right' });
        y += 30;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(ink).stroke();
        doc.font('Times-Roman').fontSize(10);
        items.forEach((item, index) => {
            const itemAmount = Number(item.quantity || 1) * Number(item.unitPrice || 0);
            const descriptionHeight = Math.max(26, doc.heightOfString(item.description || 'Line item', { width: columns.quantity - columns.description - 12 }) + 16);
            doc.fillColor(ink)
                .text(String(index + 1), columns.number + 4, y + 9)
                .text(item.description || 'Line item', columns.description, y + 9, { width: columns.quantity - columns.description - 12 })
                .text(String(item.quantity || 1), columns.quantity, y + 9, { width: 44, align: 'right' })
                .text(money(item.unitPrice), columns.unitPrice, y + 9, { width: 62, align: 'right' })
                .text(money(itemAmount), columns.amount, y + 9, { width: 60, align: 'right' });
            y += descriptionHeight;
            doc.moveTo(left, y).lineTo(right, y).lineWidth(.5).strokeColor(rule).stroke();
        });

        const totalsLeft = right - 185;
        y += 18;
        const totalRows = [
            ['Subtotal', money(subtotal)],
            ['Discount', `-${money(discount)}`],
            [`${invoice.taxName || 'Tax'} ${Number(invoice.taxRate || 0)}%`, money(taxAmount)],
        ];
        totalRows.forEach(([label, value]) => {
            doc.font('Times-Roman').fontSize(11).fillColor(ink).text(label, totalsLeft, y, { width: 90 });
            doc.font('Times-Bold').text(value, totalsLeft + 90, y, { width: 95, align: 'right' });
            y += 24;
        });
        doc.moveTo(totalsLeft, y).lineTo(right, y).lineWidth(1).strokeColor(ink).stroke();
        y += 12;
        doc.font('Times-Bold').fontSize(15).fillColor(ink).text('Total due', totalsLeft, y).text(money(total), totalsLeft + 90, y, { width: 95, align: 'right' });
        y += 56;
        doc.font('Times-Bold').fontSize(11).fillColor(ink).text('Payment terms and instructions', left, y);
        const terms = `Payment is due on ${date(invoice.due_date)}.${invoice.payment_instructions ? `\n${invoice.payment_instructions}` : ''}`;
        doc.font('Times-Roman').fontSize(10).fillColor(muted).text(terms, left, y + 20, { width });
        const footerY = Math.max(y + 20 + doc.heightOfString(terms, { width }) + 26, 690);
        doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(.5).strokeColor(rule).stroke();
        doc.font('Times-Italic').fontSize(10).fillColor(muted).text('Thank you for your business.', left, footerY + 14, { width, align: 'center' });
        doc.font('Times-Roman').text(`${business.name || 'Your business'}${business.email ? ` · ${business.email}` : ''}`, left, footerY + 30, { width, align: 'center' });
        doc.end();
    });
}
app.get("/api/invoices/:id/pdf", async (req, res) => {
    const invoice = decryptInvoice(await db
        .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)")
        .get(req.user.organization_id, req.params.id, req.params.id));
    if (!invoice)
        return res.status(404).json({ error: "Invoice not found." });
    const pdf = await createPdf(invoice);
    res
        .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    })
        .send(pdf);
});
app.post('/api/invoices/preview/pdf', async (req, res) => {
    const invoice = { number: req.body.number || 'PREVIEW', client_name: req.body.clientName || 'Client', client_email: req.body.clientEmail || '', client_address: req.body.clientAddress || '', description: req.body.description || 'Line item', lineItems: req.body.lineItems || [], business: req.body.business || null, amount: Number(req.body.amount || 0), subtotal: Number(req.body.subtotal), discount: Number(req.body.discount), taxAmount: Number(req.body.taxAmount), taxName: req.body.taxName || 'Tax', taxRate: Number(req.body.taxRate || 0), currency: req.body.currency || 'USD', currencySymbol: req.body.currencySymbol || '', due_date: req.body.dueDate || null, created_at: new Date().toISOString(), payment_instructions: req.body.paymentInstructions || '' };
    const pdf = await createPdf(invoice);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` }).send(pdf);
});
app.post("/api/invoices/:id/send", async (req, res) => {
    const invoice = decryptInvoice(await db
        .prepare("SELECT i.*, c.address AS client_address FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.organization_id = ? AND (i.id = ? OR i.number = ?)")
        .get(req.user.organization_id, req.params.id, req.params.id));
    if (!invoice)
        return res.status(404).json({ error: "Invoice not found." });
    const preferredProvider = (await getBusinessProfile(invoice.organization_id, invoice.user_id, invoice.business_profile_id))?.preferred_email_provider;
    const emailIntegration = await db.prepare("SELECT * FROM integrations WHERE provider IN ('mailjet', 'outlook', 'gmail') AND status = 'connected' ORDER BY CASE WHEN provider = ? THEN 0 WHEN provider = 'mailjet' THEN 1 WHEN provider = 'outlook' THEN 2 WHEN provider = 'gmail' THEN 3 ELSE 4 END, connected_at DESC LIMIT 1").get(preferredProvider || '');
    const savedMailConfig = emailIntegration ? JSON.parse(decryptValue(emailIntegration.config_json || '{}')) : {};
    const businessProfile = await getBusinessProfile(invoice.organization_id, invoice.user_id, invoice.business_profile_id) || {};
    const transientLogoDataUrl = typeof req.body?.logoDataUrl === 'string' ? req.body.logoDataUrl : '';
    const invoiceForDelivery = transientLogoDataUrl
        ? { ...invoice, business: { ...businessProfile, logoDataUrl: transientLogoDataUrl } }
        : invoice;
    const businessName = businessProfile.name || process.env.BUSINESS_NAME || 'Your business';
    const userTemplate = await userEmailTemplate(req.user.id, 'invoice');
    const platformTemplate = await platformEmailTemplate('invoice');
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
            if (!graphResponse.ok) {
                const graphError = await graphResponse.text();
                return res.status(502).json({ error: `Microsoft Graph rejected the message: ${graphError}` });
            }
            await db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
            return res.json({ ok: true, message: `Invoice ${invoice.number} sent to ${invoice.client_email}.` });
        }
        catch (error) {
            return res.status(502).json({ error: error.message });
        }
    }
    if (emailIntegration?.provider === 'mailjet' && savedMailConfig.authType === 'mailjet') {
        try {
            const pdf = await createPdf(invoiceForDelivery);
            const authorization = Buffer.from(`${savedMailConfig.apiKey}:${savedMailConfig.secretKey}`).toString('base64');
            const mailjetResponse = await fetch('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Messages: [{ From: { Email: savedMailConfig.senderEmail, Name: savedMailConfig.fromName || savedMailConfig.senderName || businessName }, To: [{ Email: invoice.client_email, Name: invoice.client_name }], Subject: templateSubject, TextPart: templateMessage, Attachments: [{ ContentType: 'application/pdf', Filename: `${invoice.number}.pdf`, Base64Content: pdf.toString('base64') }] }] }) });
            if (!mailjetResponse.ok) {
                const mailjetError = await mailjetResponse.text();
                return res.status(502).json({ error: `Mailjet rejected the message: ${mailjetError}` });
            }
            await db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
            return res.json({ ok: true, message: `Invoice ${invoice.number} sent to ${invoice.client_email}.` });
        }
        catch (error) {
            return res.status(502).json({ error: error.message });
        }
    }
    if (!smtpHost || !smtpUser || !smtpPass)
        return res
            .status(400)
            .json({
            error: "Email is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and INVOICE_FROM to .env.",
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
        await db.prepare("UPDATE invoices SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoice.id);
        res.json({
            ok: true,
            message: `Invoice ${invoice.number} sent to ${invoice.client_email}.`,
        });
    }
    catch (error) {
        res.status(500).json({ error: `Email failed: ${error.message}` });
    }
});
if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../dist")));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
}
app.listen(port, '0.0.0.0', () => console.log(`Invoice API running on http://localhost:${port}`));
