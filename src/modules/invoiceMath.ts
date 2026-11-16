import { state } from './store.ts';
import { today, formatDate, stepFrequency } from './date.ts';

/** Single source of truth for the invoice editor and preview totals. */
export function calcInvoice(editor = state.invoiceEditor) {
  if (!editor) return { subtotal: 0, discount: 0, taxAmount: 0, total: 0 };
  const subtotal = (editor.lineItems || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const rawDiscount = editor.discountType === '%'
    ? subtotal * Number(editor.discountValue || 0) / 100
    : Number(editor.discountValue || 0);
  const discount = Math.min(Math.max(rawDiscount, 0), Math.max(0, subtotal));
  const taxAmount = (subtotal - discount) * Number(editor.tax || 0) / 100;
  return { subtotal, discount, taxAmount, total: subtotal - discount + taxAmount };
}

export function recurringSummary(editor = state.invoiceEditor) {
  if (!editor) return '';
  const dates = [1, 2, 3].map(offset =>
    formatDate(stepFrequency(today, editor.frequency, offset))).join(', ');
  const ending = editor.recurrenceEnd !== 'Never'
    ? ` · ends after ${editor.recurrenceEnd?.split(' ')[1]} runs` : '';
  return `Next 3 invoices: ${dates}${ending}${editor.autoSend
    ? ' · sent automatically' : ' · created as drafts'}`;
}
