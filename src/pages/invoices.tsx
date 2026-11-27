import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { currencyTotals, invoiceOutstanding, invoiceStatus } from '../modules/selectors.ts';
import { hdr } from '../ui/layout.tsx';
import { Pagination, paginate } from '../components/Pagination.tsx';
import { del, downloadInvoice, dup, editDraft, markPaid, newInv, send, viewInvoice } from '../actions/invoices.ts';
import { viewClient } from '../actions/clients.ts';
import { cancelRecurring, runRec, svNew, toggleRecurring } from '../actions/recurring.ts';
import { render } from '../ui/render.tsx';

const invoiceTabs = ['All', 'Draft', 'Sent', 'Paid', 'Overdue', 'Recurring'];

const formatInvoiceTotals = (invoices, amountForInvoice) => {
  const totals = currencyTotals(invoices, amountForInvoice);
  const amounts = Object.entries(totals).map(([currency, amount]) => formatMoney(amount, currency));
  return amounts.length ? amounts.join(' · ') : formatMoney(0);
};

const clientIndexForFilter = () => state.invoiceClientId ? state.clientIds.indexOf(state.invoiceClientId) : -1;

const selectClientFilter = clientId => {
  state.invoiceClientId = clientId || null;
  state.activeInvoiceTab = 'All';
  state.invoiceAnchorId = null;
  state.invoiceClientPickerOpen = false;
  state.invoiceClientPickerSearch = '';
  render();
};

const clientPicker = () => {
  const selectedClientIndex = clientIndexForFilter();
  const selectedClientName = selectedClientIndex >= 0 ? state.clientNames[selectedClientIndex] : 'All clients';
  const query = String(state.invoiceClientPickerSearch || '').trim().toLowerCase();
  const matchingClientIndexes = state.clientNames
    .map((clientName, clientIndex) => ({ clientName, clientIndex }))
    .filter(({ clientName }) => clientName.toLowerCase().includes(query))
    .map(({ clientIndex }) => clientIndex)
    .slice(0, 6);
  const recentClientIndexes = [...new Set(state.invoices.map(invoice => invoice.c).filter(clientIndex => clientIndex >= 0))].slice(0, 4);
  const clientIndexes = query ? matchingClientIndexes : [...new Set([...recentClientIndexes, ...matchingClientIndexes])].slice(0, 6);

  return <section className="invoice-client-filter">
    <span className="invoice-client-filter-label">Client</span>
    <div className="invoice-client-picker">
      <button className="invoice-client-trigger" type="button" onClick={() => {
        state.invoiceClientPickerOpen = !state.invoiceClientPickerOpen;
        state.invoiceClientPickerSearch = '';
        render();
      }} aria-expanded={Boolean(state.invoiceClientPickerOpen)} aria-haspopup="listbox">
        <span>{selectedClientName}</span><span className="invoice-client-caret" aria-hidden="true">▾</span>
      </button>
      {state.invoiceClientPickerOpen && <div className="invoice-client-popover" role="listbox" aria-label="Choose a client">
        <input autoFocus className="invoice-client-search" placeholder="Search clients by name" value={state.invoiceClientPickerSearch || ''} onChange={event => {
          state.invoiceClientPickerSearch = event.currentTarget.value;
          render();
        }} />
        {!query && <p className="invoice-client-section-label">Recent clients</p>}
        <button className={`invoice-client-option ${selectedClientIndex < 0 ? 'selected' : ''}`} type="button" onClick={() => selectClientFilter(null)}>All clients</button>
        {clientIndexes.map(clientIndex => <button key={state.clientIds[clientIndex] || clientIndex} className={`invoice-client-option ${selectedClientIndex === clientIndex ? 'selected' : ''}`} type="button" onClick={() => selectClientFilter(state.clientIds[clientIndex])}>{state.clientNames[clientIndex]}</button>)}
        {!clientIndexes.length && <p className="invoice-client-empty">No clients match that search.</p>}
        <p className="invoice-client-hint">Type to search all clients. Showing up to 6 matches.</p>
      </div>}
    </div>
  </section>;
};

const summaryCard = (label, amount, detail, tone = '') => <section className={`card invoice-summary-card ${tone}`}>
  <span>{label}</span><b>{amount}</b><small>{detail}</small>
</section>;

