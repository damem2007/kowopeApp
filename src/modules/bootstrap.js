import { state } from './store.js'
import { providers, currencySigns, currencyNames } from './catalog.js'
import { render } from '../ui/render.js'

export async function bootKowope() {
  const authResponse = await fetch('/api/auth/status')
  const authStatus = await authResponse.json()
  state.allowSignup = authStatus.allowSignup
  state.ownerSetupRequired = Boolean(authStatus.ownerSetupRequired)
  state.authUserRole = authStatus.role || null
  state.authEmail = authStatus.email || ''
  if (!authStatus.authenticated) { state.authenticated = false; state.currentRoute = 'login'; render(); return }
  state.authenticated = true
  state.currentRoute = 'overview'
  const defaultIntegrations = Object.fromEntries(Object.keys(providers).map(providerId => [providerId, { on: false, acct: '' }]))
  try {
    // The singular profile endpoint is the canonical API contract. It returns
    // the authenticated user's selected profile (or an empty object when no
    // profile has been saved yet), so bootstrap never depends on a missing
    // plural alias and never produces a misleading 404 in the browser.
    const endpoints = ['/api/clients', '/api/invoices', '/api/business-profile', '/api/integrations', '/api/payments', '/api/recurring', '/api/currencies']
    endpoints.push('/api/organization')
    if (state.authUserRole === 'owner') endpoints.push('/api/account/security', '/api/platform/users')
    const responses = await Promise.allSettled(endpoints.map(endpoint => fetch(endpoint)))
    const parseJsonResponse = async (response, endpoint) => {
      const responseType = response.headers.get('content-type') || ''
      if (!response.ok || !responseType.includes('application/json')) throw new Error(`${endpoint} returned ${response.status} ${responseType || 'non-JSON response'}`)
      return response.json()
    }
    const readResponse = async (responseResult, endpoint, fallback) => responseResult.status === 'fulfilled' ? parseJsonResponse(responseResult.value, endpoint).catch(error => { console.error(`Kowope API request failed: ${endpoint}`, error); return fallback }) : (console.error(`Kowope API request failed: ${endpoint}`, responseResult.reason), fallback)
    const readBusinessProfiles = async responseResult => {
      if (responseResult.status !== 'fulfilled') {
        console.error('Kowope API request failed: /api/business-profile', responseResult.reason)
        return []
      }

      const response = responseResult.value
      return parseJsonResponse(response, '/api/business-profile').then(profile => {
        // An account without a saved business profile is a valid empty state.
        return profile && typeof profile === 'object' && Object.keys(profile).length ? [profile] : []
      }).catch(error => {
        console.error('Kowope API request failed: /api/business-profile', error)
        return []
      })
    }
    const [clients, invoices, businessProfiles, integrationRecords, paymentRecords, recurringRecords, currencies] = await Promise.all([
      readResponse(responses[0], '/api/clients', []),
      readResponse(responses[1], '/api/invoices', []),
      readBusinessProfiles(responses[2]),
      readResponse(responses[3], '/api/integrations', []),
      readResponse(responses[4], '/api/payments', []),
      readResponse(responses[5], '/api/recurring', []),
      readResponse(responses[6], '/api/currencies', []),
    ])
    const organizationResponseIndex = 7
    state.organization = await readResponse(responses[organizationResponseIndex], '/api/organization', null)
    if (state.authUserRole === 'owner') {
      state.securitySettings = await readResponse(responses[8], '/api/account/security', null)
      state.platformUsers = await readResponse(responses[9], '/api/platform/users', [])
    }
    currencies.forEach(currency => { currencySigns[currency.code] = currency.sign; currencyNames[currency.code] = currency.name })
    const firstBusinessProfile = businessProfiles[0] || {}
    state.defaultCurrency = firstBusinessProfile.default_currency || 'USD'
    state.clientNames = clients.map(clientRecord => clientRecord.name)
    state.clientIds = clients.map(clientRecord => clientRecord.id)
    state.clientDetails = clients.map(clientRecord => ({ e: clientRecord.email, p: clientRecord.phone || '', a: clientRecord.address || '' }))
    state.invoices = invoices.map(invoiceRecord => ({ id: invoiceRecord.number, c: Math.max(0, clients.findIndex(clientRecord => clientRecord.id === invoiceRecord.client_id)), a: Number(invoiceRecord.amount), due: invoiceRecord.due_date || '', s: invoiceRecord.status, rec: false, cur: invoiceRecord.currency || 'USD', n: invoiceRecord.payment_instructions || '' }))
    state.payments = paymentRecords.map(paymentRecord => ({ d: paymentRecord.date, inv: paymentRecord.invoice_number || paymentRecord.invoice_id, c: Math.max(0, clients.findIndex(clientRecord => clientRecord.id === paymentRecord.client_id)), m: paymentRecord.method || paymentRecord.source || 'Manual', a: Number(paymentRecord.amount) }))
    state.recurringServices = recurringRecords.map(scheduleRecord => ({ id: scheduleRecord.id, c: Math.max(0, clients.findIndex(clientRecord => clientRecord.id === scheduleRecord.client_id)), a: Number(scheduleRecord.current_amount || 0), d: scheduleRecord.description, f: scheduleRecord.frequency, next: scheduleRecord.next_run_at, st: scheduleRecord.status === 'active' ? 'Active' : 'Paused', auto: scheduleRecord.auto_send, src: scheduleRecord.source_invoice_id }))
    state.businessProfiles = businessProfiles.length ? businessProfiles.map(businessProfile => ({ id: businessProfile.id, n: businessProfile.name || 'Your business', a: businessProfile.address || '', e: businessProfile.email || '', p: businessProfile.phone || '', paymentInstructions: businessProfile.payment_instructions || '', invoicePrefix: businessProfile.invoice_prefix || 'INV-', invoicePadding: businessProfile.invoice_number_padding || 4, invoiceFormat: businessProfile.invoice_number_format || '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider: businessProfile.preferred_email_provider || '', logoDataUrl: businessProfile.logo_data_url || '' })) : [{ n: 'Your business', a: '', e: '', p: '', paymentInstructions: '', invoicePrefix: 'INV-', invoicePadding: 4, invoiceFormat: '{PREFIX}{YYYY}-{NUMBER}', preferredEmailProvider: '', logoDataUrl: '' }]
    // Integration status is platform-global. Every authenticated user may see
    // the status, while the API withholds configuration secrets from nonowners.
    // Only known provider rows are mapped; a missing row means Off.
    const connectedIntegrations = Object.fromEntries(integrationRecords.map(integrationRecord => [integrationRecord.provider, {
      on: integrationRecord.connected === true || String(integrationRecord.status || '').toLowerCase() === 'connected',
      acct: integrationRecord.account_label || '',
      config: (() => { try { return JSON.parse(integrationRecord.config_json || '{}') } catch { return {} } })(),
    }]))
    state.integrations = Object.fromEntries(Object.keys(providers).map(providerId => [providerId, connectedIntegrations[providerId] || { on: false, acct: '' }]))
  } catch (error) {
    console.error('Kowope API bootstrap failed', error)
    state.clientNames = state.clientNames || []
    state.clientIds = state.clientIds || []
    state.clientDetails = state.clientDetails || []
    state.invoices = state.invoices || []
    state.payments = state.payments || []
    state.recurringServices = state.recurringServices || []
    state.businessProfiles = state.businessProfiles?.length ? state.businessProfiles : [{ n: 'Your business', a: '', e: '', p: '' }]
    state.integrations = defaultIntegrations
  }
  render()
}
