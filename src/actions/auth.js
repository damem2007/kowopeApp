import { state } from '../modules/store.js'
import { render, toast } from '../ui/render.js'
import { bootKowope } from '../modules/bootstrap.js'
import { $ } from '../modules/selectors.js'

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
export const changePassword = async () => { try { const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to change password'); $('#current-password').value = ''; $('#new-password').value = ''; toast('Password updated') } catch (error) { toast(error.message) } }
export const setSignupAllowed = async allowed => { try { const response = await fetch('/api/platform/user-management', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowSignup: allowed }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to update user management'); state.allowSignup = result.allowSignup; toast(allowed ? 'User account creation enabled' : 'User account creation disabled') } catch (error) { toast(error.message) } }