const recurringTable = selectedClientIndex => {
  const recurringRows = state.recurringServices.map((recurringService, recurringIndex) => ({ recurringService, recurringIndex }))
    .filter(({ recurringService }) => selectedClientIndex < 0 || recurringService.c === selectedClientIndex);
  const recurringPagination = paginate(recurringRows, 'recurringInvoices');
  return <>
    <div className="invoice-recurring-toolbar"><button className="btn sm" onClick={() => svNew(selectedClientIndex >= 0 ? selectedClientIndex : undefined)}>+ Set up recurring service</button></div>
    <div className="tbw">
        <table>
          <thead><tr><th>Client</th><th>Frequency</th><th>Next run</th><th>Status</th><th className="r">Amount</th><th /></tr></thead><tbody>
          {recurringRows.length ? recurringPagination.rows.map(({ recurringService, recurringIndex }) => <tr key={recurringService.id || recurringIndex}>
            <td><b>{state.clientNames[recurringService.c]?.split(' (')[0]}</b><br /><span className="mut">{recurringService.auto ? 'Sends automatically' : 'Creates drafts'}{recurringService.src ? `, based on ${recurringService.src}` : ''}</span></td>
            <td>{recurringService.f}</td><td>{recurringService.st === 'Active' ? formatDate(recurringService.next) : '—'}</td><td>{renderPill(recurringService.st)}</td>
            <td className="r">{formatMoney(recurringService.a, recurringService.cur)}{recurringService.chg ? <><br /><span className="mut invoice-small-note">{formatMoney(recurringService.chg.a, recurringService.cur)} from {formatDate(recurringService.chg.from)}</span></> : recurringService.prev ? <><br /><span className="mut invoice-small-note">was {formatMoney(recurringService.prev, recurringService.cur)}</span></> : ''}</td>
            <td className="r"><button className="btn s sm" onClick={() => runRec(recurringIndex)} disabled={recurringService.st === 'Cancelled' || recurringService.st === 'Completed'}>Run now</button> <button className="btn s sm" onClick={() => { state.cr = recurringIndex; state.activeModal = 'chg'; render(); }} disabled={recurringService.st === 'Cancelled' || recurringService.st === 'Completed'}>Change price</button> {(recurringService.st === 'Active' || recurringService.st === 'Paused') && <><button className="btn s sm" onClick={() => toggleRecurring(recurringIndex)}>{recurringService.st === 'Active' ? 'Pause' : 'Resume'}</button><button className="btn s sm d" onClick={() => cancelRecurring(recurringIndex)}>Cancel</button></>}</td>
          </tr>) : <tr><td colSpan={6} className="mut invoice-empty-row">No recurring services match this client.</td></tr>}
        </tbody>
      </table>
      <div className="clients-table-footer"> 
        <span className="mut">Showing {recurringPagination.rows.length} of {recurringRows.length} invoices</span>
        <Pagination paginationKey="recurringInvoices" {...recurringPagination} />
      </div>
    </div>
  </>;
};

export function tbl() {
  const selectedClientIndex = clientIndexForFilter();
  if (state.activeInvoiceTab === 'Recurring') return recurringTable(selectedClientIndex);

  const searchQuery = state.searchQuery.toLowerCase();
  const filteredInvoices = state.invoices.map(invoice => ({ ...invoice, status: invoiceStatus(invoice) })).filter(invoice =>
    (selectedClientIndex < 0 || invoice.c === selectedClientIndex)
    && (state.activeInvoiceTab === 'All' || invoice.status === state.activeInvoiceTab)
    && `${state.clientNames[invoice.c] || ''}${invoice.number}`.toLowerCase().includes(searchQuery)
  );
  const hasClientScope = selectedClientIndex >= 0;
  const columnCount = hasClientScope ? 5 : 6;
  const invoicePagination = paginate(filteredInvoices, 'invoices');

  return <>
    <div className="tbw invoice-table-wrap">
      <table><thead><tr><th>Invoice</th>{!hasClientScope && <th>Client</th>}<th>Due</th><th>Status</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>
            {filteredInvoices.length ? invoicePagination.rows.map(invoice => <tr id={`invoice-${invoice.id}`} key={invoice.id} className={state.invoiceAnchorId === String(invoice.id) ? 'invoice-row-target' : ''}>
                <td><b>{invoice.number}</b> {invoice.rec ? renderPill('Recurring') : ''}{invoice.old ? renderPill('Past invoice', 'Draft') : ''}</td>
                {!hasClientScope && <td><button className="btn s sm" onClick={() => viewClient(state.clientIds[invoice.c])}>{state.clientNames[invoice.c]?.split(' (')[0]}</button></td>}
                <td>{formatDate(invoice.due)}</td>
                <td>{renderPill(invoice.status)}</td>
                <td className="r"><b>{formatMoney(invoice.a, invoice.cur)}</b>{invoiceOutstanding(invoice) > 0 && <span className="invoice-outstanding-flag">{formatMoney(invoiceOutstanding(invoice), invoice.cur)} outstanding</span>}</td>
                <td className="r">
                  <details>
                    <summary aria-label={`Actions for ${invoice.number}`}>⋯</summary>
                    <div className="menu">
                      {invoice.s === 'Draft' && <button onClick={() => editDraft(String(invoice.id))}>Edit</button>}
                      {invoice.s !== 'Paid' && <><button onClick={() => markPaid(String(invoice.id))}>Mark paid</button>
                      <button onClick={() => send(String(invoice.id))}>Send</button></>}
                      <button onClick={() => viewInvoice(String(invoice.id))}>Preview</button><button onClick={() => downloadInvoice(String(invoice.id))}>Download PDF</button>
                      {!invoice.rec && <button onClick={() => { state.mr = String(invoice.id); state.activeModal = 'mkrec'; render(); }}>Make recurring</button>}
                      <button onClick={() => dup(String(invoice.id))}>Duplicate</button><button className="d" onClick={() => del(String(invoice.id))}>Delete</button>
                    </div>
                  </details>
                </td>
              </tr>) : <tr>
                  <td colSpan={columnCount} className="mut invoice-empty-row">No invoices match this view. 
                    <button className="text-action" onClick={newInv}>Create an invoice</button>
                  </td></tr>}
          </tbody>
      </table>
      <div className="clients-table-footer"> 
        <span className="mut">Showing {invoicePagination.rows.length} of {filteredInvoices.length} invoices</span>
        <Pagination paginationKey="invoices" {...invoicePagination} />
      </div> 
    </div>
  </>;
}

