import { state } from "../modules/store.js";
import { formatMoney } from "../modules/format.js";
import { hdr } from "../ui/layout.js";

export function clients() {
  const clientRows = state.clientNames.map((clientName, clientIndex) => {
    const clientInvoices = state.invoices.filter(invoice => invoice.c === clientIndex)
    const clientDetails = state.clientDetails[clientIndex] || {}
    return `<tr><td><b>${clientName}</b></td><td class="mut">${[clientDetails.e, clientDetails.p].filter(Boolean).join(" · ") || "—"}</td><td>${clientInvoices.length}</td><td class="r">${formatMoney(clientInvoices.reduce((total, invoice) => total + invoice.a, 0))}</td><td class="r"><button class="btn s sm" onclick="editClient(${clientIndex})">Edit</button> <button class="btn s sm" onclick="state.pc=${clientIndex};state.activeModal='past';render()">Add past invoice</button> <button class="btn sm" onclick="svNew(${clientIndex})">Recurring service</button></td></tr>`
  }).join("")
  return (
    hdr(
      "Clients",
      state.clientNames.length + (state.clientNames.length === 1 ? " saved client" : " saved clients"),
      `<button class="btn" onclick="state.activeModal='client';render()">+ New client</button>`,
    ) +
    `<div class="card tbw">${state.clientNames.length ? `<table><tr><th>Client</th><th>Contact</th><th>Invoices</th><th class="r">Total billed</th><th></th></tr>${clientRows}</table>` : `<div class="empty-state" style="padding:56px 20px"><h2>No clients yet</h2><p class="mut">Create your first client to link them to invoices and track what they owe.</p><button class="btn" onclick="state.activeModal='client';render()">+ New client</button></div>`}</div>`
  );
}
