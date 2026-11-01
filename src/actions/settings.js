import { state } from '../modules/store.js'
import { currencySigns, currencyNames } from '../modules/catalog.js'
import { $ } from '../modules/selectors.js'
import { toast } from '../ui/render.js'

export const saveBiz = async () => {
  const existingBusiness = state.businessProfiles[0] || {}
  const business = {
    name: $("#bn").value.trim(),
    address: $("#ba").value,
    email: $("#be").value,
    phone: $("#bp").value,
    paymentInstructions: existingBusiness.paymentInstructions || '',
    invoicePrefix: existingBusiness.invoicePrefix || "INV-",
    invoiceNumberPadding: existingBusiness.invoicePadding || 4,
    invoiceNumberFormat: existingBusiness.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}',
    preferredEmailProvider: existingBusiness.preferredEmailProvider || null,
    defaultCurrency: state.defaultCurrency,
  }
  if (!business.name) return

  try {
    const response = await fetch('/api/business-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(business),
    })
    const savedBusiness = await response.json()
    if (!response.ok) throw new Error(savedBusiness.error || 'Unable to save business profile')

    const localBusiness = {
      n: savedBusiness.name,
      a: savedBusiness.address || '',
      e: savedBusiness.email || '',
      p: savedBusiness.phone || '',
      paymentInstructions: savedBusiness.payment_instructions || existingBusiness.paymentInstructions || '',
      invoicePrefix: savedBusiness.invoice_prefix || 'INV-',
      invoicePadding: savedBusiness.invoice_number_padding || 4,
      invoiceFormat: savedBusiness.invoice_number_format || existingBusiness.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}',
      preferredEmailProvider: savedBusiness.preferred_email_provider || existingBusiness.preferredEmailProvider || '',
    }
    if (state.businessProfiles.length) state.businessProfiles[0] = localBusiness
    else state.businessProfiles.push(localBusiness)
    if (state.invoiceEditor) state.invoiceEditor.businessIndex = 0
    state.activeModal = null
    toast(localBusiness.n + " saved")
  } catch (error) {
    toast(error.message)
  }
}

export const saveInvoiceNumbering = async () => {
  const existingBusiness = state.businessProfiles[0] || {}
  const invoicePrefix = $("#invoice-prefix").value.trim() || 'INV-'
  const invoicePadding = Math.min(10, Math.max(1, Number($("#invoice-padding").value) || 4))
  const invoiceFormat = $("#invoice-format").value.trim() || '{PREFIX}{YYYY}-{NUMBER}'
  const supportedTokens = ['{PREFIX}', '{YYYY}', '{YY}', '{NUMBER}']
  if (![...invoiceFormat.matchAll(/\{[A-Z]+\}/g)].every(match => supportedTokens.includes(match[0]))) return toast('Use only the supported invoice format tokens.')
  try {
    const response = await fetch('/api/business-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: existingBusiness.n || '', address: existingBusiness.a || '', email: existingBusiness.e || '', phone: existingBusiness.p || '', paymentInstructions: existingBusiness.paymentInstructions || '', invoicePrefix, invoiceNumberPadding: invoicePadding, invoiceNumberFormat: invoiceFormat, preferredEmailProvider: existingBusiness.preferredEmailProvider || null, defaultCurrency: state.defaultCurrency }) })
    const savedBusiness = await response.json()
    if (!response.ok) throw new Error(savedBusiness.error || 'Unable to save invoice numbering')
    state.businessProfiles[0] = { ...existingBusiness, invoicePrefix: savedBusiness.invoice_prefix || invoicePrefix, invoicePadding: savedBusiness.invoice_number_padding || invoicePadding, invoiceFormat: savedBusiness.invoice_number_format || invoiceFormat }
    toast('Invoice numbering saved')
  } catch (error) { toast(error.message) }
}

export const addInvoiceFormatToken = token => {
  const formatInput = $('#invoice-format')
  if (!formatInput) return
  formatInput.value += token
  formatInput.dispatchEvent(new Event('input'))
}

export const addInvoiceFormatTokenAtCursor = (token, dropEvent) => {
  const formatInput = $('#invoice-format')
  if (!formatInput) return
  const cursorPosition = Number(dropEvent?.offsetX) >= 0 ? formatInput.value.length : (formatInput.selectionStart ?? formatInput.value.length)
  formatInput.value = formatInput.value.slice(0, cursorPosition) + token + formatInput.value.slice(cursorPosition)
  formatInput.dispatchEvent(new Event('input'))
}

export const addCur = async () => {
  const currencyCode = $("#xc").value.trim().toUpperCase(), currencySign = $("#xs").value.trim(), showError = message => ($("#xe").textContent = message)
  if (!/^[A-Z]{3}$/.test(currencyCode)) return showError("Use the 3-letter ISO code, for example GBP or JPY.")
  if (currencySigns[currencyCode]) return showError(currencyCode + " is already in your list.")
  if (!currencySign) return showError("Enter the currency sign, for example £ or ¥.")
  try { const response = await fetch('/api/currencies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: currencyCode, name: $("#xn").value.trim() || currencyCode, sign: currencySign }) }); const savedCurrency = await response.json(); if (!response.ok) return showError(savedCurrency.error || 'Unable to save currency'); currencySigns[savedCurrency.code] = savedCurrency.sign; currencyNames[savedCurrency.code] = savedCurrency.name; state.activeModal = null; toast(currencyCode + " added") } catch (error) { showError(error.message) }
}

export const delCur = async currencyCode => { try { const response = await fetch(`/api/currencies/${encodeURIComponent(currencyCode)}`, { method: 'DELETE' }); if (!response.ok) { const result = await response.json(); return toast(result.error || 'Unable to remove currency') } delete currencySigns[currencyCode]; delete currencyNames[currencyCode]; toast(currencyCode + " removed") } catch (error) { toast(error.message) } }

export const setDefaultCurrency = async currencyCode => {
  const businessProfile = state.businessProfiles[0] || {}
  try {
    const response = await fetch('/api/business-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: businessProfile.n || '', address: businessProfile.a || '', email: businessProfile.e || '', phone: businessProfile.p || '', paymentInstructions: businessProfile.paymentInstructions || '', invoicePrefix: businessProfile.invoicePrefix || 'INV-', invoiceNumberPadding: businessProfile.invoicePadding || 4, invoiceNumberFormat: businessProfile.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider: businessProfile.preferredEmailProvider || null, defaultCurrency: currencyCode }) })
    const savedBusiness = await response.json()
    if (!response.ok) throw new Error(savedBusiness.error || 'Unable to save default currency')
    state.defaultCurrency = savedBusiness.default_currency || currencyCode
    toast(`${currencyCode} is now the default currency`)
  } catch (error) { toast(error.message) }
}

export const runManualBackup = async () => {
  try {
    const response = await fetch('/api/backups/run', { method: 'POST' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to send backup')
    toast(`Backup sent to ${result.recipient}`)
  } catch (error) { toast(error.message) }
}
