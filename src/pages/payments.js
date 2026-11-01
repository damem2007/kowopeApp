import { state } from '../modules/store.js'
import { formatDate } from '../modules/date.js'
import { formatMoney, renderPill } from '../modules/format.js'
import { hdr } from '../ui/layout.js'

export function payments() {
  return hdr("Payments", "Every payment, matched to its invoice.", `<button class="btn" onclick="state.activeModal='pay';render()">Record payment</button>`) + `<div class="card tbw"><table><tr><th>Date</th><th>Invoice</th><th>Client</th><th>Source</th><th class="r">Amount</th></tr>${state.payments.map(p => `<tr><td>${formatDate(p.d)}</td><td><b>${p.inv}</b></td><td>${state.clientNames[p.c].split(" (")[0]}</td><td>${renderPill(p.m, "Sent")}</td><td class="r">${formatMoney(p.a)}</td></tr>`).join("") || `<tr><td class="mut">No payments yet.</td></tr>`}</table></div>`
}
