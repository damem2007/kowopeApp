import { state } from '../modules/store.js'
import { render, toast } from '../ui/render.js'
import { bootLedgerly } from '../modules/bootstrap.js'
import { $ } from '../modules/selectors.js'

async function authenticate(endpoint) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#auth-email').value, password: $('#auth-password').value }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Unable to authenticate')
  state.authenticated = true
  state.authSetupRequired = false
  await bootLedgerly()
}
export const loginAccount = async () => { try { await authenticate('/api/auth/login') } catch (error) { $('#auth-error').textContent = error.message } }
export const signupAccount = async () => { try { await authenticate('/api/auth/signup') } catch (error) { $('#auth-error').textContent = error.message } }
export const logoutAccount = async () => { await fetch('/api/auth/logout', { method: 'POST' }); state.authenticated = false; state.currentRoute = 'login'; render(); toast('Signed out') }
export const changePassword = async () => { try { const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to change password'); $('#current-password').value = ''; $('#new-password').value = ''; toast('Password updated') } catch (error) { toast(error.message) } }
export const setSignupAllowed = async allowed => { try { const response = await fetch('/api/platform/user-management', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowSignup: allowed }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to update user management'); state.allowSignup = result.allowSignup; toast(allowed ? 'User account creation enabled' : 'User account creation disabled') } catch (error) { toast(error.message) } }
