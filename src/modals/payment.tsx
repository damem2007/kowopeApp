import React from 'react';
import { state } from '../modules/store.ts';
import { formatMoney } from '../modules/format.tsx';
import { recPay } from '../actions/payments.ts';
import { render } from '../ui/render.tsx';
export const recordPaymentModal = () => 
  <div className="ov c">
    <div className="md"><h2>Record payment</h2><label className="fl">Invoice</label>
        <select id="pi">{state.invoices.filter(invoice => invoice.s !== "Paid").map(invoice => 
          <option key={invoice.id} value={invoice.id}>{invoice.number} · {formatMoney(invoice.a)}</option>)}
          </select>
          <label className="fl">Method</label>
          <select id="pm">
            <option>Manual</option>
            <option>Bank transfer</option>
            <option>Cheque</option>
          </select>
          <div className="row b" style={{"marginTop": "18px"}}>
            <button className="btn s" onClick={event => {state.activeModal = null;render();}}>Cancel</button>
            <button className="btn" onClick={event => {recPay();}}>Record payment</button>
          </div>
      </div>
  </div>;
