import { state } from '../modules/store.ts'
import { today } from '../modules/date.ts'
import { currencySigns } from '../modules/catalog.tsx'
import { querySelector } from '../modules/selectors.ts'
import { isMail } from '../modules/selectors.ts'
import { saveBlob } from '../modules/download.ts'
import { render, toast } from '../ui/render.tsx'
import { sample, calc } from '../pages/editor.tsx'
import { wiz } from './integrations.ts'

const invoicePdfFilename = (businessName, invoiceNumber) => {
  const businessSegment = String(businessName || 'Invoice').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ')
  const invoiceSegment = String(invoiceNumber || 'invoice').trim().replace(/[\\/:*?"<>|]+/g, '-')
  return `${businessSegment || 'Invoice'}-${invoiceSegment || 'invoice'}.pdf`
}

const draftAutosaveDelayMilliseconds = 800
let draftAutosaveTimer
let draftAutosaveRequest = null
let draftAutosaveQueued = false

const recoveryDraftKey = () => `kowope:invoice-draft:${state.authEmail || 'account'}`

const persistDraftRecovery = editor => {
  try { localStorage.setItem(recoveryDraftKey(), JSON.stringify(editor)) } catch { /* Browser storage is a fallback, not a requirement. */ }
}

const clearDraftRecovery = () => {
  try { localStorage.removeItem(recoveryDraftKey()) } catch { /* Browser storage may be unavailable. */ }
}

const recoveredDraft = () => {
  try {
    const savedDraft = JSON.parse(localStorage.getItem(recoveryDraftKey()) || 'null')
    if (!savedDraft || !Array.isArray(savedDraft.lineItems)) return null
    return savedDraft
  } catch { return null }
}

const hasAutosaveRequirements = editor => editor?.clientIndex !== ''
  && Boolean(state.clientIds?.[Number(editor.clientIndex)])
  && editor.lineItems?.some(item => Number(item.unitPrice) > 0)

const autosavePayload = editor => {
  const totals = calc()
  const businessProfile = state.businessProfiles[editor.businessIndex] || {}
  const lineItems = editor.lineItems.filter(item => item.description || Number(item.unitPrice) > 0)
  return {
    totals,
    businessProfile,
    payload: {
      clientId: state.clientIds[Number(editor.clientIndex)],
      description: lineItems.map(item => item.description || 'Line item').join(', '),
      lineItems: lineItems.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      amount: totals.total,
      dueDate: editor.dueDate || null,
      currency: editor.currency,
      paymentInstructions: editor.paymentInstructions,
      businessProfileId: businessProfile.id ?? null,
      discountValue: editor.discountValue,
      discountType: editor.discountType,
      taxName: editor.taxName,
      taxRate: editor.tax,
    },
  }
}

const saveDraftAutomatically = async () => {
  const editor = state.invoiceEditor
  if (!editor || !hasAutosaveRequirements(editor)) return
  const { totals, businessProfile, payload } = autosavePayload(editor)
  try {
    const response = await fetch(editor.invoiceId ? `/api/invoices/${encodeURIComponent(editor.invoiceId)}` : '/api/invoices', {
      method: editor.invoiceId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const invoice = await response.json()
    if (!response.ok) throw new Error(invoice.error || 'Unable to autosave invoice draft.')
    if (state.invoiceEditor !== editor) return
    editor.invoiceId = invoice.id
    editor.invoiceNumber = invoice.number
    const summary = {
      id: invoice.id, number: invoice.number, c: Number(editor.clientIndex), a: totals.total,
      due: editor.dueDate || '', s: invoice.status || 'Draft', rec: Boolean(invoice.schedule_id),
      cur: editor.currency, n: editor.paymentInstructions,
      businessProfileId: invoice.business_profile_id ?? businessProfile.id ?? null,
    }
    const existingInvoice = state.invoices.find(candidate => candidate.id === invoice.id)
    if (existingInvoice) Object.assign(existingInvoice, summary)
    else state.invoices.unshift(summary)
    persistDraftRecovery(editor)
    state.invoiceAutosaveStatus = 'Draft saved'
    render()
  } catch {
    if (state.invoiceEditor === editor) {
      state.invoiceAutosaveStatus = 'Draft saved locally'
      render()
    }
  }
}

const runDraftAutosave = async () => {
  if (draftAutosaveRequest) {
    draftAutosaveQueued = true
    return
  }
  draftAutosaveRequest = saveDraftAutomatically()
  await draftAutosaveRequest
  draftAutosaveRequest = null
  if (draftAutosaveQueued) {
    draftAutosaveQueued = false
    queueInvoiceDraftAutosave()
  }
}

export const queueInvoiceDraftAutosave = () => {
  const editor = state.invoiceEditor
  if (!editor) return
  persistDraftRecovery(editor)
  if (!hasAutosaveRequirements(editor)) {
    state.invoiceAutosaveStatus = 'Draft saved locally'
    return
  }
  if (draftAutosaveTimer) clearTimeout(draftAutosaveTimer)
  state.invoiceAutosaveStatus = 'Saving draft…'
  draftAutosaveTimer = setTimeout(() => { void runDraftAutosave() }, draftAutosaveDelayMilliseconds)
}

const stopDraftAutosave = () => {
  if (draftAutosaveTimer) clearTimeout(draftAutosaveTimer)
  draftAutosaveTimer = undefined
  draftAutosaveQueued = false
}

const waitForDraftAutosave = async () => {
  stopDraftAutosave()
  if (draftAutosaveRequest) await draftAutosaveRequest
}

export const uploadInvoiceLogo = input => {
  const file = input?.files?.[0]
  if (!file) return
  if (file.size > 512 * 1024) return toast('Logo must be 512 KB or smaller.')
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Logo must be a PNG, JPG, or WEBP image.')
  const reader = new FileReader()
  reader.onload = () => {
    if (!state.invoiceEditor) return
    state.invoiceEditor.logoDataUrl = reader.result
    state.invoiceEditor.logoRemoved = false
    queueInvoiceDraftAutosave()
    render()
  }
  reader.onerror = () => toast('Unable to read the logo file.')
  reader.readAsDataURL(file)
}

export const removeInvoiceLogo = () => {
  if (!state.invoiceEditor) return
  state.invoiceEditor.logoDataUrl = ''
  state.invoiceEditor.logoRemoved = true
  queueInvoiceDraftAutosave()
  render()
}

export function newInv(clientIndex?) {
  const savedDraft = clientIndex === undefined ? recoveredDraft() : null
  state.invoiceEditor = savedDraft ? { ...sample(), ...savedDraft, lineItems: savedDraft.lineItems } : sample()
  if (clientIndex !== undefined) state.invoiceEditor.clientIndex = String(clientIndex)
  state.invoiceAutosaveStatus = savedDraft ? 'Recovered unsaved draft' : ''
  state.currentRoute = "new"
  render()
  scrollTo(0, 0)
}

export const editDraft = async id => {
  stopDraftAutosave()
  const summary = state.invoices.find(invoice => invoice.id === id)
  if (!summary || summary.s !== 'Draft') return toast('Only draft invoices can be edited.')
  clearDraftRecovery()
  try {
    const response = await fetch(`/api/invoices/${encodeURIComponent(id)}`)
    const invoice = await response.json()
    if (!response.ok) throw new Error(invoice.error || 'Unable to load draft')
    const editor = sample()
    const clientIndex = state.clientIds.findIndex(clientId => clientId === invoice.client_id)
    editor.invoiceId = id
    editor.invoiceNumber = invoice.number
    editor.clientIndex = clientIndex >= 0 ? String(clientIndex) : ''
    const matchingBusiness = state.businessProfiles.findIndex(profile => profile.id === invoice.business_profile_id);
    editor.businessIndex = matchingBusiness >= 0 ? matchingBusiness : 0;
    editor.dueDate = invoice.due_date || ''
    editor.duePreset = 0
    editor.currency = invoice.currency || state.defaultCurrency
    editor.paymentInstructions = invoice.payment_instructions || ''
    editor.discountValue = Number(invoice.discount_value) || 0
    editor.discountType = invoice.discount_type === '$' ? '$' : '%'
    editor.taxName = invoice.tax_name || 'Tax'
    editor.tax = Number(invoice.tax_rate) || 0
    editor.lineItems = Array.isArray(invoice.lineItems) && invoice.lineItems.length
      ? invoice.lineItems.map(item => ({ description: item.description || '', quantity: Number(item.quantity) || 1, unitPrice: Number(item.unit_price) || 0 }))
      : [{ description: invoice.description || '', quantity: 1, unitPrice: Number(invoice.amount) || 0 }]
    state.invoiceEditor = editor
    state.invoiceAutosaveStatus = ''
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
    invoice.s = 'Paid'; state.payments.push({ invoiceId: payment.invoice_id || id, d: payment.date, inv: invoice.number, c: invoice.c, m: payment.method || 'Manual', a: Number(payment.amount) }); state.openMenuIndex = 0; toast(invoice.number + ' marked paid')
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
    toast((invoice?.number || id) + ' sent')
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
      businessProfileId: sourceDetails.business_profile_id || null,
      discountValue: Number(sourceDetails.discount_value) || 0,
      discountType: sourceDetails.discount_type === '$' ? '$' : '%',
      taxName: sourceDetails.tax_name || 'Tax',
      taxRate: Number(sourceDetails.tax_rate) || 0,
      lineItems,
    }
    const duplicateResponse = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicatePayload) })
    const duplicateInvoice = await duplicateResponse.json()
    if (!duplicateResponse.ok) throw new Error(duplicateInvoice.error || 'Unable to duplicate invoice')
    const clientIndex = state.clientIds.findIndex(clientId => clientId === sourceDetails.client_id)
    state.invoices.unshift({ id: duplicateInvoice.id, number: duplicateInvoice.number, c: Math.max(0, clientIndex), a: Number(duplicateInvoice.amount), due: duplicateInvoice.due_date || '', s: duplicateInvoice.status || 'Draft', rec: false, cur: duplicateInvoice.currency || 'USD', n: duplicateInvoice.payment_instructions || '', businessProfileId: duplicateInvoice.business_profile_id })
    toast(`${duplicateInvoice.number} duplicated as draft`)
  } catch (error) { toast(error.message) }
}
export const del = async id => {
  const invoice = state.invoices.find(item => item.id === id)
  try {
    const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to delete invoice')
    const index = state.invoices.findIndex(invoice => invoice.id === id);
    if (index >= 0) state.invoices.splice(index, 1);
    toast((invoice?.number || id) + ' deleted')
  } catch (error) { toast(error.message) }
}

