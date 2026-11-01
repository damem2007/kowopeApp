import { state } from '../modules/store.js'
import { providers, icons } from '../modules/catalog.js'
import { invoiceStatus } from '../modules/selectors.js'

export function shell(pageContent) {
  const overdueCount = state.invoices.filter(invoice => invoiceStatus(invoice) === "Overdue").length
  const navLink = (route, label) => `<a class="${state.currentRoute === route ? "on" : ""}" onclick="go('${route}')" tabindex="0" onkeydown="if(event.key==='Enter')go('${route}')"><svg viewBox="0 0 24 24">${icons[route]}</svg>${label}${route === "invoices" && overdueCount ? `<span class="bd">${overdueCount}</span>` : ""}</a>`
  return `<div class="app"><aside><div class="logo"><i><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M6 3h9l4 4v14H6z"/></svg></i>Kowope</div><nav>${navLink("overview", "Overview")}${navLink("invoices", "Invoices")}${navLink("clients", "Clients")}${navLink("payments", "Payments")}${navLink("integrations", "Integrations")}${navLink("settings", "Settings")}</nav><div class="sp"></div><button class="ghost" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'">Toggle dark mode</button><button class="ghost" onclick="logoutAccount()">Sign out</button></aside><main>${pageContent}</main></div>`
}

export const hdr = (title, subtitle, headerAction) => `<div class="hd"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${headerAction === undefined ? `<button class="btn" onclick="newInv()">+ New invoice</button>` : headerAction}</div>`
export const renderProviderBadge = providerId => `<div class="ib" style="background:${providers[providerId][3]}">${providers[providerId][2]}</div>`
