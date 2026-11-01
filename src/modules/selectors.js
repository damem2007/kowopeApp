import { state } from './store.js'
import { today } from './date.js'

export const $ = selector => document.querySelector(selector)
export const invoiceStatus = invoice => invoice.s === "Sent" && invoice.due < today ? "Overdue" : invoice.s
export const sum = invoiceFilter => state.invoices.filter(invoiceFilter).reduce((total, invoice) => total + invoice.a, 0)
export const isMail = () => state.integrations.gmail.on || state.integrations.outlook.on || state.integrations.mailjet?.on
