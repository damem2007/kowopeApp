import { state } from '../modules/store.js'
import { render, toast } from '../ui/render.js'
import { bootLedgerly } from '../modules/bootstrap.js'
import { $ } from '../modules/selectors.js'

async function authenticate(endpoint) {
  if (state.authBusy) return
  const email = $('#auth-email').value
  const password = $('#auth-password').value
  state.authBusy = true
  render()
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to authenticate')
    state.authenticated = true
    state.authSetupRequired = false
    await bootLedgerly()
  } finally {
    state.authBusy = false
  }
}
export const loginAccount = async () => { try { await authenticate('/api/auth/login') } catch (error) { state.authBusy = false; render(); $('#auth-error').textContent = error.message } }
export const signupAccount = async () => { try { await authenticate('/api/auth/signup') } catch (error) { state.authBusy = false; render(); $('#auth-error').textContent = error.message } }
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
    $('#auth-error').textContent = error.message
  }
}
export const logoutAccount = async () => { await fetch('/api/auth/logout', { method: 'POST' }); state.authenticated = false; state.currentRoute = 'login'; render(); toast('Signed out') }
export const changePassword = async () => { try { const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to change password'); $('#current-password').value = ''; $('#new-password').value = ''; toast('Password updated') } catch (error) { toast(error.message) } }
export const setSignupAllowed = async allowed => { try { const response = await fetch('/api/platform/user-management', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowSignup: allowed }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to update user management'); state.allowSignup = result.allowSignup; toast(allowed ? 'User account creation enabled' : 'User account creation disabled') } catch (error) { toast(error.message) } }