export function invoices() {
  const selectedClientIndex = clientIndexForFilter();
  const scopedInvoices = selectedClientIndex >= 0 ? state.invoices.filter(invoice => invoice.c === selectedClientIndex) : state.invoices;
  const scopedRecurringServices = selectedClientIndex >= 0 ? state.recurringServices.filter(recurringService => recurringService.c === selectedClientIndex) : state.recurringServices;
  const sentInvoices = scopedInvoices.filter(invoice => ['Sent', 'Overdue'].includes(invoiceStatus(invoice)));
  const paidInvoices = scopedInvoices.filter(invoice => invoice.s === 'Paid');
  const draftInvoices = scopedInvoices.filter(invoice => invoice.s === 'Draft');
  const outstandingInvoices = sentInvoices.filter(invoice => invoiceOutstanding(invoice) > 0);
  const countByTab = tab => tab === 'All' ? scopedInvoices.length : tab === 'Recurring' ? scopedRecurringServices.length : scopedInvoices.filter(invoice => invoiceStatus(invoice) === tab).length;

  return <>
  <div className="invoice-dashboard">
          {hdr('Invoices', undefined, <div className="row invoice-header-actions"><button className="btn s" onClick={() => { state.pc = undefined; state.activeModal = 'past'; render(); }}>Add past invoice</button>
            <button className="btn" onClick={newInv}>New invoice</button></div>)}
      {clientPicker()}
      <div className="invoice-summary-grid">
        {summaryCard('Billed', formatInvoiceTotals([...sentInvoices, ...paidInvoices], invoice => invoice.a), `${sentInvoices.length + paidInvoices.length} ${sentInvoices.length + paidInvoices.length === 1 ? 'invoice' : 'invoices'} issued`)}
        {summaryCard('Paid', formatInvoiceTotals(paidInvoices, invoice => invoice.a), `${paidInvoices.length} ${paidInvoices.length === 1 ? 'invoice' : 'invoices'} settled`, 'paid')}
        {summaryCard('Outstanding', formatInvoiceTotals(outstandingInvoices, invoiceOutstanding), `${outstandingInvoices.length} ${outstandingInvoices.length === 1 ? 'invoice awaiting payment' : 'invoices awaiting payment'}`, 'outstanding')}
        {summaryCard('Drafts', formatInvoiceTotals(draftInvoices, invoice => invoice.a), `${draftInvoices.length} ${draftInvoices.length === 1 ? 'invoice in progress' : 'invoices in progress'}`)}
      </div>
      <section className="card invoice-list-card">
          <div className="invoice-list-toolbar">
              <div className="tabs invoice-tabs">{invoiceTabs.map(tab => <button key={tab} className={state.activeInvoiceTab === tab ? 'on' : ''} onClick={() => { state.activeInvoiceTab = tab; state.invoiceAnchorId = null; render(); }}>{tab} ({countByTab(tab)})</button>)}
              </div>
              <input className="search invoice-search" placeholder="Search invoices" value={state.searchQuery} onChange={event => { state.searchQuery = event.currentTarget.value; render(); }} />
          </div>{tbl()}
      </section>
  </div>
  </>
}
