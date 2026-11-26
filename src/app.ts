import { state } from './modules/store.ts'
import { bootKowope } from './modules/bootstrap.ts'
import { initializeBrowserNavigation, toast } from './ui/render.tsx'

declare global {
  interface Window {
    __kowopeApiFeedbackInstalled?: boolean
  }
}

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

void bootKowope().then(() => initializeBrowserNavigation())
}

startApp()
