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

export const go = (route, invoiceTab) => { state.currentRoute = route; if (invoiceTab) state.activeInvoiceTab = invoiceTab; state.searchQuery = ""; state.openMenuIndex = 0; state.invoiceEditor = null; render(); scrollTo(0, 0) }
export const toast = (message, undo) => { state.toast = { m: message, u: undo }; render(); clearTimeout(state.tt); state.tt = setTimeout(() => { state.toast = null; render() }, 5000) }

export function render() {
  if (state.currentRoute === 'login') { $("#root").innerHTML = login(); return }
  const pg = { overview, invoices, clients, payments, integrations, settings, new: editor, preview: prevP, svc: service }[state.currentRoute]()
  $("#root").innerHTML = shell(pg) + (state.integrationWizard ? wizView() : "") + (state.activeModal ? modal() : "") + (state.toast ? `<div class="toast" role="status">${state.toast.m}${state.toast.u ? `<button onclick="state.toast.u()">Undo</button>` : ""}</div>` : "")
}
