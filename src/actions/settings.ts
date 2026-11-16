import { state } from '../modules/store.ts'
import { currencySigns, currencyNames } from '../modules/catalog.tsx'
import { querySelector } from '../modules/selectors.ts'
import { render, toast } from '../ui/render.tsx'

const readApiResponse = async response => {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(response.status === 502 || response.status === 503
      ? 'The invoice API is unavailable. Restart the development server and try again.'
      : `The invoice API returned an unexpected response (${response.status}).`)
  }
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Request failed')
  return result
}

export const saveBiz = async () => {
  const businessIndex = state.be >= 0 ? state.be : state.businessProfiles.length
  const existingBusiness = state.businessProfiles[businessIndex] || {}
  const business = {
    profileId: existingBusiness.id || null,
    name: querySelector("#bn").value.trim(),
    address: querySelector("#ba").value,
    email: querySelector("#be").value,
    phone: querySelector("#bp").value,
    paymentInstructions: existingBusiness.paymentInstructions || '',
    invoicePrefix: existingBusiness.invoicePrefix ?? "INV-",
    invoiceNumberPadding: existingBusiness.invoicePadding ?? 4,
    invoiceNumberFormat: existingBusiness.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}',
    preferredEmailProvider: existingBusiness.preferredEmailProvider || null,
    defaultCurrency: state.defaultCurrency,
    ...(state.businessLogoDraft === undefined ? {} : { logoDataUrl: state.businessLogoDraft }),
  }
  if (!business.name) return

  try {
    const response = await fetch('/api/business-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(business),
    })
    const savedBusiness = await readApiResponse(response)

    // The UI uses compact, established business-profile field names. Keep the
    // API response normalized here so a successful save is immediately visible
    // without requiring a full bootstrap refresh.
    const localBusiness = {
      id: savedBusiness.id,
      n: savedBusiness.name || business.name,
      a: savedBusiness.address || '',
      e: savedBusiness.email || '',
      p: savedBusiness.phone || '',
      paymentInstructions: savedBusiness.payment_instructions || existingBusiness.paymentInstructions || '',
      invoicePrefix: savedBusiness.invoice_prefix ?? 'INV-',
      invoicePadding: savedBusiness.invoice_number_padding ?? 4,
      invoiceFormat: savedBusiness.invoice_number_format || existingBusiness.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}',
      preferredEmailProvider: savedBusiness.preferred_email_provider || existingBusiness.preferredEmailProvider || '',
      logoDataUrl: savedBusiness.logo_data_url ?? '',
      defaultCurrency: savedBusiness.default_currency ?? state.defaultCurrency,
    }
    if (state.businessProfiles[businessIndex]) state.businessProfiles[businessIndex] = localBusiness
    else state.businessProfiles.push(localBusiness)
    if (state.invoiceEditor && state.be < 0) state.invoiceEditor.businessIndex = state.businessProfiles.length - 1
    state.businessLogoDraft = undefined
    state.activeModal = null
    render()
    toast(localBusiness.n + " saved")
  } catch (error) {
    toast(error.message)
  }
}

export const uploadBusinessLogo = input => {
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 512 * 1024) {
    input.value = ''
    return toast('Logo must be 512 KB or smaller.', undefined, { error: true, persistent: true })
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    input.value = ''
    return toast('Upload a PNG, JPG or WEBP logo.', undefined, { error: true, persistent: true })
  }
  const reader = new FileReader()
  reader.onload = () => {
    state.businessLogoDraft = reader.result
    render()
  }
  reader.readAsDataURL(file)
}

/**
 * In Settings, state.be identifies the business being edited.
 * Never silently write businessProfiles[0] when multiple profiles exist.
 */
const getBusinessForSettings = () => {
  const selectedId = state.numberingBusinessProfileId;
  const selectedIndex = selectedId != null ? state.businessProfiles.findIndex(
    profile => profile.id === selectedId) : Number.isInteger(state.numberingBusinessIndex
    ) ? state.numberingBusinessIndex : -1;
  const index = selectedIndex >= 0 ? selectedIndex : state.businessProfiles.length === 1 ? 0 : -1;
  const business = state.businessProfiles[index];
  if (!business?.id) {
    throw new Error('Select and save a business before editing its invoice settings.');
  }
  return { index, business };
};

