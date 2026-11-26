import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDiscountAmount, calculateInvoiceSnapshot, normalizeInvoiceDiscount } from '../server/services/invoice-discounts.js'

test('invoice discounts retain their entered value and mode', () => {
  assert.deepEqual(normalizeInvoiceDiscount(50, '$'), { discountValue: 50, discountType: '$' })
  assert.deepEqual(normalizeInvoiceDiscount('12.5', '%'), { discountValue: 12.5, discountType: '%' })
})

test('invoice discounts calculate fixed and percentage amounts without exceeding the subtotal', () => {
  assert.equal(calculateDiscountAmount({ subtotal: 1037.5, discountValue: 50, discountType: '$' }), 50)
  assert.equal(calculateDiscountAmount({ subtotal: 1037.5, discountValue: 10, discountType: '%' }), 103.75)
  assert.equal(calculateDiscountAmount({ subtotal: 100, discountValue: 150, discountType: '$' }), 100)
})

test('invoice discounts reject invalid persisted input at the API boundary', () => {
  assert.throws(() => normalizeInvoiceDiscount(-1, '$'), /non-negative/)
  assert.throws(() => normalizeInvoiceDiscount(10, 'fixed'), /percentage or a fixed amount/)
})

test('invoice snapshots preserve the complete calculated breakdown', () => {
  assert.deepEqual(calculateInvoiceSnapshot({
    lineItems: [{ quantity: 21.5, unitPrice: 25 }, { quantity: 20, unitPrice: 25 }],
    discountValue: 50,
    discountType: '$',
    taxName: 'Tax',
    taxRate: 0,
  }), {
    subtotalAmount: 1037.5,
    discountValue: 50,
    discountType: '$',
    discountAmount: 50,
    taxName: 'Tax',
    taxRate: 0,
    taxAmount: 0,
    amount: 987.5,
  })
})
