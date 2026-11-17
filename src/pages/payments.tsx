import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { hdr } from '../ui/layout.tsx';
export function payments() {
  return <>{hdr("Payments", "Every payment, matched to its invoice.", <button className="btn" onClick={event => {
      state.activeModal = 'pay';
      render();
    }}>Record payment</button>)}
    <div className="card tbw">
      <table>
        <tbody>
        <tr><th>Date</th><th>Invoice</th><th>Client</th><th>Source</th><th className="r">Amount</th></tr>
        {state.payments.map((payment, paymentIndex) => <tr key={payment.id || `${payment.inv}-${payment.d}-${paymentIndex}`}>
          <td>{formatDate(payment.d)}</td><td><b>{payment.inv}</b></td>
          <td>{state.clientNames[payment.c].split(" (")[0]}</td>
          <td>{renderPill(payment.m, "Sent")}</td>
          <td className="r">{formatMoney(payment.a)}</td>
          </tr>) || <tr><td className="mut">No payments yet.</td></tr>}</tbody></table></div></>;
}
