/**
 * Kowope's ONE invoice-numbering implementation.
 *
 * Business profiles store the policy. Both POST /api/invoices and the
 * recurrence worker call this module, inside their database transaction.
 * The database adapter must provide many(), maybeOne(), and execute().
 */

export const DEFAULT_INVOICE_FORMAT = '{PREFIX}{YYYY}-{NUMBER}'
const ALLOWED_TOKENS = new Set(['PREFIX', 'YYYY', 'YY', 'NUMBER'])

export function validateInvoiceFormat(template) {
  if (typeof template !== 'string' || template.length === 0 || template.length > 200) {
    throw new Error('Invoice format must be between 1 and 200 characters.')
  }

  const placeholders = template.match(/\{[^{}]*\}/g) ?? []
  for (const placeholder of placeholders) {
    if (!ALLOWED_TOKENS.has(placeholder.slice(1, -1))) {
      throw new Error(`Unsupported invoice format token: ${placeholder}`)
    }
  }

  // Reject unbalanced or nested braces instead of silently persisting a typo.
  const literalPart = template.replace(/\{[^{}]*\}/g, '')
  if (literalPart.includes('{') || literalPart.includes('}')) {
    throw new Error('Invoice format contains an invalid brace expression.')
  }
  if (!template.includes('{NUMBER}')) {
    throw new Error('Automatic numbering requires the {NUMBER} token.')
  }
  return template
}

export function normalizeInvoiceDate(value = new Date()) {
  const dateString = value instanceof Date ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error('Invoice issue date must be a YYYY-MM-DD date.')
  }
  const parsed = new Date(`${dateString}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateString) {
    throw new Error(`Invalid invoice issue date: ${dateString}`)
  }
  return dateString
}

export function formatInvoiceNumber(profile, sequenceNumber, issueDate = new Date()) {
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new Error('Invoice sequence must be a positive safe integer.')
  }
  if (!profile || profile.id == null) {
    throw new Error('A saved business profile is required to generate invoices.')
  }

  const date = normalizeInvoiceDate(issueDate)
  const prefix = String(profile.invoice_prefix ?? 'INV-')
  const format = validateInvoiceFormat(
    String(profile.invoice_number_format ?? DEFAULT_INVOICE_FORMAT),
  )
  const configuredPadding = Number(profile.invoice_number_padding ?? 4)
  const padding = Number.isFinite(configuredPadding)
    ? Math.min(10, Math.max(1, Math.trunc(configuredPadding))) : 4
  const year = date.slice(0, 4)
  const replacements = {
    PREFIX: prefix,
    YYYY: year,
    YY: year.slice(-2),
    NUMBER: String(sequenceNumber).padStart(padding, '0'),
  }

  return format.replace(/\{(PREFIX|YYYY|YY|NUMBER)\}/g, (_match, key) => replacements[key])
}

/**
 * Fetch the explicitly selected business, not the first business in an org.
 * A legacy request with no profile ID is safe only when the user has exactly
 * one accessible profile. Never silently choose the first of many profiles.
 */
export async function resolveInvoiceBusiness(database, {
  businessProfileId = null,
  organizationId = null,
  userId = null,
} = {}) {
  if (organizationId == null && userId == null) {
    throw new Error('Missing business owner scope.')
  }

  const profiles = await database.many(
    `SELECT id, invoice_prefix, invoice_number_padding, invoice_number_format,
            organization_id, user_id
       FROM business_profile
      WHERE (organization_id = ? OR (organization_id IS NULL AND user_id = ?))
      ORDER BY id`,
    [organizationId, userId],
  )

  if (businessProfileId !== null && businessProfileId !== undefined && businessProfileId !== '') {
    const id = Number(businessProfileId)
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error('Invalid businessProfileId.')
    }
    const selected = profiles.find(profile => Number(profile.id) === id)
    if (!selected) throw new Error('Business profile was not found or access was denied.')
    return selected
  }

  if (profiles.length === 1) return profiles[0]
  if (profiles.length === 0) throw new Error('Create a business profile before generating invoices.')
  throw new Error('Multiple business profiles exist. Select businessProfileId for this invoice or schedule.')
}

/**
 * Allocate an invoice identifier atomically from THIS business's sequence.
 * Must be called within db.transaction(...). Two callers racing for the same
 * business increment the same row; neither can allocate the same sequence.
 *
 * Invoice numbers are unique only for the issuing business profile. This
 * permits independent businesses to use the same external-facing number.
 */
export async function nextInvoiceNumber(database, businessProfile, issueDate) {
  if (!businessProfile || !Number.isSafeInteger(Number(businessProfile.id))) {
    throw new Error('Valid business profile required for invoice allocation.')
  }

  if (typeof database.lockInvoiceNumbering !== 'function') {
    throw new Error('The database adapter must implement lockInvoiceNumbering().')
  }
  await database.lockInvoiceNumbering(Number(businessProfile.id))

  for (let attempts = 0; attempts < 10000; attempts += 1) {
    const allocation = await database.maybeOne(
      `INSERT INTO invoice_sequences (business_profile_id, next_value)
       VALUES (?, 2)
       ON CONFLICT (business_profile_id)
       DO UPDATE SET next_value = invoice_sequences.next_value + 1
       RETURNING next_value - 1 AS allocated`,
      [businessProfile.id],
    )
    const sequenceNumber = Number(allocation?.allocated)
    const number = formatInvoiceNumber(businessProfile, sequenceNumber, issueDate)

    // Manual past invoices may already use a number produced by this profile's
    // format, so only this profile's existing invoices block an allocation.
    const occupied = await database.maybeOne(
      'SELECT id FROM invoices WHERE business_profile_id = ? AND number = ?',
      [businessProfile.id, number],
    )
    if (!occupied) return number
  }
  throw new Error('No available invoice number after 10,000 allocations.')
}
