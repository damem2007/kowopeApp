import { state } from '../modules/store.js'
import { providers } from '../modules/catalog.js'
import { $ } from '../modules/selectors.js'
import { integrationSteps } from '../modules/integrationFlows.js'
import { render, toast } from '../ui/render.js'

export function wiz(providerId, stepIndex) { state.integrationWizard = { p: providerId, i: stepIndex || 0, busy: 0, err: "", ok: 0, mailConfig: state.integrations[providerId]?.config || {} }; render() }
export function manageIntegration(providerId) {
  const integration = state.integrations[providerId] || {}
  state.currentRoute = 'integrations'
  state.searchQuery = ''
  state.openMenuIndex = 0
  state.invoiceEditor = null
  state.integrationWizard = { p: providerId, i: integration.on ? 1 : 0, busy: 0, err: "", ok: 0, mailConfig: integration.config || {} }
  render()
  scrollTo(0, 0)
}
export function insertEmailToken(token) {
  const focusedField = document.activeElement?.id === 'mail-subject' || document.activeElement?.id === 'mail-message' ? document.activeElement : document.querySelector('#mail-subject')
  if (!focusedField) return
  const start = focusedField.selectionStart ?? focusedField.value.length
  const end = focusedField.selectionEnd ?? start
  focusedField.value = `${focusedField.value.slice(0, start)}${token}${focusedField.value.slice(end)}`
  focusedField.focus()
  const cursorPosition = start + token.length
  focusedField.setSelectionRange(cursorPosition, cursorPosition)
}
export const disc = async providerId => { try { const response = await fetch(`/api/integrations/${providerId}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Unable to disconnect provider'); state.integrations[providerId] = {}; render(); toast(providers[providerId][0] + " disconnected") } catch (error) { toast(error.message) } }
export const savePreferredEmailProvider = async providerId => {
  const businessProfile = state.businessProfiles[0] || {}
  const response = await fetch('/api/business-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: businessProfile.id || null, name: businessProfile.n || '', address: businessProfile.a || '', email: businessProfile.e || '', phone: businessProfile.p || '', paymentInstructions: businessProfile.paymentInstructions || '', invoicePrefix: businessProfile.invoicePrefix || 'INV-', invoiceNumberPadding: businessProfile.invoicePadding || 4, invoiceNumberFormat: businessProfile.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider: providerId, defaultCurrency: state.defaultCurrency }) })
  const savedProfile = await response.json()
  if (!response.ok) return toast(savedProfile.error || 'Unable to save provider preference')
  state.businessProfiles[0].preferredEmailProvider = providerId
  toast(`${providers[providerId][0]} selected for sending`)
}
const runIntegrationStep = callback => { state.integrationWizard.busy = 1; render(); setTimeout(() => { if (!state.integrationWizard) return; state.integrationWizard.busy = 0; state.integrationWizard.ok = 0; callback(); render() }, 900) }

export function wnext() {
  const wizard = state.integrationWizard, step = integrationSteps[wizard.p][wizard.i]; wizard.err = ""
  if (step === "connect" && wizard.p === 'outlook') return window.location.href = '/api/integrations/outlook/oauth/start'
  if (step === "connect" && wizard.p === 'mailjet') {
    const apiKey = $("#mailjet-key")?.value.trim() || '', secretKey = $("#mailjet-secret")?.value || '', senderEmail = $("#mailjet-sender")?.value.trim() || '', senderName = $("#mailjet-name")?.value.trim() || ''
    if (!apiKey || !secretKey || !senderEmail || !senderName) { wizard.err = 'Enter all Mailjet connection details.'; return render() }
    wizard.mailConfig = { authType: 'mailjet', apiKey, secretKey, senderEmail, senderName }
  }
  if (step === "connect" && wizard.p === 'gmail') {
    const emailAddress = $("#mail-account")?.value.trim() || '', smtpPassword = $("#mail-password")?.value || ''
    if (!emailAddress || !smtpPassword) { wizard.err = 'Enter the email address and app password.'; return render() }
    wizard.mailConfig = { emailAddress, smtpPassword, host: wizard.p === 'gmail' ? 'smtp.gmail.com' : 'smtp.office365.com', port: wizard.p === 'gmail' ? 465 : 587, secure: wizard.p === 'gmail' }
  }
  if (step === 'mail') {
    wizard.mailConfig = { ...(wizard.mailConfig || {}), subject: $("#mail-subject")?.value.trim() || '{{invoice_number}} from {{business_name}}', fromName: $("#mail-from-name")?.value.trim() || '', message: $("#mail-message")?.value || '', attachPdf: $("#mail-attach-pdf")?.checked ? 1 : 0, bccCopy: $("#mail-bcc-copy")?.checked ? 1 : 0, reminderEnabled: $("#mail-reminders")?.checked ? 1 : 0 }
  }
  if (step === "keys") { const secretKey = ($("#key") || {}).value || ""; if (!/^(sk|rk)_(test|live)_\w{6,}/.test(secretKey)) { wizard.err = "Enter a valid Stripe secret key, such as sk_test_… from your Stripe dashboard."; return render() } return runIntegrationStep(() => wizard.i++) }
  if (["connect", "test", "sync"].includes(step)) return runIntegrationStep(() => wizard.i++)
  if (step === "done") { const accountLabel = wizard.p === "stripe" ? "Stripe account" : wizard.p === "qb" ? "QuickBooks account" : wizard.p === "gmail" ? "Gmail account" : wizard.p === "mailjet" ? "Mailjet account" : "Outlook account"; const savedConfig = wizard.mailConfig || {}; wizard.busy = 1; render(); fetch(`/api/integrations/${wizard.p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'connected', accountLabel, config: savedConfig }) }).then(async response => { const savedIntegration = await response.json(); if (!response.ok) throw new Error(savedIntegration.error || 'Unable to connect provider'); state.integrations[wizard.p] = { on: 1, acct: accountLabel, config: savedConfig }; const providerName = providers[wizard.p][0]; state.integrationWizard = null; toast(providerName + " is connected") }).catch(error => { if (state.integrationWizard) { state.integrationWizard.busy = 0; state.integrationWizard.err = error.message; render() } }); return }
  wizard.i++; render()
}
