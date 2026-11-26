/**
 * Normalize the discount input that is stored with a saved invoice.
 *
 * The UI has always used '%' for a percentage discount and '$' for a fixed
 * amount. Keep those values at the persistence boundary so existing editor
 * behavior and saved drafts remain compatible.
 */
export function normalizeInvoiceDiscount(discountValue = 0, discountType = '%') {
  const value = Number(discountValue)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Discount value must be a non-negative number.')
  }
  if (!['%', '$'].includes(discountType)) {
    throw new Error('Discount type must be percentage or a fixed amount.')
  }
  return { discountValue: value, discountType }
}

/** Calculate the applied amount while ensuring a discount cannot exceed subtotal. */
export function calculateDiscountAmount({ subtotal, discountValue = 0, discountType = '%' }) {
  const normalizedSubtotal = Math.max(0, Number(subtotal) || 0)
  const value = Math.max(0, Number(discountValue) || 0)
  const rawDiscount = discountType === '%' ? normalizedSubtotal * value / 100 : value
  return Math.min(rawDiscount, normalizedSubtotal)
}

/**
 * Produce the immutable financial breakdown stored with an invoice. This is
 * intentionally called only when an invoice is created or updated; rendering
 * a downloaded or emailed document reads the stored values directly.
 */
export function calculateInvoiceSnapshot({
  lineItems = [],
  discountValue = 0,
  discountType = '%',
  taxName = 'Tax',
  taxRate = 0,
}) {
  const normalizedDiscount = normalizeInvoiceDiscount(discountValue, discountType)
  const normalizedTaxRate = Number(taxRate)
  if (!Number.isFinite(normalizedTaxRate) || normalizedTaxRate < 0) {
    throw new Error('Tax rate must be a non-negative number.')
  }
  const subtotalAmount = lineItems.reduce((sum, item) =>
    sum + Number(item.quantity || 0) * Number(item.unitPrice ?? item.unit_price ?? 0), 0)
  const discountAmount = calculateDiscountAmount({
    subtotal: subtotalAmount,
    ...normalizedDiscount,
  })
  const taxAmount = (subtotalAmount - discountAmount) * normalizedTaxRate / 100
  return {
    subtotalAmount,
    discountValue: normalizedDiscount.discountValue,
    discountType: normalizedDiscount.discountType,
    discountAmount,
    taxName: String(taxName || 'Tax'),
    taxRate: normalizedTaxRate,
    taxAmount,
    amount: subtotalAmount - discountAmount + taxAmount,
  }
}
