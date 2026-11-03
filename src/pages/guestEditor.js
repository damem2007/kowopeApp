import { state } from '../modules/store.js'
import { currencySigns } from '../modules/catalog.js'
import { today, addDays } from '../modules/date.js'

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]))
const guestMoney = (amount, code = state.guestInvoice.currency) => {
  const custom = state.guestCurrencies.find(currency => currency.code === code)
  const symbol = custom?.symbol || currencySigns[code] || '$'
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const value = () => state.guestInvoice
const editableContact = (kind, editing, name, address, email, phone, toggle) => editing
  ? `<div class="guest-edit-fields">
      <input id="guest-${kind}-name" value="${escapeHtml(name)}" placeholder="${kind === 'business' ? 'Your business name' : 'Client name'}">
      <textarea id="guest-${kind}-address" placeholder="Address">${escapeHtml(address)}</textarea>
      <input id="guest-${kind}-email" type="email" value="${escapeHtml(email)}" placeholder="Email">
      <input id="guest-${kind}-phone" value="${escapeHtml(phone)}" placeholder="Phone">
      <div class="row guest-edit-actions"><button class="btn sm" onclick="syncGuestEditor();${toggle}()">Done</button><button class="btn s sm" onclick="${toggle}()">Cancel</button></div>
    </div>`
  : `<div class="guest-contact-display"><b>${escapeHtml(name || (kind === 'business' ? 'Your business' : 'Client not selected'))}</b><div class="mut">${escapeHtml(address || '')}${address && email ? '<br>' : ''}${escapeHtml(email || '')}${(email || address) && phone ? '<br>' : ''}${escapeHtml(phone || '')}</div><button class="text-btn" onclick="${toggle}()">${name ? 'Edit' : '+ Add ' + kind}</button></div>`

export const guestEditor = () => {
  const invoice = value()
  const subtotal = invoice.items.reduce((sum, item) => sum + (+item.q || 0) * (+item.p || 0), 0)
  const discount = invoice.dt === '%' ? subtotal * (+invoice.dv || 0) / 100 : (+invoice.dv || 0)
  const tax = (subtotal - discount) * (+invoice.tax || 0) / 100
  const total = subtotal - discount + tax
  const currencies = [...Object.entries(currencySigns).map(([code, symbol]) => ({ code, symbol })), ...state.guestCurrencies]
  return `<div class="ed invoice-prototype-editor guest-invoice-editor">
    <div class="invoice-editor-actions row b"><button class="btn s sm" onclick="leaveGuestInvoice()">← Back</button><div class="row"><button class="btn s" onclick="guestLivePreview()">Preview</button><button class="btn s guest-locked" onclick="promptGuestLogin()">Save draft 🔒</button><button class="btn guest-locked" onclick="promptGuestLogin()">Save &amp; send ▾</button></div></div>
    <article class="card invoice-prototype-card">
      <div class="invoice-prototype-title"><h2>Invoice <span class="mut">GUEST-INVOICE</span></h2><div class="invoice-logo-wrap">${invoice.logoDataUrl ? `<div class="invoice-logo-container invoice-logo-has-image"><img class="invoice-logo-preview" src="${escapeHtml(invoice.logoDataUrl)}" alt="Company logo"><button class="invoice-logo-remove" title="Remove logo" aria-label="Remove logo" onclick="removeGuestLogo()">×</button></div>` : `<label class="invoice-logo-upload"><span class="invoice-logo-icon">▦</span><span><b>Upload your logo</b><small>PNG, JPG or WEBP · max 512 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onchange="readGuestLogo(this)"></label>`}</div></div>
      <div class="invoice-meta-grid guest-meta-grid">
        <section><label class="mut">From</label>${editableContact('business', state.guestBusinessEditing, invoice.businessName, invoice.businessAddress, invoice.businessEmail, invoice.businessPhone, 'toggleGuestBusinessEdit')}</section>
        <section><label class="mut">Bill to</label>${editableContact('client', state.guestClientEditing, invoice.clientName, invoice.clientAddress, invoice.clientEmail, invoice.clientPhone, 'toggleGuestClientEdit')}</section>
        <section><label class="mut">Due date</label><input id="guest-due-date" type="date" onchange="syncGuestEditor()" value="${escapeHtml(invoice.dueDate || addDays(today, 30))}"><div class="invoice-due-chips"><button class="chip" onclick="document.getElementById('guest-due-date').value='';syncGuestEditor()">On receipt</button><button class="chip" onclick="document.getElementById('guest-due-date').value='${addDays(today, 15)}';syncGuestEditor()">Net 15</button><button class="chip active" onclick="document.getElementById('guest-due-date').value='${addDays(today, 30)}';syncGuestEditor()">Net 30</button><button class="chip" onclick="document.getElementById('guest-due-date').value='${addDays(today, 60)}';syncGuestEditor()">Net 60</button></div></section>
      </div>
      <div class="invoice-lines"><div class="invoice-lines-head"><span>Description</span><span>Qty</span><span>Price</span><span>Amount</span></div>${invoice.items.map((item, index) => `<div class="invoice-line"><input id="guest-item-description-${index}" value="${escapeHtml(item.d)}" placeholder="What did you deliver?"><input id="guest-item-quantity-${index}" type="number" min="0" value="${item.q}" oninput="syncGuestEditor();updateGuestTotals()"><input id="guest-item-price-${index}" type="number" min="0" step="0.01" value="${item.p}" oninput="syncGuestEditor();updateGuestTotals()"><span id="guest-item-amount-${index}">${guestMoney(item.q * item.p)}</span><button class="icon-btn" title="Remove line item" onclick="removeGuestItem(${index})">×</button></div>`).join('')}<button class="btn s sm" onclick="addGuestItem()">+ Add line item</button></div>
      <div class="invoice-bottom-grid"><div class="invoice-fields"><label>Currency<select id="guest-currency" onchange="syncGuestEditor();updateGuestTotals()">${currencies.map(currency => `<option value="${currency.code}" ${currency.code === invoice.currency ? 'selected' : ''}>${currency.code} (${currency.symbol})</option>`).join('')}</select></label><button class="text-btn guest-currency-add" onclick="toggleGuestCurrencyEditor()">+ Add currency</button>${state.guestCurrencyEditorOpen ? `<div class="guest-currency-editor"><input id="guest-new-currency-code" maxlength="5" placeholder="Code, e.g. GBP"><input id="guest-new-currency-symbol" maxlength="3" placeholder="Symbol, e.g. £"><button class="btn s sm" onclick="addGuestCurrency()">Add</button></div>` : ''}<label>Tax name and rate (%)<div class="split"><input id="guest-tax-name" value="${escapeHtml(invoice.tn)}"><input id="guest-tax" type="number" value="${invoice.tax}" oninput="syncGuestEditor();updateGuestTotals()"></div></label><label>Discount<div class="split"><input id="guest-discount" type="number" value="${invoice.dv}" oninput="syncGuestEditor();updateGuestTotals()"><select id="guest-discount-type" onchange="syncGuestEditor();updateGuestTotals()"><option value="%" ${invoice.dt === '%' ? 'selected' : ''}>%</option><option value="$" ${invoice.dt === '$' ? 'selected' : ''}>$</option></select></div></label><label>Notes and payment instructions<textarea id="guest-notes" oninput="syncGuestEditor()" placeholder="Optional: bank details, e-transfer instructions or a payment link">${escapeHtml(invoice.notes)}</textarea></label></div><div class="invoice-totals"><div>Subtotal <b id="guest-subtotal">${guestMoney(subtotal)}</b></div><div>Discount <b id="guest-discount-total">−${guestMoney(discount)}</b></div><div id="guest-tax-label">${escapeHtml(invoice.tn)} ${invoice.tax}% <b id="guest-tax-total">${guestMoney(tax)}</b></div><hr><div class="total">Total <b id="guest-total">${guestMoney(total)}</b></div></div></div>
      <div class="invoice-repeat-card guest-locked" onclick="promptGuestLogin()"><div><b>Repeat this invoice</b><span>Create it again on a schedule.</span></div><div class="invoice-repeat-switch">🔒</div></div>
    </article>
  </div>`
}
