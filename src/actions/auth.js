import { state } from '../modules/store.js'
import { render, toast } from '../ui/render.js'
import { bootKowope } from '../modules/bootstrap.js'
import { $ } from '../modules/selectors.js'
import { formatMoney } from '../modules/format.js'
import { currencySigns } from '../modules/catalog.js'

async function authenticate(endpoint) {
  if (state.authBusy) return
  const email = $('#auth-email').value
  const password = $('#auth-password').value
  state.authBusy = true
  state.authError = ''
  render()
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const contentType = response.headers.get('content-type') || ''
    const result = contentType.includes('application/json') ? await response.json() : { error: `Kowope API is unavailable or returned HTML (${response.status}). Start the Node API and check the frontend proxy.` }
    if (!response.ok) throw new Error(result.error || 'Unable to authenticate')
    state.authenticated = true
    state.authError = ''
    state.authNeedsVerification = false
    state.authSetupRequired = Boolean(result.firstLogin)
    await bootKowope()
    if (result.firstLogin) toast('Welcome to Kowope. This is your first sign-in.')
  } finally {
    state.authBusy = false
  }
}
export const loginAccount = async () => { try { await authenticate('/api/auth/login') } catch (error) { state.authBusy = false; state.authError = error.message; render(); toast(error.message, undefined, { error: true, persistent: true }) } }
export const signupAccount = async () => { try { const email = $('#auth-email').value; const password = $('#auth-password').value; state.authEmail = email; state.authBusy = true; state.authError = ''; render(); const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const contentType = response.headers.get('content-type') || ''; const result = contentType.includes('application/json') ? await response.json() : { error: `Kowope API is unavailable or returned HTML (${response.status}).` }; if (!response.ok) throw new Error(result.error || 'Unable to create account'); state.authBusy = false; state.authMode = 'login'; state.authMessage = result.message; render(); toast(result.message || 'Account created. Check your email to verify it.') } catch (error) { state.authBusy = false; state.authError = error.message; render(); toast(error.message, undefined, { error: true, persistent: true }) } }
export const resendVerification = async () => { if (state.authBusy) return; const email = ($('#auth-email')?.value || state.authEmail || '').trim(); if (!email) return toast('Enter your account email first.'); state.authEmail = email; state.authBusy = true; render(); try { const response = await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to resend verification email'); state.authMessage = result.message; toast(result.message) } catch (error) { state.authMessage = error.message; toast(error.message) } finally { state.authBusy = false; render() } }
export const resendUserVerification = async userId => { try { const response = await fetch(`/api/platform/users/${encodeURIComponent(userId)}/resend-verification`, { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to resend verification email'); toast(result.message) } catch (error) { toast(error.message, undefined, { error: true, persistent: true }) } }
export const setUserSuspended = async (userId, suspended) => { try { const response = await fetch(`/api/platform/users/${encodeURIComponent(userId)}/suspension`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspended }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to update user status'); const platformUser = state.platformUsers.find(user => user.id === userId); if (platformUser) platformUser.suspended_at = suspended ? new Date().toISOString() : null; toast(result.message); render() } catch (error) { toast(error.message, undefined, { error: true, persistent: true }) } }
export const inviteOrganizationMember = async () => { try { const email = $('#organization-member-email').value.trim(); const response = await fetch('/api/organization/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to add organization member'); const organizationResponse = await fetch('/api/organization'); state.organization = await organizationResponse.json(); render(); toast(result.message) } catch (error) { toast(error.message, undefined, { error: true, persistent: true }) } }
export const createOrganization = async () => { const name = $('#organization-name')?.value.trim(); if (!name) return toast('Enter an organization name.', undefined, { error: true, persistent: true }); try { const response = await fetch('/api/organization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to create organization'); state.organization = result; state.activeModal = null; render(); toast(`Organization “${result.organization.name}” created.`) } catch (error) { toast(error.message, undefined, { error: true, persistent: true }) } }
export const verifyEmail = async () => { if (state.authBusy) return; state.authBusy = true; state.authError = ''; state.authMessage = 'Verifying your email…'; render(); try { const response = await fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: state.verifyToken }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to verify email'); state.authBusy = false; state.authMode = 'login'; state.authMessage = result.message; state.verifyToken = ''; history.replaceState({}, '', '/'); render() } catch (error) { state.authBusy = false; state.authMessage = ''; state.authError = error.message; render(); toast(error.message, undefined, { error: true, persistent: true }) } }
export const toggleAuthPassword = () => { const password = $('#auth-password') || $('#auth-new-password'); if (!password) return; password.type = password.type === 'password' ? 'text' : 'password'; const toggle = document.querySelector('.password-toggle'); if (toggle) { toggle.textContent = password.type === 'password' ? '◉' : '◌'; toggle.setAttribute('aria-label', password.type === 'password' ? 'Show password' : 'Hide password') } }
export const requestPasswordReset = async () => { if (state.authBusy) return; const email = $('#auth-email').value; state.authBusy = true; state.authMessage = 'Sending password reset link…'; render(); try { const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const responseType = response.headers.get('content-type') || ''; const result = responseType.includes('application/json') ? await response.json() : { error: `Invoice API is unavailable (${response.status}). Start the Node API on port 3001.` }; if (!response.ok) throw new Error(result.error || 'Unable to send reset link'); state.authMessage = result.message || 'If that email exists, a reset link has been sent.'; state.authBusy = false; render(); toast(state.authMessage) } catch (error) { state.authMessage = error.message; state.authBusy = false; render(); toast(error.message) } }
export const resetPassword = async () => {
  if (state.authBusy) return
  const newPassword = $('#auth-new-password').value
  const token = state.resetToken
  state.authBusy = true
  state.authMessage = ''
  render()
  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to reset password')

    // Keep the user on the reset page long enough to see the server response.
    state.authBusy = false
    state.authMessage = result.message || 'Password updated. You can now sign in.'
    render()
    toast(state.authMessage)
    await new Promise(resolve => setTimeout(resolve, 900))

    state.authMode = 'login'
    state.authMessage = 'Password updated. Sign in with your new password.'
    state.resetToken = ''
    history.replaceState({}, '', '/')
    render()
  } catch (error) {
    state.authBusy = false
    state.authMessage = ''
    render()
    state.authError = error.message
    render()
    toast(error.message, undefined, { error: true, persistent: true })
  }
}
export const logoutAccount = async () => { await fetch('/api/auth/logout', { method: 'POST' }); state.authenticated = false; state.currentRoute = 'login'; render(); toast('Signed out') }
export const openGuestInfo = () => { state.guestInfoOpen = true; render() }
export const closeGuestInfo = () => { state.guestInfoOpen = false; render() }
export const startGuestInvoice = async () => { state.guestInfoOpen = false; state.authMode = 'login'; state.currentRoute = 'guest-new'; state.authError = ''; state.authMessage = ''; state.guestBusinessEditing = false; state.guestClientEditing = false; state.guestCurrencyEditorOpen = false; state.guestCurrencies = []; state.guestInvoice = { businessName: '', businessAddress: '', businessEmail: '', businessPhone: '', clientName: '', clientAddress: '', clientEmail: '', clientPhone: '', items: [{ d: '', q: 1, p: 0 }], tax: 0, tn: 'Tax', dv: 0, dt: '%', notes: '', amount: 0, dueDate: '', currency: 'USD', logoDataUrl: '' }; render(); scrollTo(0, 0); try { await fetch('/api/guest/session', { method: 'POST' }) } catch { /* Guest editing remains available when analytics is unavailable. */ } }
export const leaveGuestInvoice = () => { state.currentRoute = 'login'; state.authMode = 'login'; state.guestInfoOpen = false; state.authError = ''; state.authMessage = ''; render() }
const guestField = id => document.getElementById(id)
const guestCurrencySymbol = () => state.guestCurrencies.find(currency => currency.code === state.guestInvoice.currency)?.symbol || currencySigns[state.guestInvoice.currency] || '$'
const guestMoney = amount => `${guestCurrencySymbol()}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const toggleGuestBusinessEdit = () => { syncGuestEditor(); state.guestBusinessEditing = !state.guestBusinessEditing; render() }
export const toggleGuestClientEdit = () => { syncGuestEditor(); state.guestClientEditing = !state.guestClientEditing; render() }
export const removeGuestLogo = () => { state.guestInvoice.logoDataUrl = ''; render() }
export const toggleGuestCurrencyEditor = () => { syncGuestEditor(); state.guestCurrencyEditorOpen = !state.guestCurrencyEditorOpen; render() }
export const addGuestCurrency = () => { syncGuestEditor(); const code = ($('#guest-new-currency-code')?.value || '').trim().toUpperCase(); const symbol = ($('#guest-new-currency-symbol')?.value || '').trim(); if (!/^[A-Z]{3,5}$/.test(code) || !symbol) return toast('Enter a currency code and symbol.', undefined, { error: true, persistent: true }); if (currencySigns[code] || state.guestCurrencies.some(currency => currency.code === code)) return toast('That currency already exists.', undefined, { error: true, persistent: true }); state.guestCurrencies.push({ code, symbol }); state.guestInvoice.currency = code; state.guestCurrencyEditorOpen = false; render() }
export const syncGuestEditor = (shouldRender = false) => { const value = state.guestInvoice; [['guest-business-name','businessName'],['guest-business-address','businessAddress'],['guest-business-email','businessEmail'],['guest-business-phone','businessPhone'],['guest-client-name','clientName'],['guest-client-address','clientAddress'],['guest-client-email','clientEmail'],['guest-client-phone','clientPhone'],['guest-due-date','dueDate'],['guest-tax-name','tn'],['guest-tax','tax'],['guest-discount','dv'],['guest-discount-type','dt'],['guest-notes','notes'],['guest-currency','currency']].forEach(([id, key]) => { const element = guestField(id); if (element) value[key] = ['tax','dv'].includes(key) ? Number(element.value || 0) : element.value }); value.items.forEach((item, index) => { const description = guestField(`guest-item-description-${index}`); const quantity = guestField(`guest-item-quantity-${index}`); const price = guestField(`guest-item-price-${index}`); if (description) item.d = description.value; if (quantity) item.q = Number(quantity.value || 0); if (price) item.p = Number(price.value || 0) }); if (shouldRender) render() }
export const updateGuestTotals = () => { const value = state.guestInvoice; const subtotal = value.items.reduce((sum, item) => sum + (+item.q || 0) * (+item.p || 0), 0); const discount = value.dt === '%' ? subtotal * (+value.dv || 0) / 100 : (+value.dv || 0); const tax = (subtotal - discount) * (+value.tax || 0) / 100; const amounts = { 'guest-subtotal': guestMoney(subtotal), 'guest-discount-total': `−${guestMoney(discount)}`, 'guest-tax-total': guestMoney(tax), 'guest-total': guestMoney(subtotal - discount + tax) }; Object.entries(amounts).forEach(([id, text]) => { const element = document.getElementById(id); if (element) element.textContent = text }); value.items.forEach((item, index) => { const element = document.getElementById(`guest-item-amount-${index}`); if (element) element.textContent = guestMoney((+item.q || 0) * (+item.p || 0)) }); const taxLabel = document.getElementById('guest-tax-label'); if (taxLabel) taxLabel.textContent = `${value.tn} ${value.tax}%` }
export const addGuestItem = () => { state.guestInvoice.items.push({ d: '', q: 1, p: 0 }); render() }
export const removeGuestItem = index => { state.guestInvoice.items.splice(index, 1); if (!state.guestInvoice.items.length) state.guestInvoice.items.push({ d: '', q: 1, p: 0 }); render() }
export const promptGuestLogin = () => { state.authMode = 'login'; state.currentRoute = 'login'; state.authMessage = 'Sign in to save, send, or reuse this invoice.'; render() }
export const guestLivePreview = () => { syncGuestEditor(); state.currentRoute = 'guest-preview'; render(); scrollTo(0, 0) }
export const readGuestLogo = input => { const file = input.files?.[0]; if (!file) return; if (file.size > 512 * 1024) { input.value = ''; return toast('Logo must be 512 KB or smaller.', undefined, { error: true, persistent: true }) } const reader = new FileReader(); reader.onload = () => { state.guestInvoice.logoDataUrl = reader.result; render() }; reader.readAsDataURL(file) }
const guestPayload = () => { syncGuestEditor(); const value = state.guestInvoice; const items = value.items.filter(item => item.d || item.p > 0); const subtotal = items.reduce((sum, item) => sum + item.q * item.p, 0); const discount = value.dt === '%' ? subtotal * value.dv / 100 : value.dv; const total = subtotal - discount + (subtotal - discount) * value.tax / 100; return { number: 'GUEST-INVOICE', clientName: value.clientName, clientEmail: value.clientEmail, clientAddress: value.clientAddress, description: items.map(item => item.d || 'Line item').join(', '), lineItems: items.map(item => ({ description: item.d, quantity: item.q, unitPrice: item.p })), amount: total, dueDate: value.dueDate || null, currency: value.currency, paymentInstructions: value.notes, business: { name: value.businessName, address: value.businessAddress, email: value.businessEmail, phone: value.businessPhone, logoDataUrl: value.logoDataUrl } } }
export const guestPreview = async () => { const response = await fetch('/api/guest/invoices/preview/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(guestPayload()) }); if (!response.ok) return toast('Unable to generate the guest invoice.', undefined, { error: true, persistent: true }); const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60000) }
export const guestDownload = async () => { const response = await fetch('/api/guest/invoices/download/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(guestPayload()) }); if (!response.ok) return toast('Unable to download the guest invoice.', undefined, { error: true, persistent: true }); const objectUrl = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = objectUrl; link.download = 'guest-invoice.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60000); state.guestInvoice.logoDataUrl = ''; render() }
export const changePassword = async () => { try { const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to change password'); $('#current-password').value = ''; $('#new-password').value = ''; toast('Password updated') } catch (error) { toast(error.message) } }
export const setSignupAllowed = async allowed => { try { const response = await fetch('/api/platform/user-management', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowSignup: allowed }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to update user management'); state.allowSignup = result.allowSignup; toast(allowed ? 'User account creation enabled' : 'User account creation disabled') } catch (error) { toast(error.message) } }
