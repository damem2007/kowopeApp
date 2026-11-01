import { state } from '../modules/store.js'
import { formatMoney } from '../modules/format.js'

export const recordPaymentModal = () => `<div class="ov c"><div class="md"><h2>Record payment</h2><label class="fl">Invoice</label><select id="pi">${state.invoices.filter(invoice => invoice.s !== "Paid").map(invoice => `<option value="${invoice.id}">${invoice.id} · ${formatMoney(invoice.a)}</option>`).join("")}</select><label class="fl">Method</label><select id="pm"><option>Manual</option><option>Bank transfer</option><option>Cheque</option></select><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Cancel</button><button class="btn" onclick="recPay()">Record payment</button></div></div></div>`
