import { state } from '../modules/store.js'
import { formatDate, today } from '../modules/date.js'
import { currencySigns } from '../modules/catalog.js'

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const guestMoney = (amount, currencyCode) => {
  const customCurrency = (state.guestCurrencies || []).find(currency => currency.code === currencyCode)
  const symbol = customCurrency?.symbol || currencySigns[currencyCode] || '$'
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const guestPreview = () => {
  const invoice = state.guestInvoice
  const subtotal = invoice.items.reduce((sum, item) => sum + (+item.q || 0) * (+item.p || 0), 0)
  const discount = invoice.dt === '%' ? subtotal * (+invoice.dv || 0) / 100 : (+invoice.dv || 0)
  const tax = (subtotal - discount) * (+invoice.tax || 0) / 100
  const total = subtotal - discount + tax
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : 'Not set'
  const currency = invoice.currency
  const businessAddress = escapeHtml(invoice.businessAddress).replace(/\n/g, '<br>')
  const clientAddress = escapeHtml(invoice.clientAddress).replace(/\n/g, '<br>')
  const notes = escapeHtml(invoice.notes || `Payment is due on ${dueDate}. Please quote invoice number GUEST-INVOICE with your payment.`).replace(/\n/g, '<br>')
  const lineItems = invoice.items.filter(item => item.d || item.p > 0).map(item => `<tr><td>${escapeHtml(item.d || '—')}</td><td style="text-align:right">${escapeHtml(item.q)}</td><td style="text-align:right">${guestMoney(item.p, currency)}</td><td style="text-align:right">${guestMoney(item.q * item.p, currency)}</td></tr>`).join('') || '<tr><td colspan="4">No line items yet</td></tr>'
  return `<div style="max-width:794px;margin:0 auto"><div class="row b" style="margin-bottom:10px"><button class="btn s sm" onclick="state.currentRoute='guest-new';render()">← Back to editing</button><div class="row"><button class="btn s" onclick="guestDownload()">Download PDF</button><button class="btn" onclick="promptGuestLogin()">Send invoice 🔒</button></div></div><p class="mut">This is exactly what your client will receive. Nothing has been sent yet.</p><article class="guest-document" style="background:#fff;color:#1b1a24;padding:clamp(20px,6vw,56px);font:14px/1.55 Georgia,serif"><header style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding-bottom:22px;border-bottom:3px double #1b1a24"><div>${invoice.logoDataUrl ? `<img src="${escapeHtml(invoice.logoDataUrl)}" alt="Company logo" style="max-width:140px;max-height:60px;object-fit:contain">` : ''}<b style="display:block;font-size:24px">${escapeHtml(invoice.businessName || 'Your business')}</b><div style="margin-top:6px">${businessAddress}<br>${escapeHtml(invoice.businessEmail)}<br>${escapeHtml(invoice.businessPhone)}</div></div><div style="text-align:right"><b style="font-size:30px;letter-spacing:.16em">INVOICE</b><div>No. GUEST-INVOICE</div></div></header><section style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin:26px 0"><div><i>Billed to</i><div style="font-weight:700;font-size:17px">${escapeHtml(invoice.clientName || 'Client not selected')}</div><div>${clientAddress}<br>${escapeHtml(invoice.clientEmail)}<br>${escapeHtml(invoice.clientPhone)}</div></div><div>Invoice number: GUEST-INVOICE<br>Date of issue: ${formatDate(today)}<br>Payment due: ${dueDate}<br>Currency: ${escapeHtml(currency)}</div></section><div style="border:1px solid #1b1a24;padding:12px 16px;margin-bottom:26px;display:flex;justify-content:space-between"><span>Amount due by ${dueDate}</span><b>${guestMoney(total, currency)} ${escapeHtml(currency)}</b></div><table style="width:100%"><tr><th style="text-align:left">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Amount</th></tr>${lineItems}</table><div style="margin-left:auto;max-width:300px;margin-top:14px">Subtotal ${guestMoney(subtotal, currency)}<br>Discount −${guestMoney(discount, currency)}<br>${escapeHtml(invoice.tn)} ${escapeHtml(invoice.tax)}% ${guestMoney(tax, currency)}<hr><b>Total due ${guestMoney(total, currency)}</b></div><section style="margin-top:32px"><b>Payment terms and instructions</b><p>${notes}</p></section></article></div>`
}