export const saveInvoiceNumbering = async () => {
  try {
    const { index, business } = getBusinessForSettings()
    const invoicePrefix = querySelector('#invoice-prefix').value.trim()
    const enteredPadding = Number(querySelector('#invoice-padding').value)
    const invoicePadding = Number.isFinite(enteredPadding)
      ? Math.min(10, Math.max(1, Math.trunc(enteredPadding)))
      : 4
    const invoiceFormat = querySelector('#invoice-format').value.trim()
      || '{PREFIX}{YYYY}-{NUMBER}'

    const allowedTokens = new Set(['{PREFIX}', '{YYYY}', '{YY}', '{NUMBER}'])
    const foundTokens = invoiceFormat.match(/\{[^{}]*\}/g) ?? []
    const leftover = invoiceFormat.replace(/\{[^{}]*\}/g, '')
    if (foundTokens.some(token => !allowedTokens.has(token)) ||
        leftover.includes('{') || leftover.includes('}') ||
        !invoiceFormat.includes('{NUMBER}')) {
      return toast('Use only {PREFIX}, {YYYY}, {YY}, and {NUMBER}; {NUMBER} is required.')
    }

    // PATCH only the numbering columns: leave name, address, logo, etc. intact.
    const response = await fetch(`/api/business-profile/${encodeURIComponent(business.id)}/invoice-numbering`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoicePrefix, invoiceNumberPadding: invoicePadding, invoiceNumberFormat: invoiceFormat }),
    })

    const saved = await readApiResponse(response)
    state.businessProfiles[index] = {
      ...business,
      invoicePrefix: saved.invoice_prefix ?? invoicePrefix,
      invoicePadding: saved.invoice_number_padding ?? invoicePadding,
      invoiceFormat: saved.invoice_number_format ?? invoiceFormat,
    }
    toast('Invoice numbering saved')
  } catch (error) {
    toast(error.message)
  }
}

export const addInvoiceFormatToken = token => {
  const formatInput = querySelector('#invoice-format')
  if (!formatInput) return
  formatInput.value += token
  formatInput.dispatchEvent(new Event('input'))
}

export const addInvoiceFormatTokenAtCursor = (token, dropEvent) => {
  const formatInput = querySelector('#invoice-format')
  if (!formatInput) return
  const cursorPosition = Number(dropEvent?.offsetX) >= 0 ? formatInput.value.length : (formatInput.selectionStart ?? formatInput.value.length)
  formatInput.value = formatInput.value.slice(0, cursorPosition) + token + formatInput.value.slice(cursorPosition)
  formatInput.dispatchEvent(new Event('input'))
}

export const addCur = async () => {
  const currencyCode = querySelector("#xc").value.trim().toUpperCase(), currencySign = querySelector("#xs").value.trim(), showError = message => (querySelector("#xe").textContent = message)
  if (!/^[A-Z]{3}$/.test(currencyCode)) return showError("Use the 3-letter ISO code, for example GBP or JPY.")
  if (currencySigns[currencyCode]) return showError(currencyCode + " is already in your list.")
  if (!currencySign) return showError("Enter the currency sign, for example £ or ¥.")
  try {
    const response = await fetch('/api/currencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: currencyCode, name: querySelector("#xn").value.trim() || currencyCode, sign: currencySign })
    });
    const savedCurrency = await response.json();
    if (!response.ok) return showError(savedCurrency.error || 'Unable to save currency');
    currencySigns[savedCurrency.code] = savedCurrency.sign;
    currencyNames[savedCurrency.code] = savedCurrency.name;
    state.activeModal = null;
    toast(currencyCode + " added");
  } catch (error) {
    showError(error.message);
  }
}

export const delCur = async currencyCode => {
  try {
    const response = await fetch(`/api/currencies/${encodeURIComponent(currencyCode)}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json();
      return toast(result.error || 'Unable to remove currency');
    }
    delete currencySigns[currencyCode];
    delete currencyNames[currencyCode];
    toast(currencyCode + " removed");
  } catch (error) {
    toast(error.message);
  }
}

export const setDefaultCurrency = async currencyCode => {
  try {
    const { index, business } = getBusinessForSettings()
    const response = await fetch(`/api/business-profile/${encodeURIComponent(business.id)}/default-currency`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultCurrency: currencyCode }),
    })
    const saved = await readApiResponse(response)
    state.businessProfiles[index] = {
      ...business,
      defaultCurrency: saved.default_currency ?? currencyCode,
    }
    state.defaultCurrency = saved.default_currency ?? currencyCode
    toast(`${currencyCode} is now the default currency`)
  } catch (error) {
    toast(error.message)
  }
}

export const runManualBackup = async () => {
  try {
    const response = await fetch('/api/backups/run', { method: 'POST' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to send backup')
    toast(`Backup sent to ${result.recipient}`)
  } catch (error) { toast(error.message) }
}

export const saveSecuritySettings = async () => {
  const backup = state.securitySettings?.backup || {}
  const responseBody = {
    backup: {
      recipientEmail: querySelector('#backup-email').value.trim(),
      intervalDays: Number(querySelector('#backup-interval').value) || 14,
      enabled: querySelector('#backup-enabled').checked,
    },
    password: {
      resetTokenMinutes: Number(querySelector('#reset-expiry').value) || 15,
      passwordMinLength: Number(querySelector('#password-min-length').value) || 12,
      requireUppercase: querySelector('#password-uppercase').checked,
      requireLowercase: querySelector('#password-lowercase').checked,
      requireNumber: querySelector('#password-number').checked,
      requireSymbol: querySelector('#password-symbol').checked,
    },
  }
  try {
    const response = await fetch('/api/account/security', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(responseBody) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to save security settings')
    state.securitySettings = result
    toast('Account security settings saved')
  } catch (error) { toast(error.message) }
}
