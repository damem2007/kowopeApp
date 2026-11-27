import { state } from './store.ts'
import { today } from './date.ts'

export const querySelector = (selector: string): any => document.querySelector(selector)
export const invoiceStatus = invoice => invoice.s === "Sent" && invoice.due < today ? "Overdue" : invoice.s
export const sum = invoiceFilter => state.invoices.filter(invoiceFilter).reduce((total, invoice) => total + invoice.a, 0)
export const isMail = () => state.integrations.gmail.on || state.integrations.outlook.on || state.integrations.mailjet?.on

const paymentMatchesInvoice = (payment, invoice) => String(payment.invoiceId || '') === String(invoice.id)
  || (!payment.invoiceId && payment.inv === invoice.number && payment.c === invoice.c)

export const invoiceOutstanding = invoice => {
  if (!['Sent', 'Overdue'].includes(invoiceStatus(invoice))) return 0
  const paidAmount = state.payments
    .filter(payment => paymentMatchesInvoice(payment, invoice))
    .reduce((total, payment) => total + Number(payment.a || 0), 0)
  return Math.max(0, Number(invoice.a || 0) - paidAmount)
}

export const currencyTotals = (invoices, amountForInvoice = invoice => invoice.a) => invoices.reduce((totals, invoice) => {
  const currency = invoice.cur || 'USD'
  totals[currency] = (totals[currency] || 0) + Number(amountForInvoice(invoice) || 0)
  return totals
}, {})
