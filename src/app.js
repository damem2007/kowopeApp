import { state } from './modules/store.js'
import { today, addDays } from './modules/date.js'
import { $ } from './modules/selectors.js'
import { nextOn } from './modules/recurrence.js'
import { bootKowope } from './modules/bootstrap.js'
import { go, render, toast } from './ui/render.js'
import { toggleTheme, setTheme, toggleMobileMenu, closeMobileMenu, handleMobileMenuKeydown } from './ui/layout.js'
import { tbl } from './pages/invoices.js'
import { upd } from './pages/editor.js'
import { newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, dup, del, savePast } from './actions/invoices.js'
import { wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext } from './actions/integrations.js'
import { runRec, svNew, svNext, saveRec, saveChg, toggleRecurring, mrs } from './actions/recurring.js'
import { addC, editClient, saveClientEdit } from './actions/clients.js'
import { recPay } from './actions/payments.js'
import { saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup, saveSecuritySettings } from './actions/settings.js'
import { loginAccount, signupAccount, resendVerification, resendUserVerification, setUserSuspended, inviteOrganizationMember, createOrganization, logoutAccount, changePassword, setSignupAllowed, toggleAuthPassword, requestPasswordReset, resetPassword, verifyEmail } from './actions/auth.js'

let started = false

function installApiFeedback() {
  if (window.__kowopeApiFeedbackInstalled) return
  window.__kowopeApiFeedbackInstalled = true
  const nativeFetch = window.fetch.bind(window)
  let pendingRequests = 0
  const updateLoadingState = () => {
    document.body.classList.toggle('api-request-pending', pendingRequests > 0)
    const indicator = document.getElementById('api-progress')
    if (indicator) indicator.hidden = pendingRequests === 0
  }
  window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (!url.includes('/api/')) return nativeFetch(input, options)
    pendingRequests += 1
    updateLoadingState()
    try {
      const response = await nativeFetch(input, options)
      if (!response.ok && !url.includes('/api/auth/status')) {
        let message = `Request failed (${response.status})`
        try {
          const body = await response.clone().json()
          message = body.error || body.message || message
        } catch { /* Preserve the HTTP status for non-JSON responses. */ }
        toast(message, undefined, { error: true, persistent: true })
      }
      return response
    } catch (error) {
      toast(error.message || 'Unable to connect to Kowope.', undefined, { error: true, persistent: true })
      throw error
    } finally {
      pendingRequests -= 1
      updateLoadingState()
    }
  }
}

export function startApp() {
  if (started) return
  started = true
  installApiFeedback()
  const resetToken = new URLSearchParams(window.location.search).get('reset')
  if (resetToken) { state.authMode = 'reset'; state.resetToken = resetToken }
  const verifyToken = new URLSearchParams(window.location.search).get('verify')
  if (verifyToken) { state.authMode = 'verify'; state.verifyToken = verifyToken }

// Inline onclick/onchange handlers in the rendered markup resolve names on window.
Object.assign(window, {
  state, $, today, addDays, nextOn, tbl, upd, mrs,
  go, render, toggleTheme, setTheme, toggleMobileMenu, closeMobileMenu, handleMobileMenuKeydown, newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, dup, del, savePast,
  wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext,
  runRec, svNew, svNext, saveRec, saveChg, toggleRecurring,
  addC, editClient, saveClientEdit,
  recPay,
  saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup, saveSecuritySettings,
  loginAccount, signupAccount, resendVerification, resendUserVerification, setUserSuspended, inviteOrganizationMember, createOrganization, logoutAccount, changePassword, setSignupAllowed, toggleAuthPassword, requestPasswordReset, resetPassword, verifyEmail,
})

bootKowope()
}

startApp()
