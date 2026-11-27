import React from 'react';
import { state } from '../modules/store.ts';
import { today, addDays } from '../modules/date.ts';
import { currencySigns } from '../modules/catalog.tsx';
import { formatMoney, renderDetails } from '../modules/format.tsx';
import { isMail } from '../modules/selectors.ts';
import { calcInvoice, recurringSummary } from '../modules/invoiceMath.ts';
import { go, render } from '../ui/render.tsx';
import { save, downloadPreviewPdf, uploadInvoiceLogo, removeInvoiceLogo, queueInvoiceDraftAutosave } from '../actions/invoices.ts';
const dueOptions = [[0, 'On receipt'], [15, 'Net 15'], [30, 'Net 30'], [60, 'Net 60']];
const frequencies = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Yearly'];
export function InvoiceEditor() {
  const appState = state as any;
  const invoice: any = appState.invoiceEditor;
  if (!invoice) return <p className="mut">No invoice is being edited.</p>;
  const business: any = appState.businessProfiles[invoice.businessIndex] || {};
  const logo = invoice.logoDataUrl || !invoice.logoRemoved && business.logoDataUrl || '';
  const client: any = invoice.clientIndex !== '' ? appState.clientDetails[invoice.clientIndex] : null;
  const totals = calcInvoice(invoice);
  const update = (patch: Record<string, unknown>) => {
    Object.assign(invoice, patch);
    queueInvoiceDraftAutosave();
    render();
  };
  const updateItem = (index: number, patch: Record<string, unknown>) => {
    Object.assign(invoice.lineItems[index], patch);
    queueInvoiceDraftAutosave();
    render();
  };
  const removeItem = (index: number) => {
    invoice.lineItems.splice(index, 1);
    if (!invoice.lineItems.length) invoice.lineItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0
    });
    queueInvoiceDraftAutosave();
    render();
  };
  return <div className="ed invoice-prototype-editor">
      <div className="invoice-editor-actions">
        <button className="btn s sm" onClick={() => go('invoices')}>← Back</button>
        <div className="row">
          <button className="btn s" onClick={() => {
          state.currentRoute = 'preview';
          render();
          window.scrollTo?.(0, 0);
        }}>Preview</button>
          <span className="mut" role="status" aria-live="polite">{appState.invoiceAutosaveStatus}</span>
          <button className="btn s" onClick={() => save('draft')}>Save draft</button>
          <details><summary className="btn">Save &amp; send ▾</summary>
            <div className="menu">
              <button onClick={() => save('send')}>Save &amp; send</button>
              <button onClick={downloadPreviewPdf}>Download PDF preview</button>
            </div>
          </details>
        </div>
      </div>
      <section className="card invoice-prototype-card">
        <div className="invoice-prototype-title">
          <h2>Invoice <span className="mut">{invoice.invoiceNumber || 'Assigned when saved'}</span></h2>
          <div className="invoice-logo-wrap"><div className="invoice-logo-container">
            <label className="invoice-logo-upload" aria-label="Upload invoice logo">
              {logo ? <img src={logo} alt="Invoice logo" className="invoice-logo-preview" /> : <><span className="invoice-logo-icon" aria-hidden="true">⊞</span><span><b>Upload your logo</b><small>PNG, JPG or WEBP · max 512 KB</small></span></>}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => uploadInvoiceLogo(event.currentTarget)} />
            </label>
            {logo && <button className="invoice-logo-remove" type="button" aria-label="Remove logo" onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              removeInvoiceLogo();
            }}>×</button>}
          </div></div>
        </div>
        <div className="invoice-meta-grid">
          <div>
            <label className="fl">From</label>
            <select value={invoice.businessIndex} onChange={event => update({
            businessIndex: Number(event.target.value)
          })}>
              {appState.businessProfiles.map((profile: any, index: number) => <option key={profile.id ?? index} value={index}>{profile.n || `Business ${index + 1}`}</option>)}
            </select>
            {renderDetails(business.n, business.a, business.e, business.p)}
            <button className="invoice-link" onClick={() => {
            appState.businessLogoDraft = undefined;
            appState.activeModal = 'biz';
            appState.be = -1;
            render();
          }}>+ Add business</button>
          </div>
          <div>
            <label className="fl">Bill to</label>
            <select value={invoice.clientIndex} onChange={event => update({
            clientIndex: event.target.value
          })}>
              <option value="">Select client</option>
              {appState.clientNames.map((name: string, index: number) => <option key={appState.clientIds[index] || index} value={index}>{name}</option>)}
            </select>
            {client ? renderDetails(appState.clientNames[invoice.clientIndex], client.a, client.e, client.p) : <div className="mut invoice-placeholder">Client name, address and contacts appear here.</div>}
            <button className="invoice-link" onClick={() => {
            appState.activeModal = 'client';
            render();
          }}>+ Add client</button>
          </div>
          <div><label className="fl">Due date</label>
            <input type="date" value={invoice.dueDate || ''} onChange={event => update({
            dueDate: event.target.value,
            duePreset: 0
          })} />
            <div className="chips">
              {dueOptions.map(([days, title]) => <button key={days} className={invoice.duePreset === days && invoice.dueDate === addDays(today, days) ? 'on' : ''} onClick={() => update({
              dueDate: addDays(today, days),
              duePreset: days
            })}>{title}</button>)}
            </div>
          </div>
        </div>
        <div className="invoice-lines">
          <div className="invoice-lines-head"><span>Description</span><span>Qty</span><span>Price</span><span className="r">Amount</span><span></span></div>
          {invoice.lineItems.map((line: any, index: number) => <div className="invoice-line" key={index}>
            <input placeholder="What did you deliver?" value={line.description} onChange={event => updateItem(index, {
            description: event.target.value
          })} />
            <input className="quantity-input" type="number" min="0" value={line.quantity} onChange={event => updateItem(index, {
            quantity: Number(event.target.value)
          })} />
            <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => updateItem(index, {
            unitPrice: Number(event.target.value)
          })} />
            <span className="invoice-money">{formatMoney(Number(line.quantity) * Number(line.unitPrice))}</span>
            <button className="ghost invoice-remove" aria-label="Remove line" onClick={() => removeItem(index)}>×</button>
          </div>)}
        </div>
        <button className="btn s sm invoice-add-line" onClick={() => {
        invoice.lineItems.push({
          description: '',
          quantity: 1,
          unitPrice: 0
        });
        queueInvoiceDraftAutosave();
        render();
      }}>+ Add line item</button>
        <div className="invoice-bottom-grid">
          <div className="invoice-fields">
            <label className="fl">Currency</label>
            <select value={invoice.currency} onChange={event => update({
            currency: event.target.value
          })}>
              {Object.keys(currencySigns).map((code: string) => <option key={code} value={code}>{code} ({(currencySigns as Record<string, string>)[code]})</option>)}
            </select>
            <label className="fl">Tax name and rate (%)</label>
            <div className="invoice-fields-grid">
              <input value={invoice.taxName} onChange={event => update({
              taxName: event.target.value
            })} />
              <input type="number" min="0" value={invoice.tax} onChange={event => update({
              tax: Number(event.target.value)
            })} />
            </div>
            <label className="fl">Discount</label>
            <div className="invoice-fields-grid">
              <input type="number" min="0" value={invoice.discountValue} onChange={event => update({
              discountValue: Number(event.target.value)
            })} />
              <select value={invoice.discountType} onChange={event => update({
              discountType: event.target.value
            })}><option value="%">%</option><option value="$">$</option></select>
            </div>
            <label className="fl">Notes and payment instructions</label>
            <textarea value={invoice.paymentInstructions} onChange={event => update({
            paymentInstructions: event.target.value
          })} placeholder="Optional: bank details, e-transfer instructions or a payment link" />
          </div>
          <div className="invoice-totals">
            <div><span className="mut">Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
            <div><span className="mut">Discount</span><span>−{formatMoney(totals.discount)}</span></div>
            <div><span className="mut">{invoice.taxName} {invoice.tax}%</span><span>{formatMoney(totals.taxAmount)}</span></div>
            <div className="big"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
          </div>
        </div>
      </section>
      <section className="card invoice-repeat-card">
        <div className="invoice-repeat-header">
          <div><h2>Repeat this invoice</h2><span className="mut">Create it again on a schedule.</span></div>
          <label className="invoice-repeat-switch"><input type="checkbox" checked={Boolean(invoice.isRecurring)} onChange={event => update({
            isRecurring: event.target.checked ? 1 : 0
          })} /><span aria-hidden="true" /></label>
        </div>
        {invoice.isRecurring ? <>
          <div className="invoice-fields-grid">
            <div><label className="fl">Frequency</label><select value={invoice.frequency} onChange={event => update({
              frequency: event.target.value
            })}>{frequencies.map(freq => <option key={freq}>{freq}</option>)}</select></div>
            <div><label className="fl">Ends</label><select value={invoice.recurrenceEnd} onChange={event => update({
              recurrenceEnd: event.target.value
            })}>{['Never', 'After 6', 'After 12'].map(ending => <option key={ending}>{ending}</option>)}</select></div>
          </div>
          <div className="tg"><input type="checkbox" id="au" checked={Boolean(invoice.autoSend)} onChange={event => update({
            autoSend: event.target.checked ? 1 : 0
          })} />
            <label htmlFor="au">Send automatically{isMail() ? '' : ' (needs an email account)'}</label>
          </div><p className="ok">{recurringSummary(invoice)}</p>
        </> : null}
      </section>
    </div>;
}
