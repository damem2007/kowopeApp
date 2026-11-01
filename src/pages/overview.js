import { state } from '../modules/store.js'
import { providers } from '../modules/catalog.js'
import { formatDate } from '../modules/date.js'
import { formatMoney, renderPill } from '../modules/format.js'
import { invoiceStatus, sum } from '../modules/selectors.js'
import { hdr } from '../ui/layout.js'
import { intRow } from './integrations.js'

export function overview() {
  const outstandingTotal = sum(invoice => ["Sent", "Overdue"].includes(invoiceStatus(invoice))), renderKpi = (label, value, tab) => `<button class="card kpi" onclick="go('invoices','${tab}')"><small>${label}</small><b>${value}</b></button>`
  const bad = state.invoices.filter(invoice => invoiceStatus(invoice) === "Overdue")
  return hdr("Overview", "Good morning. Here is where your invoices stand.") + `<div class="grid k4">${renderKpi("Outstanding", formatMoney(outstandingTotal), "Sent")}${renderKpi("Paid", formatMoney(sum(invoice => invoice.s === "Paid")), "Paid")}${renderKpi("Overdue", formatMoney(sum(invoice => invoiceStatus(invoice) === "Overdue")), "Overdue")}${renderKpi("Total invoices", state.invoices.length, "All")}</div>
<div class="grid two" style="margin-top:16px"><div class="grid">${bad.length ? `<div class="card" style="border-color:var(--bad)"><h2>Needs attention</h2>${bad.map(invoice => `<div class="row b" style="margin-top:12px"><span><b>${invoice.id}</b> · ${state.clientNames[invoice.c].split(" (")[0]} is overdue since ${formatDate(invoice.due)}</span><button class="btn sm" onclick="send('${invoice.id}')">Send reminder</button></div>`).join("")}</div>` : ""}
<div class="card"><div class="row b"><h2>Recent invoices</h2><a class="mut" style="cursor:pointer" onclick="go('invoices')">View all</a></div><div class="tbw"><table>${state.invoices.slice(-5).reverse().map(invoice => `<tr><td><b>${invoice.id}</b> ${invoice.rec ? renderPill("Recurring") : ""}<br><span class="mut">${state.clientNames[invoice.c].split(" (")[0]}</span></td><td>${renderPill(invoiceStatus(invoice))}</td><td class="r">${formatMoney(invoice.a)}</td></tr>`).join("")}</table></div></div></div>
<div class="grid"><div class="card"><h2>Upcoming recurring</h2>${state.recurringServices.filter(recurringService => recurringService.st === "Active").map(recurringService => `<div class="row b" style="margin-top:12px"><span>${state.clientNames[recurringService.c].split(" (")[0]}<br><span class="mut">${recurringService.f} · ${formatDate(recurringService.next)}</span></span><b>${formatMoney(recurringService.a)}</b></div>`).join("") || `<p class="mut">Nothing scheduled. Turn on Repeat when you create an invoice.</p>`}</div>
<div class="card"><div class="row b"><h2>Integrations</h2><a class="mut" style="cursor:pointer" onclick="go('integrations')">Manage</a></div>${Object.keys(providers).map(p => intRow(p)).join("")}</div></div></div>`
}
