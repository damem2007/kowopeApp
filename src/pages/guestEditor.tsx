import React from 'react';
import { state } from '../modules/store.ts';
import { currencySigns } from '../modules/catalog.tsx';
import { today, addDays } from '../modules/date.ts';
const escapeHtml = value => String(value ?? ''); // React escapes rendered text and attributes automatically.
const guestMoney = (amount, code = state.guestInvoice.currency) => {
  const custom = state.guestCurrencies.find(currency => currency.code === code);
  const symbol = custom?.symbol || currencySigns[code] || '$';
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};
const value = () => state.guestInvoice;
const editableContact = (kind, editing, name, address, email, phone, toggle) => editing ? <div className="guest-edit-fields">
      <input id={`guest-${kind}-name`} defaultValue={escapeHtml(name)} placeholder={kind === 'business' ? 'Your business name' : 'Client name'} />
      <textarea id={`guest-${kind}-address`} placeholder="Address" defaultValue={escapeHtml(address)} />
      <input id={`guest-${kind}-email`} type="email" defaultValue={escapeHtml(email)} placeholder="Email" />
      <input id={`guest-${kind}-phone`} defaultValue={escapeHtml(phone)} placeholder="Phone" />
      <div className="row guest-edit-actions"><button className="btn sm" onClick={event => {
      syncGuestEditor();
      toggle();
    }}>Done</button><button className="btn s sm" onClick={event => {
      toggle();
    }}>Cancel</button></div>
    </div> : <div className="guest-contact-display"><b>{escapeHtml(name || (kind === 'business' ? 'Your business' : 'Client not selected'))}</b><div className="mut">{escapeHtml(address || '')}{address && email ? <br /> : ''}{escapeHtml(email || '')}{(email || address) && phone ? <br /> : ''}{escapeHtml(phone || '')}</div><button className="text-btn" onClick={event => {
    toggle();
  }}>{name ? 'Edit' : '+ Add ' + kind}</button></div>;
