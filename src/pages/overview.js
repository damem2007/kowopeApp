import { state } from '../modules/store.js'
import { providers } from '../modules/catalog.js'
import { formatDate } from '../modules/date.js'
import { formatMoney, renderPill } from '../modules/format.js'
import { invoiceStatus, sum } from '../modules/selectors.js'
import { hdr } from '../ui/layout.js'
import { intRow } from './integrations.js'

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))

const localGreeting = () => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return { text: 'Good morning', icon: 'sun' }
  if (hour >= 12 && hour < 18) return { text: 'Good afternoon', icon: 'sun' }
  return { text: 'Good evening', icon: 'moon' }
}

const accountName = () => {
  const savedBusiness = state.businessProfiles?.find(profile => profile.id && profile.n?.trim())
  if (savedBusiness) return savedBusiness.n.trim()
  if (state.authEmail?.trim()) return state.authEmail.split('@')[0]
  return 'Your account'
}

const greetingIcon = iconName => iconName === 'sun'
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.6 8.6 0 1 0 12 12Z"></path></svg>'

const overviewSubtitle = () => {
  const greeting = localGreeting()
  return `<span class="overview-greeting"><span class="overview-greeting-icon">${greetingIcon(greeting.icon)}</span><span>${greeting.text}, ${escapeHtml(accountName())}. Here is where your invoices stand.</span></span>`
}

export function overview() {
  const outstandingTotal = sum(invoice => ["Sent", "Overdue"].includes(invoiceStatus(invoice))), renderKpi = (label, value, tab) => `<button class="card kpi" onclick="go('invoices','${tab}')"><small>${label}</small><b>${value}</b></button>`
  const bad = state.invoices.filter(invoice => invoiceStatus(invoice) === "Overdue")
  return hdr("Overview", overviewSubtitle()) + `<div class="grid k4">${renderKpi("Outstanding", formatMoney(outstandingTotal), "Sent")}${renderKpi("Paid", formatMoney(sum(invoice => invoice.s === "Paid")), "Paid")}${renderKpi("Overdue", formatMoney(sum(invoice => invoiceStatus(invoice) === "Overdue")), "Overdue")}${renderKpi("Total invoices", state.invoices.length, "All")}</div>
<div class="grid two" style="margin-top:16px"><div class="grid">${bad.length ? `<div class="card" style="border-color:var(--bad)"><h2>Needs attention</h2>${bad.map(invoice => `<div class="row b" style="margin-top:12px"><span><b>${invoice.id}</b> · ${state.clientNames[invoice.c].split(" (")[0]} is overdue since ${formatDate(invoice.due)}</span><button class="btn sm" onclick="send('${invoice.id}')">Send reminder</button></div>`).join("")}</div>` : ""}
<div class="card"><div class="row b"><h2>Recent invoices</h2><a class="mut" style="cursor:pointer" onclick="go('invoices')">View all</a></div><div class="tbw"><table>${state.invoices.slice(-5).reverse().map(invoice => `<tr><td><b>${invoice.id}</b> ${invoice.rec ? renderPill("Recurring") : ""}<br><span class="mut">${state.clientNames[invoice.c].split(" (")[0]}</span></td><td>${renderPill(invoiceStatus(invoice))}</td><td class="r">${formatMoney(invoice.a)}</td></tr>`).join("")}</table></div></div></div>
<div class="grid"><div class="card"><h2>Upcoming recurring</h2>${state.recurringServices.filter(recurringService => recurringService.st === "Active").map(recurringService => `<div class="row b" style="margin-top:12px"><span>${state.clientNames[recurringService.c].split(" (")[0]}<br><span class="mut">${recurringService.f} · ${formatDate(recurringService.next)}</span></span><b>${formatMoney(recurringService.a)}</b></div>`).join("") || `<p class="mut">Nothing scheduled. Turn on Repeat when you create an invoice.</p>`}</div>
<div class="card"><div class="row b"><h2>Integrations</h2><a class="mut" style="cursor:pointer" onclick="go('integrations')">Manage</a></div>${Object.keys(providers).map(p => intRow(p)).join("")}</div></div></div>`
}
