import { state } from '../modules/store.js'
import { $ } from '../modules/selectors.js'
import { shell } from './layout.js'
import { overview } from '../pages/overview.js'
import { invoices } from '../pages/invoices.js'
import { clients } from '../pages/clients.js'
import { payments } from '../pages/payments.js'
import { integrations } from '../pages/integrations.js'
import { settings } from '../pages/settings.js'
import { editor } from '../pages/editor.js'
import { prevP } from '../pages/preview.js'
import { service } from '../pages/service.js'
import { wizView } from '../modals/integrationWizard.js'
import { modal } from '../modals/index.js'
import { login } from '../pages/login.js'
import { platformUsers } from '../pages/platformUsers.js'
import { organization } from '../pages/organization.js'

export const go = (route, invoiceTab) => { state.currentRoute = route; if (invoiceTab) state.activeInvoiceTab = invoiceTab; state.searchQuery = ""; state.openMenuIndex = 0; state.invoiceEditor = null; render(); scrollTo(0, 0) }
export const toast = (message, undo, options = {}) => {
  // Do not let a follow-up catch block replace a persistent API error with a
  // short-lived success-style notification.
  if (state.toast?.persistent && !options.error) return
  state.toast = { m: message, u: undo, error: Boolean(options.error), persistent: Boolean(options.persistent) }
  render()
  clearTimeout(state.tt)
  if (!state.toast.persistent) state.tt = setTimeout(() => { state.toast = null; render() }, 8000)
}

export function render() {
  const progress = '<div id="api-progress" class="api-progress" role="progressbar" aria-label="Working" hidden></div>'
  if (state.currentRoute === 'login') { $("#root").innerHTML = progress + login(); return }
  const pg = { overview, invoices, clients, payments, integrations, users: platformUsers, organization, settings, new: editor, preview: prevP, svc: service }[state.currentRoute]()
  $("#root").innerHTML = progress + shell(pg) + (state.integrationWizard ? wizView() : "") + (state.activeModal ? modal() : "") + (state.toast ? `<div class="toast ${state.toast.error ? 'toast-error' : 'toast-success'}" role="alert">${state.toast.m}${state.toast.persistent ? `<button onclick="state.toast=null;render()" aria-label="Dismiss">×</button>` : ''}${state.toast.u ? `<button onclick="state.toast.u()">Undo</button>` : ""}</div>` : "")
}
