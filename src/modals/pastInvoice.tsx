import React from 'react';
import { state } from '../modules/store.ts';
export const pastInvoiceModal = () => <div className="ov c"><div className="md" style={{"width": "min(520px,92%)","maxHeight": "94vh",
"overflow": "auto"}}>
  <h2>Add past invoice</h2><p className="mut" style={{"margin": "6px 0 0"}}>Record an invoice you already issued and were paid for. It is saved as Paid and added to Payments.</p>
    <label className="fl">Client</label>
    <select id="qc" defaultValue={state.pc ?? 0}>{state.clientNames.map((clientName, clientIndex) => <option key={clientIndex} value={clientIndex}>{clientName}</option>)}
    </select>
    <div className="grid" style={{"gridTemplateColumns": "1fr 1fr","gap": "0 12px"}}>
      <div>
        <label className="fl">Invoice number</label> <input id="qn" defaultValue={`INV-000${state.invoices.length + 1}`} />
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
