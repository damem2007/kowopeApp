import React from 'react';
import { state } from '../modules/store.ts';
import { savePast } from '../actions/invoices.ts';
import { render } from '../ui/render.tsx';
const formatSuggestion = profile => {
  const date = new Date();
  const nextNumber = String(state.invoices.filter(invoice => invoice.businessProfileId === profile?.id).length + 1).padStart(Number(profile?.invoicePadding || 4), '0');
  return String(profile?.invoiceFormat || '{PREFIX}{YYYY}-{NUMBER}').replaceAll('{PREFIX}', profile?.invoicePrefix || 'INV-').replaceAll('{YYYY}', String(date.getFullYear())).replaceAll('{YY}', String(date.getFullYear()).slice(-2)).replaceAll('{NUMBER}', nextNumber);
};
export const pastInvoiceModal = () => {
  const selectedBusinessIndex = state.pastBusinessProfileIndex ?? Math.max(0, state.businessProfiles.findIndex(profile => profile.id === state.numberingBusinessProfileId));
  const business = state.businessProfiles[selectedBusinessIndex] || state.businessProfiles[0] || {};
  return <div className="ov c"><div className="md" style={{"width": "min(520px,92%)","maxHeight": "94vh",
"overflow": "auto"}}>
  <h2>Add past invoice</h2><p className="mut" style={{"margin": "6px 0 0"}}>Record an invoice you already issued and were paid for. It is saved as Paid and added to Payments.</p>
    <label className="fl">Client</label>
    <select id="qc" defaultValue={state.pc ?? 0}>{state.clientNames.map((clientName, clientIndex) => <option key={clientIndex} value={clientIndex}>{clientName}</option>)}
    </select>
    <label className="fl">Business</label>
    <select id="qb" value={selectedBusinessIndex} onChange={event => { state.pastBusinessProfileIndex = Number(event.currentTarget.value); render(); }}>{state.businessProfiles.map((profile, index) => <option key={profile.id ?? index} value={index}>{profile.n || `Business ${index + 1}`}</option>)}</select>
    <div className="grid" style={{"gridTemplateColumns": "1fr 1fr","gap": "0 12px"}}>
      <div>
        <label className="fl">Invoice number <span className="mut">(optional)</span></label><input id="qn" placeholder={formatSuggestion(business)} />
        <small className="mut">Leave blank to use this business’s automatic format.</small>
      </div>
      <div>
        <label className="fl">Amount paid</label><input id="qa" type="number" min="0" step="0.01" />
      </div>
      <div>
        <label className="fl">Issue date</label><input id="qi" type="date" />
      </div>
      <div>
        <label className="fl">Due date</label><input id="qd" type="date" />
      </div>
    </div>
    <label className="fl">Date paid</label><input id="qp" type="date" />
    <label className="fl">Description</label><input id="qx" placeholder="What was this invoice for?" />
    <div className="tg">
      <input type="checkbox" id="qr" /><label htmlFor="qr">Set up recurring invoices from this one</label>
    </div>
    <div id="qe" className="err" />
    <div className="row b" style={{"marginTop": "18px"}}>
      <button className="btn s" onClick={event => { state.activeModal = null; render(); }}>Cancel</button>
      <button className="btn" onClick={event => { savePast(); }}>Save past invoice</button>
    </div>
  </div>
</div>;
};
