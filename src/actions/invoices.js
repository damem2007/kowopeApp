import { state } from '../modules/store.js'
import { today } from '../modules/date.js'
import { $ } from '../modules/selectors.js'
import { isMail } from '../modules/selectors.js'
import { saveBlob } from '../modules/download.js'
import { render, toast } from '../ui/render.js'
import { sample, calc } from '../pages/editor.js'
import { wiz } from './integrations.js'

export function newInv() { state.invoiceEditor = sample(); state.currentRoute = "new"; render(); scrollTo(0, 0) }

export const editDraft = async id => {
  const summary = state.invoices.find(invoice => invoice.id === id)
  if (!summary || summary.s !== 'Draft') return toast('Only draft invoices can be edited.')
  try {
    const response = await fetch(`/api/invoices/${encodeURIComponent(id)}`)
    const invoice = await response.json()
    if (!response.ok) throw new Error(invoice.error || 'Unable to load draft')
    const editor = sample()
    const clientIndex = state.clientIds.findIndex(clientId => clientId === invoice.client_id)
    editor.invoiceId = id
    editor.clientIndex = clientIndex >= 0 ? String(clientIndex) : ''
    editor.businessIndex = 0
    editor.due = invoice.due_date || ''
    editor.pre = 0
    editor.cur = invoice.currency || state.defaultCurrency
    editor.n = invoice.payment_instructions || ''
    editor.items = Array.isArray(invoice.lineItems) && invoice.lineItems.length
      ? invoice.lineItems.map(item => ({ d: item.description || '', q: Number(item.quantity) || 1, p: Number(item.unit_price) || 0 }))
      : [{ d: invoice.description || '', q: 1, p: Number(invoice.amount) || 0 }]
    state.invoiceEditor = editor
    state.currentRoute = 'new'
    render()
    scrollTo(0, 0)
  } catch (error) { toast(error.message) }
}