export const downloadInvoice = async id => {
  const invoice = state.invoices.find(item => item.id === id)
  const response = await fetch(`/api/invoices/${id}/pdf`)
  if (!response.ok) return toast('Unable to download invoice')
  const businessProfile = state.businessProfiles.find(profile => profile.id === invoice?.businessProfileId) || {}
  saveBlob(await response.blob(), invoicePdfFilename(businessProfile.n, invoice?.number))
  toast((invoice?.number || 'Invoice') + ' downloaded')
}

// Saved invoices open in the browser's PDF viewer. This leaves the existing
// download action unchanged while giving users a quick read-only preview.
export const viewInvoice = id => {
  window.open(`/api/invoices/${encodeURIComponent(id)}/preview`, '_blank', 'noopener,noreferrer')
}

export const openInvoice = id => {
  if (!state.invoices.some(invoice => String(invoice.id) === String(id))) return toast('Invoice not found.')
  state.currentRoute = 'invoices'
  state.activeInvoiceTab = 'All'
  state.invoiceClientId = null
  state.invoiceAnchorId = String(id)
  state.searchQuery = ''
  render()
  requestAnimationFrame(() => document.getElementById(`invoice-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

export const downloadPreviewPdf = async () => {
  const editor = state.invoiceEditor;
  if (!editor) return toast('Open an invoice first.');
  const totals = calc();
  const details = editor.clientIndex !== '' ? state.clientDetails[editor.clientIndex] || {} : {};
  const business = state.businessProfiles[editor.businessIndex] || {};
  const invoiceLogo = editor.logoDataUrl || (!editor.logoRemoved ? business.logoDataUrl || '' : '');
  const items = editor.lineItems.filter(item => item.description || Number(item.unitPrice) > 0);
  try {
    const response = await fetch('/api/invoices/preview/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: editor.invoiceNumber || 'PREVIEW',
        clientName: editor.clientIndex !== '' ? state.clientNames[editor.clientIndex] : 'Client',
        clientEmail: details.e || '', clientAddress: details.a || '',
        description: items.map(item => item.description || 'Line item').join(', '),
        lineItems: items.map(item => ({description:item.description, quantity:item.quantity, unitPrice:item.unitPrice})),
        amount: totals.total, subtotal: totals.subtotal, discount: totals.discount,
        taxAmount: totals.taxAmount, taxName: editor.taxName, taxRate: editor.tax,
        currency: editor.currency, currencySymbol: currencySigns[editor.currency], dueDate: editor.dueDate,
        paymentInstructions: editor.paymentInstructions,
        business: {name:business.n, address:business.a, email:business.e,
          phone:business.p, logoDataUrl:invoiceLogo},
      }),
    });
    if (!response.ok) throw new Error('Unable to generate PDF preview.');
    saveBlob(await response.blob(), 'invoice-preview.pdf');
    toast('PDF preview downloaded');
  } catch (error) { toast(error.message); }
};

export async function save(mode) {
  await waitForDraftAutosave()
  const editor = state.invoiceEditor, errors = []
  if (editor.clientIndex === '') errors.push('Choose a client to bill.')
  if (!editor.lineItems.some(item => Number(item.unitPrice) > 0)) errors.push('Add at least one line item with a price.')
  editor.errors = errors
  if (errors.length) return toast(errors.join(' '))
  const totals = calc()
  const totalAmount = totals.total
  const businessProfile = state.businessProfiles[editor.businessIndex] || {}
  const invoiceLogo = editor.logoDataUrl || (!editor.logoRemoved ? businessProfile.logoDataUrl || '' : '')
  const payload = { clientId: state.clientIds?.[Number(editor.clientIndex)], description: editor.lineItems.filter(item => item.description || item.unitPrice > 0).map(item => item.description || 'Line item').join(', '), lineItems: editor.lineItems.filter(item => item.description || item.unitPrice > 0).map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })), amount: totalAmount, dueDate: editor.dueDate || null, currency: editor.currency, paymentInstructions: editor.paymentInstructions, businessProfileId: businessProfile.id ?? null, discountValue: editor.discountValue, discountType: editor.discountType, taxName: editor.taxName, taxRate: editor.tax }
  const response = await fetch(editor.invoiceId ? `/api/invoices/${encodeURIComponent(editor.invoiceId)}` : '/api/invoices', { method: editor.invoiceId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const invoice = await response.json()
  if (!response.ok) { editor.err = [invoice.error || 'Unable to save invoice.']; return toast(editor.err[0]) }
  const saved = state.invoices.find(item => item.id === (editor.invoiceId || invoice.id));
  const summary = {
    id: invoice.id, number: invoice.number, c: Number(editor.clientIndex), a: totalAmount,
    due: editor.dueDate || '', s: invoice.status || 'Draft',
    rec: Boolean(invoice.schedule_id), cur: editor.currency,
    n: editor.paymentInstructions, businessProfileId: invoice.business_profile_id ?? businessProfile.id ?? null,
  };
  if (saved) Object.assign(saved, summary);
  else state.invoices.unshift(summary);
  if (mode === 'pdf') {
    const pdf = await fetch('/api/invoices/preview/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: invoice.number, clientName: state.clientNames[editor.clientIndex], clientEmail: state.clientDetails[editor.clientIndex]?.e || '', clientAddress: state.clientDetails[editor.clientIndex]?.a || '', description: payload.description, lineItems: payload.lineItems, amount: totalAmount, subtotal: totals.subtotal, discount: totals.discount, taxAmount: totals.taxAmount, taxName: editor.taxName, taxRate: editor.tax, currency: editor.currency, currencySymbol: currencySigns[editor.currency], dueDate: editor.dueDate, paymentInstructions: editor.paymentInstructions, business: { name:businessProfile.n, address:businessProfile.a, email:businessProfile.e, phone:businessProfile.p, logoDataUrl: invoiceLogo } }) })
    if (!pdf.ok) return toast('Invoice saved, but the PDF could not be generated.')
    saveBlob(await pdf.blob(), invoicePdfFilename(businessProfile.n, invoice.number))
  }
  if (mode === 'send') {
    const sendResponse = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logoDataUrl: invoiceLogo }) })
    const sendResult = await sendResponse.json()
    if (!sendResponse.ok) return toast(sendResult.error || 'Invoice saved as draft, but it could not be sent.')
    const sentInvoice = state.invoices.find(item => item.id === invoice.id)
    if (sentInvoice) sentInvoice.s = 'Sent'
  }
  clearDraftRecovery()
  state.invoiceAutosaveStatus = ''
  state.invoiceEditor = null; state.currentRoute = 'invoices'; state.activeInvoiceTab = 'All'; toast(mode === 'pdf' ? `${invoice.number} saved. PDF downloaded` : mode === 'send' ? `${invoice.number} saved and sent` : `${invoice.number} saved as draft`)
}

export const savePast = async () => {
  const readField = fieldId => querySelector("#" + fieldId).value, paidAmount = +readField("qa"), clientIndex = +readField("qc"), makeRecurring = querySelector("#qr").checked, showError = message => (querySelector("#qe").textContent = message)
  if (!(paidAmount > 0)) return showError("Enter the amount that was paid.")
  if (!readField("qi") || !readField("qd") || !readField("qp")) return showError("Enter the issue, due and paid dates.")
  if (readField("qp") < readField("qi")) return showError("The paid date cannot be before the issue date.")
  if (readField("qp") > today) return showError("The paid date cannot be in the future.")
  try {
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessProfileId: state.businessProfiles[+readField('qb')]?.id || state.numberingBusinessProfileId || state.businessProfiles[0]?.id || null,
        invoiceNumber: readField('qn').trim(),
        clientId: state.clientIds[clientIndex],
        description: readField("qx") || "Past invoice",
        amount: paidAmount,
        dueDate: readField("qd") || null,
        issueDate: readField("qi"),
        isPast: true,
        currency: state.defaultCurrency,
        lineItems: [{
            description: readField("qx") || "Past invoice",
            quantity: 1,
            unitPrice: paidAmount,
          }],
      }),
    });
    const savedInvoice = await response.json()
    if (!response.ok) throw new Error(savedInvoice.error || 'Unable to save past invoice');
    const paymentResponse = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: savedInvoice.id, method: 'Manual', date: readField('qp'), amount: paidAmount })
    });
    const savedPayment = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(savedPayment.error || 'Unable to save past payment');
    state.invoices.unshift({ id: savedInvoice.id, number: savedInvoice.number, c: clientIndex, a: paidAmount, iss: readField('qi'), due: readField('qd'), s: 'Paid', old: 1, d: readField('qx'), businessProfileId: savedInvoice.business_profile_id });
    state.payments.push({ d: savedPayment.date, inv: savedInvoice.number, c: clientIndex, m: 'Manual', a: Number(savedPayment.amount) });
    state.pc = undefined;
    if (makeRecurring) { state.mr = savedInvoice.id; state.activeModal = 'mkrec'; return render() }
    state.activeModal = null; toast(savedInvoice.number + ' added as a paid invoice')
  } catch (error) { showError(error.message) }
}
