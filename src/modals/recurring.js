import { state } from '../modules/store.js'
import { formatDate, stepFrequency } from '../modules/date.js'
import { formatMoney } from '../modules/format.js'
import { isMail } from '../modules/selectors.js'
import { nextOn } from '../modules/recurrence.js'

export const makeRecurringModal = () => {
  const invoice = state.invoices.find(candidate => candidate.id === state.mr), nextDate = nextOn(invoice, "Monthly")
  return `<div class="ov c"><div class="md"><h2>Make ${invoice.id} recurring</h2><p class="mut" style="margin:6px 0 0">${state.clientNames[invoice.c].split(" (")[0]} is billed ${formatMoney(invoice.a)} each time. Future invoices copy this one.</p><label class="fl">Amount for new invoices</label><input id="ma" type="number" min="0" step="0.01" value="${invoice.a}"><div class="mut" style="font-size:12px">${invoice.id} keeps its ${formatMoney(invoice.a)} in your history.</div><label class="fl">Frequency</label><select id="mf" onchange="$('#mrd').value=nextOn(state.invoices.find(candidate=>candidate.id===state.mr),this.value);mrs()">${["Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"].map(frequency => `<option ${frequency === "Monthly" ? "selected" : ""}>${frequency}</option>`).join("")}</select><label class="fl">First new invoice on</label><input type="date" id="mrd" value="${nextDate}" onchange="mrs()"><div class="tg"><input type="checkbox" id="mau"><label for="mau">Send automatically${isMail() ? "" : " (needs an email account)"}</label></div><p id="mrp" class="ok" style="margin:10px 0 0">Next 3 invoices: ${[0, 1, 2].map(offset => formatDate(stepFrequency(nextDate, "Monthly", offset))).join(", ")}</p><div id="mre" class="err"></div><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Not now</button><button class="btn" onclick="saveRec()">Create schedule</button></div></div></div>`
}

export const changePriceModal = () => {
  const r = state.recurringServices[state.cr]
  return `<div class="ov c"><div class="md"><h2>Change price</h2><p class="mut" style="margin:6px 0 0">Invoices already issued keep their amounts. Only invoices created from the effective date use the new price.</p><label class="fl">New amount (currently ${formatMoney(r.a)})</label><input id="ca2" type="number" min="0" step="0.01"><label class="fl">Effective from</label><input id="cf" type="date" value="${r.next}"><div id="ce2" class="err"></div><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Cancel</button><button class="btn" onclick="saveChg()">Apply price change</button></div></div></div>`
}