export const guestEditor = () => {
  const invoice = value();
  const subtotal = invoice.items.reduce((sum, item) => sum + (+item.q || 0) * (+item.p || 0), 0);
  const discount = invoice.dt === '%' ? subtotal * (+invoice.dv || 0) / 100 : +invoice.dv || 0;
  const tax = (subtotal - discount) * (+invoice.tax || 0) / 100;
  const total = subtotal - discount + tax;
  const currencies = [...Object.entries(currencySigns).map(([code, symbol]) => ({
    code,
    symbol
  })), ...state.guestCurrencies];
  return <div className="ed invoice-prototype-editor guest-invoice-editor">
    <div className="invoice-editor-actions row b"><button className="btn s sm" onClick={event => {
        leaveGuestInvoice();
      }}>← Back</button><div className="row"><button className="btn s" onClick={event => {
          guestLivePreview();
        }}>Preview</button><button className="btn s guest-locked" onClick={event => {
          promptGuestLogin();
        }}>Save draft 🔒</button><button className="btn guest-locked" onClick={event => {
          promptGuestLogin();
        }}>Save & send ▾</button></div></div>
    <article className="card invoice-prototype-card">
      <div className="invoice-prototype-title"><h2>Invoice <span className="mut">GUEST-INVOICE</span></h2><div className="invoice-logo-wrap">{invoice.logoDataUrl ? <div className="invoice-logo-container invoice-logo-has-image"><img className="invoice-logo-preview" src={escapeHtml(invoice.logoDataUrl)} alt="Company logo" /><button className="invoice-logo-remove" title="Remove logo" aria-label="Remove logo" onClick={event => {
              removeGuestLogo();
            }}>×</button></div> : <label className="invoice-logo-upload"><span className="invoice-logo-icon">▦</span><span><b>Upload your logo</b><small>PNG, JPG or WEBP · max 512 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
              readGuestLogo(event.currentTarget);
            }} /></label>}</div></div>
      <div className="invoice-meta-grid guest-meta-grid">
        <section><label className="mut">From</label>{editableContact('business', state.guestBusinessEditing, invoice.businessName, invoice.businessAddress, invoice.businessEmail, invoice.businessPhone, 'toggleGuestBusinessEdit')}</section>
        <section><label className="mut">Bill to</label>{editableContact('client', state.guestClientEditing, invoice.clientName, invoice.clientAddress, invoice.clientEmail, invoice.clientPhone, 'toggleGuestClientEdit')}</section>
        <section><label className="mut">Due date</label><input id="guest-due-date" type="date" onChange={event => {
            syncGuestEditor();
          }} value={escapeHtml(invoice.dueDate || addDays(today, 30))} /><div className="invoice-due-chips"><button className="chip" onClick={event => {
              document.getElementById('guest-due-date').value = '';
              syncGuestEditor();
            }}>On receipt</button><button className="chip" onClick={event => {
              document.getElementById('guest-due-date').value = String(addDays(today, 15));
              syncGuestEditor();
            }}>Net 15</button><button className="chip active" onClick={event => {
              document.getElementById('guest-due-date').value = String(addDays(today, 30));
              syncGuestEditor();
            }}>Net 30</button><button className="chip" onClick={event => {
              document.getElementById('guest-due-date').value = String(addDays(today, 60));
              syncGuestEditor();
            }}>Net 60</button></div></section>
      </div>
      <div className="invoice-lines"><div className="invoice-lines-head"><span>Description</span><span>Qty</span><span>Price</span><span>Amount</span></div>{invoice.items.map((item, index) => <div key={index} className="invoice-line"><input id={`guest-item-description-${index}`} defaultValue={escapeHtml(item.d)} placeholder="What did you deliver?" /><input id={`guest-item-quantity-${index}`} type="number" min="0" value={item.q} onChange={event => {
            syncGuestEditor();
            updateGuestTotals();
          }} /><input id={`guest-item-price-${index}`} type="number" min="0" step="0.01" value={item.p} onChange={event => {
            syncGuestEditor();
            updateGuestTotals();
          }} /><span id={`guest-item-amount-${index}`}>{guestMoney(item.q * item.p)}</span><button className="icon-btn" title="Remove line item" onClick={event => {
            removeGuestItem(index);
          }}>×</button></div>)}<button className="btn s sm" onClick={event => {
          addGuestItem();
        }}>+ Add line item</button></div>
      <div className="invoice-bottom-grid"><div className="invoice-fields"><label>Currency<select id="guest-currency" value={invoice.currency} onChange={event => {
              syncGuestEditor();
              updateGuestTotals();
            }}>{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} ({currency.symbol})</option>)}</select></label><button className="text-btn guest-currency-add" onClick={event => {
            toggleGuestCurrencyEditor();
        }}>+ Add currency</button>{state.guestCurrencyEditorOpen ? <div className="guest-currency-editor"><input id="guest-new-currency-code" maxLength={5} placeholder="Code, e.g. GBP" /><input id="guest-new-currency-symbol" maxLength={3} placeholder="Symbol, e.g. \xA3" /><button className="btn s sm" onClick={event => {
              addGuestCurrency();
            }}>Add</button></div> : ''}<label>Tax name and rate (%)<div className="split"><input id="guest-tax-name" defaultValue={escapeHtml(invoice.tn)} /><input id="guest-tax" type="number" value={invoice.tax} onChange={event => {
                syncGuestEditor();
                updateGuestTotals();
              }} /></div></label><label>Discount<div className="split"><input id="guest-discount" type="number" value={invoice.dv} onChange={event => {
                syncGuestEditor();
                updateGuestTotals();
              }} /><select id="guest-discount-type" value={invoice.dt} onChange={event => {
                syncGuestEditor();
                updateGuestTotals();
              }}><option value="%">%</option><option value="$">$</option></select></div></label><label>Notes and payment instructions<textarea id="guest-notes" onChange={event => {
              syncGuestEditor();
            }} placeholder="Optional: bank details, e-transfer instructions or a payment link" defaultValue={escapeHtml(invoice.notes)} /></label></div><div className="invoice-totals"><div>Subtotal <b id="guest-subtotal">{guestMoney(subtotal)}</b></div><div>Discount <b id="guest-discount-total">−{guestMoney(discount)}</b></div><div id="guest-tax-label">{escapeHtml(invoice.tn)} {invoice.tax}% <b id="guest-tax-total">{guestMoney(tax)}</b></div><hr /><div className="total">Total <b id="guest-total">{guestMoney(total)}</b></div></div></div>
      <div className="invoice-repeat-card guest-locked" onClick={event => {
        promptGuestLogin();
      }}><div><b>Repeat this invoice</b><span>Create it again on a schedule.</span></div><div className="invoice-repeat-switch">🔒</div></div>
    </article>
  </div>;
};
