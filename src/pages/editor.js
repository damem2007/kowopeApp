import { state } from '../modules/store.js'
import { currencySigns } from '../modules/catalog.js'
import { today, formatDate, addDays, stepFrequency } from '../modules/date.js'
import { $ } from '../modules/selectors.js'
import { formatMoney, renderDetails } from '../modules/format.js'
import { isMail } from '../modules/selectors.js'

export const sample = () => ({ invoiceId: null, businessIndex: 0, n: "", clientIndex: "", items: [{ d: "", q: 1, p: 0 }], tax: 0, tn: "Tax", dv: 0, dt: "%", due: addDays(today, 30), pre: 30, cur: state.defaultCurrency, rep: 0, f: "Monthly", end: "Never", auto: 0, logoDataUrl: "", logoRemoved: false, err: [] })

export const calc = () => { const editor = state.invoiceEditor, subtotal = editor.items.reduce((total, item) => total + item.q * item.p, 0), discount = editor.dt === "%" ? subtotal * editor.dv / 100 : +editor.dv, taxAmount = (subtotal - discount) * editor.tax / 100; return { sub: subtotal, d: discount, tx: taxAmount, tot: subtotal - discount + taxAmount } }

export function repSum() {
  const editor = state.invoiceEditor
  return "Next 3 invoices: " + [1, 2, 3].map(invoiceOffset => formatDate(stepFrequency(today, editor.f, invoiceOffset))).join(", ") + (editor.end !== "Never" ? " · ends after " + editor.end.split(" ")[1] : "") + (editor.auto ? " · sent automatically" : " · created as drafts")
}

export function upd() {
  const totals = calc(), editor = state.invoiceEditor
  $("#sub").textContent = formatMoney(totals.sub); $("#dsc").textContent = "−" + formatMoney(totals.d); $("#tax").textContent = formatMoney(totals.tx); $("#tot").textContent = formatMoney(totals.tot)
  editor.items.forEach((item, itemIndex) => $("#a" + itemIndex).textContent = formatMoney(item.q * item.p))
  $("#tl").textContent = editor.tn + " " + editor.tax + "%"
  if ($("#rs")) $("#rs").textContent = repSum()
}

