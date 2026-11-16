import { state } from './modules/store.ts'
import { today, addDays } from './modules/date.ts'
import { querySelector } from './modules/selectors.ts'
import { nextOn } from './modules/recurrence.ts'
import { bootKowope } from './modules/bootstrap.ts'
import { go, initializeBrowserNavigation, render, toast } from './ui/render.tsx'
import { toggleTheme, setTheme, toggleMobileMenu, closeMobileMenu, handleMobileMenuKeydown } from './ui/layout.tsx'
import { tbl } from './pages/invoices.tsx'
import { upd } from './pages/editor.tsx'
import { uploadBusinessLogo } from './actions/settings.ts'
import { newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, uploadInvoiceLogo, removeInvoiceLogo, dup, del, savePast } from './actions/invoices.ts'
import { wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext } from './actions/integrations.ts'
import { runRec, svNew, svNext, saveRec, saveChg, toggleRecurring, cancelRecurring, mrs } from './actions/recurring.ts'
import { addC, editClient, saveClientEdit } from './actions/clients.ts'
import { recPay } from './actions/payments.ts'
import { saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup, saveSecuritySettings } from './actions/settings.ts'
import { loginAccount, signupAccount, resendVerification, resendUserVerification, setUserSuspended, 
  inviteOrganizationMember, createOrganization, logoutAccount, changePassword, 
  setSignupAllowed, toggleAuthPassword, requestPasswordReset, resetPassword, verifyEmail, 
  openGuestInfo, closeGuestInfo, startGuestInvoice, leaveGuestInvoice, guestPreview, guestDownload, 
  readGuestLogo, syncGuestEditor, updateGuestTotals, addGuestItem, removeGuestItem, promptGuestLogin, 
  guestLivePreview, toggleGuestBusinessEdit, toggleGuestClientEdit, removeGuestLogo, toggleGuestCurrencyEditor, 
  addGuestCurrency } from './actions/auth.ts'

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
    const url = typeof input === 'string' ? input : (input as Request).url || String(input)
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

// Retain legacy action aliases for React callback compatibility during the transition.
Object.assign(window, {
  state, querySelector, today, addDays, nextOn, tbl, upd, uploadBusinessLogo, mrs,
  go, render, toggleTheme, setTheme, toggleMobileMenu, closeMobileMenu, handleMobileMenuKeydown, newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, uploadInvoiceLogo, removeInvoiceLogo, dup, del, savePast,
  wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext,
  runRec, svNew, svNext, saveRec, saveChg, toggleRecurring, cancelRecurring,
  addC, editClient, saveClientEdit,
  recPay,
  saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup, saveSecuritySettings,
  loginAccount, signupAccount, resendVerification, resendUserVerification, setUserSuspended, inviteOrganizationMember, createOrganization, logoutAccount, changePassword, setSignupAllowed, toggleAuthPassword, requestPasswordReset, resetPassword, verifyEmail, openGuestInfo, closeGuestInfo, startGuestInvoice, leaveGuestInvoice, guestPreview, guestDownload, readGuestLogo, syncGuestEditor, updateGuestTotals, addGuestItem, removeGuestItem, promptGuestLogin, guestLivePreview, toggleGuestBusinessEdit, toggleGuestClientEdit, removeGuestLogo, toggleGuestCurrencyEditor, addGuestCurrency,
})

void bootKowope().then(() => initializeBrowserNavigation())
}

startApp()