export const markPaid = async id => {
  const invoice = state.invoices.find(candidate => candidate.id === id); if (!invoice) return
  try {
    const response = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: id, method: 'Manual', date: today, amount: invoice.a }) })
    const payment = await response.json(); if (!response.ok) throw new Error(payment.error || 'Unable to mark invoice paid')
    invoice.s = 'Paid'; state.payments.push({ d: payment.date, inv: id, c: invoice.c, m: payment.method || 'Manual', a: Number(payment.amount) }); state.openMenuIndex = 0; toast(id + ' marked paid')
  } catch (error) { toast(error.message) }
}
export const send = async id => {
   if (!isMail()) {
    toast("Connect an email account first."); return wiz("gmail")
  }
  const invoice = state.invoices.find(candidate => candidate.id === id)
  try {
    const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/send`, { method: 'POST' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to send invoice')
    if (invoice) invoice.s = 'Sent'
    toast(id + ' sent')
  } catch (error) { toast(error.message) }
}
export const dup = async id => {
  const sourceInvoice = state.invoices.find(candidate => candidate.id === id)
  if (!sourceInvoice) return toast('Unable to duplicate invoice')
  try {
    const sourceResponse = await fetch(`/api/invoices/${encodeURIComponent(id)}`)
    const sourceDetails = await sourceResponse.json()
    if (!sourceResponse.ok) throw new Error(sourceDetails.error || 'Unable to load invoice')
    const lineItems = Array.isArray(sourceDetails.lineItems) && sourceDetails.lineItems.length
      ? sourceDetails.lineItems.map(lineItem => ({ description: lineItem.description, quantity: lineItem.quantity, unitPrice: lineItem.unit_price }))
      : [{ description: sourceDetails.description, quantity: 1, unitPrice: Number(sourceDetails.amount) || 0 }]
    const duplicatePayload = {
      clientId: sourceDetails.client_id,
      description: sourceDetails.description,
      amount: Number(sourceDetails.amount),
      dueDate: sourceDetails.due_date || null,
      currency: sourceDetails.currency || 'USD',
      paymentInstructions: sourceDetails.payment_instructions || '',
      lineItems,
    }
    const duplicateResponse = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicatePayload) })
    const duplicateInvoice = await duplicateResponse.json()
    if (!duplicateResponse.ok) throw new Error(duplicateInvoice.error || 'Unable to duplicate invoice')
    const clientIndex = state.clientIds.findIndex(clientId => clientId === sourceDetails.client_id)
    state.invoices.push({ id: duplicateInvoice.number, c: clientIndex, a: Number(duplicateInvoice.amount), due: duplicateInvoice.due_date || '', s: duplicateInvoice.status || 'Draft', rec: false, cur: duplicateInvoice.currency || 'USD', n: duplicateInvoice.payment_instructions || '' })
    toast(`${duplicateInvoice.number} duplicated as draft`)
  } catch (error) { toast(error.message) }
}
export const del = async id => {
  try {
    const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to delete invoice')
    const index = state.invoices.findIndex(invoice => invoice.id === id);
    if (index >= 0) state.invoices.splice(index, 1);
    toast(id + ' deleted')
  } catch (error) { toast(error.message) }
}

export const downloadInvoice = async id => {
  const response = await fetch(`/api/invoices/${id}/pdf`)
  if (!response.ok) return toast('Unable to download invoice')
  saveBlob(await response.blob(), `${id}.pdf`)
  toast(id + ' downloaded')
}

export const downloadPreviewPdf = async () => {
  const editor = state.invoiceEditor, totals = calc(), clientDetails = editor.clientIndex !== '' ? state.clientDetails[editor.clientIndex] : {}
  const response = await fetch('/api/invoices/preview/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: `INV-000${state.invoices.length + 1}`, clientName: editor.clientIndex !== '' ? state.clientNames[editor.clientIndex] : 'Client', clientEmail: clientDetails.e || '', clientAddress: clientDetails.a || '', description: editor.items.filter(item => item.d || item.p > 0).map(item => item.d || 'Line item').join(', '), lineItems: editor.items.filter(item => item.d || item.p > 0).map(item => ({ description: item.d, quantity: item.q, unitPrice: item.p })), amount: totals.tot, currency: editor.cur, dueDate: editor.due, paymentInstructions: editor.n, business: state.businessProfiles[editor.businessIndex] }) })
  if (!response.ok) return toast('Unable to generate PDF')
  saveBlob(await response.blob(), `INV-000${state.invoices.length + 1}.pdf`)
  toast('PDF downloaded')
}

export async function save(mode) {
  const editor = state.invoiceEditor, errors = []
  if (editor.clientIndex === '') errors.push('Choose a client to bill.')
  if (!editor.items.some(item => Number(item.p) > 0)) errors.push('Add at least one line item with a price.')
  editor.err = errors
  if (errors.length) return toast(errors.join(' '))
  const total = calc().tot
  const payload = { clientId: state.clientIds?.[Number(editor.clientIndex)], description: editor.items.filter(item => item.d || item.p > 0).map(item => item.d || 'Line item').join(', '), lineItems: editor.items.filter(item => item.d || item.p > 0).map(item => ({ description: item.d, quantity: item.q, unitPrice: item.p })), amount: total, dueDate: editor.due || null, currency: editor.cur, paymentInstructions: editor.n }
  const response = await fetch(editor.invoiceId ? `/api/invoices/${encodeURIComponent(editor.invoiceId)}` : '/api/invoices', { method: editor.invoiceId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const invoice = await response.json()
  if (!response.ok) { editor.err = [invoice.error || 'Unable to save invoice.']; return toast(editor.err[0]) }
  const saved = state.invoices.find(item => item.id === (editor.invoiceId || invoice.number))
  if (saved) {
    saved.c = Number(editor.clientIndex)
    saved.a = total
    saved.due = editor.due || ''
    saved.cur = editor.cur
    saved.n = editor.n
    saved.s = saved.s || 'Draft'
  } else {
    state.invoices.push({ id: invoice.number, c: Number(editor.clientIndex), a: total, due: editor.due || '', s: invoice.status || 'Draft', rec: false, cur: editor.cur, n: editor.n })
  }
  if (mode === 'pdf') {
    const pdf = await fetch(`/api/invoices/${invoice.number}/pdf`)
    saveBlob(await pdf.blob(), `${invoice.number}.pdf`)
  }
  if (mode === 'send') {
    const sendResponse = await fetch(`/api/invoices/${encodeURIComponent(invoice.number)}/send`, { method: 'POST' })
    const sendResult = await sendResponse.json()
    if (!sendResponse.ok) return toast(sendResult.error || 'Invoice saved as draft, but it could not be sent.')
    const sentInvoice = state.invoices.find(item => item.id === invoice.number)
    if (sentInvoice) sentInvoice.s = 'Sent'
  }
  state.invoiceEditor = null; state.currentRoute = 'invoices'; state.activeInvoiceTab = 'All'; toast(mode === 'pdf' ? `${invoice.number} saved. PDF downloaded` : mode === 'send' ? `${invoice.number} saved and sent` : `${invoice.number} saved as draft`)
}

export const savePast = async () => {
  const readField = fieldId => $("#" + fieldId).value, invoiceNumber = readField("qn").trim(), paidAmount = +readField("qa"), clientIndex = +readField("qc"), makeRecurring = $("#qr").checked, showError = message => ($("#qe").textContent = message)
  if (!invoiceNumber) return showError("Enter the invoice number.")
  if (state.invoices.some(invoice => invoice.id === invoiceNumber)) return showError(invoiceNumber + " already exists.")
  if (!(paidAmount > 0)) return showError("Enter the amount that was paid.")
  if (!readField("qi") || !readField("qd") || !readField("qp")) return showError("Enter the issue, due and paid dates.")
  if (readField("qp") < readField("qi")) return showError("The paid date cannot be before the issue date.")
  if (readField("qp") > today) return showError("The paid date cannot be in the future.")
  try {
    const response = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: invoiceNumber, clientId: state.clientIds[clientIndex], description: readField('qx') || 'Past invoice', amount: paidAmount, dueDate: readField('qd') || null, issueDate: readField('qi'), isPast: true, currency: state.defaultCurrency, lineItems: [{ description: readField('qx') || 'Past invoice', quantity: 1, unitPrice: paidAmount }] }) })
    const savedInvoice = await response.json()
    if (!response.ok) throw new Error(savedInvoice.error || 'Unable to save past invoice')
    const paymentResponse = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: savedInvoice.number, method: 'Manual', date: readField('qp'), amount: paidAmount }) })
    const savedPayment = await paymentResponse.json()
    if (!paymentResponse.ok) throw new Error(savedPayment.error || 'Unable to save past payment')
    state.invoices.unshift({ id: savedInvoice.number, c: clientIndex, a: paidAmount, iss: readField('qi'), due: readField('qd'), s: 'Paid', old: 1, d: readField('qx') })
    state.payments.push({ d: savedPayment.date, inv: savedInvoice.number, c: clientIndex, m: 'Manual', a: Number(savedPayment.amount) })
    state.pc = undefined
    if (makeRecurring) { state.mr = savedInvoice.number; state.activeModal = 'mkrec'; return render() }
    state.activeModal = null; toast(invoiceNumber + ' added as a paid invoice')
  } catch (error) { showError(error.message) }
}