export function editor() {
  const invoiceEditor = state.invoiceEditor
  const totals = calc()
  const businessProfile = state.businessProfiles[invoiceEditor.businessIndex] || { n: '', a: '', e: '', p: '' }
  const invoiceLogo = invoiceEditor.logoDataUrl || (!invoiceEditor.logoRemoved ? businessProfile.logoDataUrl || '' : '')
  const clientDetails = invoiceEditor.clientIndex !== '' ? state.clientDetails[invoiceEditor.clientIndex] : null
  const invoiceNumber = invoiceEditor.invoiceId || `INV-000${state.invoices.length + 1}`
  const dueOptions = [[0, 'On receipt'], [15, 'Net 15'], [30, 'Net 30'], [60, 'Net 60']]
  const lineItems = invoiceEditor.items.map((lineItem, itemIndex) => `<div class="invoice-line">
    <input placeholder="What did you deliver?" value="${lineItem.d}" oninput="state.invoiceEditor.items[${itemIndex}].d=this.value">
    <input class="quantity-input" type="number" min="0" value="${lineItem.q}" oninput="state.invoiceEditor.items[${itemIndex}].q=+this.value;upd()">
    <input type="number" min="0" value="${lineItem.p}" oninput="state.invoiceEditor.items[${itemIndex}].p=+this.value;upd()">
    <span class="invoice-money" id="a${itemIndex}">${formatMoney(lineItem.q * lineItem.p)}</span>
    <button class="ghost invoice-remove" aria-label="Remove line" onclick="state.invoiceEditor.items.splice(${itemIndex},1);if(!state.invoiceEditor.items.length)state.invoiceEditor.items.push({d:'',q:1,p:0});render()">×</button>
  </div>`).join('')
  return `<div class="ed invoice-prototype-editor">
    <div class="invoice-editor-actions"><button class="btn s sm" onclick="go('invoices')">← Back</button><div class="row">
      <button class="btn s" onclick="state.currentRoute='preview';render();scrollTo(0,0)">Preview</button>
      <button class="btn s" onclick="save('draft')">Save draft</button>
      <details><summary class="btn">Save &amp; send ▾</summary><div class="menu"><button onclick="save('send')">Save &amp; send</button><button onclick="downloadPreviewPdf()">Save &amp; download PDF</button></div></details>
    </div></div>
    <section class="card invoice-prototype-card">
      <div class="invoice-prototype-title"><h2>Invoice <span class="mut">${invoiceNumber}</span></h2><div class="invoice-logo-wrap"><div class="invoice-logo-container"><label class="invoice-logo-upload" aria-label="Upload invoice logo">${invoiceLogo ? `<img src="${invoiceLogo}" alt="Invoice logo" class="invoice-logo-preview">` : '<span class="invoice-logo-icon" aria-hidden="true">⊞</span><span><b>Upload your logo</b><small>PNG, JPG or WEBP · max 512 KB</small></span>'}<input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadInvoiceLogo(this)"></label>${invoiceLogo ? '<button type="button" class="invoice-logo-remove" aria-label="Remove logo" title="Remove logo" onclick="event.preventDefault();event.stopPropagation();removeInvoiceLogo()">&times;</button>' : ''}</div></div></div>
      <div class="invoice-meta-grid">
        <div><label class="fl">From</label><select onchange="state.invoiceEditor.businessIndex=+this.value;render()">${state.businessProfiles.map((profile, index) => `<option value="${index}" ${invoiceEditor.businessIndex === index ? 'selected' : ''}>${profile.n}</option>`).join('')}</select>${renderDetails(businessProfile.n, businessProfile.a, businessProfile.e, businessProfile.p)}<a class="invoice-link" onclick="state.businessLogoDraft=undefined;state.activeModal='biz';state.be=-1;render()">+ Add business</a></div>
        <div><label class="fl">Bill to</label><select onchange="state.invoiceEditor.clientIndex=this.value;render()"><option value="">Select client</option>${state.clientNames.map((clientName, index) => `<option value="${index}" ${invoiceEditor.clientIndex == index && invoiceEditor.clientIndex !== '' ? 'selected' : ''}>${clientName}</option>`).join('')}</select>${clientDetails ? renderDetails(state.clientNames[invoiceEditor.clientIndex], clientDetails.a, clientDetails.e, clientDetails.p) : '<div class="mut invoice-placeholder">Client name, address and contacts appear here.</div>'}<a class="invoice-link" onclick="state.activeModal='client';render()">+ Add client</a></div>
        <div><label class="fl">Due date</label><input type="date" value="${invoiceEditor.due}" onchange="state.invoiceEditor.due=this.value;state.invoiceEditor.pre=0;render()"><div class="chips">${dueOptions.map(([offset, label]) => `<button class="${invoiceEditor.pre === offset && invoiceEditor.due === addDays(today, offset) ? 'on' : ''}" onclick="state.invoiceEditor.due=addDays(today,${offset});state.invoiceEditor.pre=${offset};render()">${label}</button>`).join('')}</div></div>
      </div>
      <div class="invoice-lines"><div class="invoice-lines-head"><span>Description</span><span>Qty</span><span>Price</span><span class="r">Amount</span><span></span></div>${lineItems}</div>
      <button class="btn s sm invoice-add-line" onclick="state.invoiceEditor.items.push({d:'',q:1,p:0});render()">+ Add line item</button>
      <div class="invoice-bottom-grid"><div class="invoice-fields">
        <label class="fl">Currency</label><select onchange="state.invoiceEditor.cur=this.value;upd()">${Object.keys(currencySigns).map(currencyCode => `<option value="${currencyCode}" ${invoiceEditor.cur === currencyCode ? 'selected' : ''}>${currencyCode} (${currencySigns[currencyCode]})</option>`).join('')}</select>
        <label class="fl">Tax name and rate (%)</label><div class="invoice-fields-grid"><input value="${invoiceEditor.tn}" oninput="state.invoiceEditor.tn=this.value;upd()"><input type="number" min="0" value="${invoiceEditor.tax}" oninput="state.invoiceEditor.tax=+this.value;upd()"></div>
        <label class="fl">Discount</label><div class="invoice-fields-grid"><input type="number" min="0" value="${invoiceEditor.dv}" oninput="state.invoiceEditor.dv=+this.value;upd()"><select onchange="state.invoiceEditor.dt=this.value;upd()"><option ${invoiceEditor.dt === '%' ? 'selected' : ''}>%</option><option value="$" ${invoiceEditor.dt !== '%' ? 'selected' : ''}>$</option></select></div>
        <label class="fl">Notes and payment instructions</label><textarea placeholder="Optional: bank details, e-transfer instructions or a payment link" oninput="state.invoiceEditor.n=this.value">${invoiceEditor.n}</textarea>
      </div><div class="invoice-totals"><div><span class="mut">Subtotal</span><span id="sub">${formatMoney(totals.sub)}</span></div><div><span class="mut">Discount</span><span id="dsc">−${formatMoney(totals.d)}</span></div><div><span class="mut" id="tl">${invoiceEditor.tn} ${invoiceEditor.tax}%</span><span id="tax">${formatMoney(totals.tx)}</span></div><div class="big"><span>Total</span><span id="tot">${formatMoney(totals.tot)}</span></div></div></div>
    </section>
    <section class="card invoice-repeat-card"><div class="invoice-repeat-header"><div><h2>Repeat this invoice</h2><span class="mut">Create it again on a schedule.</span></div><label class="invoice-repeat-switch"><input type="checkbox" aria-label="Repeat" ${invoiceEditor.rep ? 'checked' : ''} onchange="state.invoiceEditor.rep=this.checked?1:0;render()"><span aria-hidden="true"></span></label></div>${invoiceEditor.rep ? `<div class="invoice-fields-grid"><div><label class="fl">Frequency</label><select onchange="state.invoiceEditor.f=this.value;upd()">${['Weekly','Biweekly','Monthly','Quarterly','Yearly'].map(frequency => `<option ${invoiceEditor.f === frequency ? 'selected' : ''}>${frequency}</option>`).join('')}</select></div><div><label class="fl">Ends</label><select onchange="state.invoiceEditor.end=this.value;upd()">${['Never','After 6','After 12'].map(endOption => `<option ${invoiceEditor.end === endOption ? 'selected' : ''}>${endOption}</option>`).join('')}</select></div></div><div class="tg"><input type="checkbox" id="au" ${invoiceEditor.auto ? 'checked' : ''} onchange="state.invoiceEditor.auto=this.checked?1:0;upd()"><label for="au">Send automatically${isMail() ? '' : ' (needs an email account)'}</label></div><p id="rs" class="ok">${repSum()}</p>` : ''}</section>
  </div>`
}
