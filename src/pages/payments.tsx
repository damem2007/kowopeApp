import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { hdr } from '../ui/layout.tsx';
import { Pagination, paginate } from '../components/Pagination.tsx';
import { SearchPicker } from '../components/SearchPicker.tsx';
import { render } from '../ui/render.tsx';
import { openInvoice } from '../actions/invoices.ts';
import { viewClient } from '../actions/clients.ts';
export function payments() {
  const clientOptions = state.clientNames.map((name, index) => ({ id: state.clientIds[index], label: name }));
  const selectedClientId = state.paymentsClientId || '';
  const selectedClientIndex = selectedClientId ? state.clientIds.indexOf(selectedClientId) : -1;
  const selectedDate = state.paymentsDateFilter || '';
  const filteredPayments = state.payments.filter(payment => (!selectedDate || payment.d === selectedDate) && (selectedClientIndex < 0 || payment.c === selectedClientIndex));
  const paymentPagination = paginate(filteredPayments, 'payments');

  return <>{hdr('Payments', 'Every payment, matched to its invoice.', <button className="btn" onClick={() => { state.activeModal = 'pay'; render(); }}>Record payment</button>)}
        <section className="card payment-filters">
          <div>
            <label htmlFor="payment-date-filter">Payment date</label>
            <input id="payment-date-filter" type="date" value={selectedDate} onChange={event => { state.paymentsDateFilter = event.currentTarget.value; state.paymentsPage = 1; render(); }} />
          </div>
          <SearchPicker id="paymentsClientPicker" label="Client" value={selectedClientId} options={clientOptions} allLabel="All clients" onChange={clientId => { state.paymentsClientId = clientId; state.paymentsPage = 1; }} />
        </section>
    <div className="card tbw">
      <table><thead><tr><th>Date</th><th>Invoice</th><th>Client</th><th>Source</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {filteredPayments.length ? paymentPagination.rows.map((payment, paymentIndex) => {
            const invoice = state.invoices.find(candidate => candidate.number === payment.inv);
            const clientName = state.clientNames[payment.c] || '—';
            const clientId = state.clientIds[payment.c];
            return <tr key={payment.id || `${payment.inv}-${payment.d}-${paymentIndex}`}>
              <td>{formatDate(payment.d)}</td>
              <td>{invoice ? <button className="btn s sm" onClick={() => openInvoice(String(invoice.id))}>{payment.inv}</button> : <b>{payment.inv}</b>}</td>
              <td>{clientId ? <button className="btn s sm" onClick={() => viewClient(clientId)}>{clientName.split(' (')[0]}</button> : clientName}</td>
              <td>{renderPill(payment.m, 'Sent')}</td><td className="r">{formatMoney(payment.a)}</td></tr>;
          }) : <tr><td colSpan={5} className="mut">No payments match these filters.</td></tr>}
        </tbody>
      </table>
      <div className="clients-table-footer">
        <span className="mut">Showing {paymentPagination.rows.length} of {filteredPayments.length} payments</span>
        <Pagination paginationKey="payments" {...paymentPagination} />
      </div>
    </div>
  </>;
}
