import React from 'react';
import { state } from "../modules/store.ts";
import { formatMoney } from "../modules/format.tsx";
import { currencyTotals, invoiceOutstanding, invoiceStatus } from '../modules/selectors.ts';
import { hdr } from "../ui/layout.tsx";
import { Pagination, paginate } from '../components/Pagination.tsx';
import { editClient, viewClientInvoices } from '../actions/clients.ts';
import { newInv } from '../actions/invoices.ts';
import { svNew } from '../actions/recurring.ts';
import { render } from '../ui/render.tsx';

const formatInvoiceTotals = (invoices, amountForInvoice) => {
  const totals = currencyTotals(invoices, amountForInvoice)
  const amounts = Object.entries(totals).map(([currency, amount]) => formatMoney(amount, currency))
  return amounts.length ? amounts.join(' · ') : formatMoney(0)
}

export function clients() {
  const selectedClientIndex = state.selectedClientId ? state.clientIds.indexOf(state.selectedClientId) : -1;
  const query = String(state.clientsSearch || '').trim().toLowerCase();
  const clientView = state.clientsView || 'all';
  const candidateIndexes = selectedClientIndex >= 0 ? [selectedClientIndex] : state.clientNames.map((_, clientIndex) => clientIndex);
  const clientSummaries = candidateIndexes.map(clientIndex => {
    const clientName = state.clientNames[clientIndex];
    const clientId = state.clientIds[clientIndex];
    const clientInvoices = state.invoices.filter(invoice => invoice.c === clientIndex);
    const clientDetails = state.clientDetails[clientIndex] || {};
    const issuedInvoices = clientInvoices.filter(invoice => ['Sent', 'Paid', 'Overdue'].includes(invoiceStatus(invoice)));
    const draftInvoices = clientInvoices.filter(invoice => invoiceStatus(invoice) === 'Draft');
    const outstanding = formatInvoiceTotals(clientInvoices, invoiceOutstanding);
    const outstandingAmount = clientInvoices.reduce((total, invoice) => total + invoiceOutstanding(invoice), 0);
    return { clientIndex, clientId, clientName, clientDetails, clientInvoices, issuedInvoices, draftInvoices, outstanding, outstandingAmount };
  });
  const filteredClients = clientSummaries.filter(client => (clientView !== 'balance' || client.outstandingAmount > 0) && `${client.clientName} ${client.clientDetails.e || ''} ${client.clientDetails.p || ''}`.toLowerCase().includes(query));
  const clientPagination = paginate(filteredClients, 'clients');
  const clientRows = clientPagination.rows.map(client => <tr key={client.clientId || client.clientIndex}>
    <td>
      <div className="client-cell">
        <span className="client-avatar" onClick={() => viewClientInvoices(client.clientId)}>{client.clientName.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'C'}</span>
        <div style={{"textAlign": "left"}}>
          <button className="btn s sm" onClick={() => viewClientInvoices(client.clientId)}>{client.clientName}</button>
          <span>{client.clientDetails.e || '—'}</span>
          <span>{client.clientDetails.p || ''}</span>
        </div>
      </div>
    </td>
    <td className="r"><button className="btn s sm" onClick={() => viewClientInvoices(client.clientId)}>{client.clientInvoices.length}</button></td>
    <td className="r"><b>{formatInvoiceTotals(client.issuedInvoices, invoice => invoice.a)}</b>
    {client.clientInvoices.length === 0 ? <button className="client-first-invoice" onClick={() => newInv(client.clientIndex)}>Add first invoice</button> : client.draftInvoices.length > 0 && <span className="client-draft-note">+ {formatInvoiceTotals(client.draftInvoices, invoice => invoice.a)} in drafts</span>}</td>
    <td className={`r client-outstanding ${client.outstandingAmount > 0 ? 'has-balance' : ''}`}>{client.outstandingAmount > 0 ? client.outstanding : '—'}</td>
    <td className="r">
      <details><summary aria-label={`Actions for ${client.clientName}`}>⋯</summary>
        <div className="menu">
          <button onClick={() => editClient(client.clientIndex)}>Edit client</button>
          <button onClick={() => { state.pc = client.clientIndex; state.activeModal = 'past'; render(); }}>Add past invoice</button>
          <button onClick={() => svNew(client.clientIndex)}>Recurring service</button>
        </div>
      </details>
    </td>
  </tr>);
  const allClients = state.clientNames.length;
  const clientsWithBalance = clientSummaries.filter(client => client.outstandingAmount > 0).length;
  const allInvoices = clientSummaries.flatMap(client => client.clientInvoices);
  const issuedInvoices = allInvoices.filter(invoice => ['Sent', 'Paid', 'Overdue'].includes(invoiceStatus(invoice)));
  const draftInvoices = allInvoices.filter(invoice => invoiceStatus(invoice) === 'Draft');
  const clearSelectedClient = () => { state.selectedClientId = null; render(); };
  return <>
  <div className="clients-dashboard">
      {hdr('Clients', selectedClientIndex >= 0 ? `${state.clientNames[selectedClientIndex]} · client details` : `${allClients} ${allClients === 1 ? 'saved client' : 'saved clients'}`, 
        <div className="row">{selectedClientIndex >= 0 && <button className="btn s" onClick={clearSelectedClient}>← All clients</button>}
          <button className="btn" onClick={() => { state.activeModal = 'client'; render(); }}>+ New client</button>
        </div>
      )}
      <div className="clients-summary-grid">
        <section className="card client-summary-card">
          <span>Clients</span><b>{allClients}</b><small>{clientsWithBalance} with a balance</small>
        </section>
        <section className="card client-summary-card">
          <span>Billed</span><b>{formatInvoiceTotals(issuedInvoices, invoice => invoice.a)}</b><small>Sent and paid invoices</small>
        </section>
        <section className="card client-summary-card outstanding">
          <span>Outstanding</span><b>{formatInvoiceTotals(allInvoices, invoiceOutstanding)}</b><small>Awaiting payment</small>
        </section>
        <section className="card client-summary-card">
          <span>Drafts</span><b>{formatInvoiceTotals(draftInvoices, invoice => invoice.a)}</b><small>Not yet sent</small>
        </section>
      </div>
      <section className="card clients-list-card">
        <div className="clients-list-toolbar">
          <div className="tabs clients-tabs">
              <button className={clientView === 'all' ? 'on' : ''} onClick={() => { state.clientsView = 'all'; state.clientsPage = 1; render(); }}>All ({allClients})</button>
              <button className={clientView === 'balance' ? 'on' : ''} onClick={() => { state.clientsView = 'balance'; state.clientsPage = 1; render(); }}>With balance ({clientsWithBalance})</button>
          </div>
          <input className="search clients-search" type="search" placeholder="Search name, email or phone" value={state.clientsSearch || ''} onChange={event => { state.clientsSearch = event.currentTarget.value; state.clientsPage = 1; render(); }} />
        </div>
        {allClients ? 
        <div className="tbw">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="r">Invoices</th>
                <th className="r">Billed</th>
                <th className="r">Outstanding</th><th />
              </tr>
            </thead>
            <tbody>{filteredClients.length ? clientRows : <tr>
              <td colSpan={5} className="mut client-empty-row">No clients match these filters.</td>
              </tr>}
            </tbody>
          </table>
          <div className="clients-table-footer"><span className="mut">Showing {clientRows.length} of {filteredClients.length} clients</span>
            <Pagination paginationKey="clients" {...clientPagination} />
          </div>
        </div> : <div className="empty-state client-empty-state"><h2>No clients yet</h2>
        <p className="mut">Create your first client to link them to invoices and track what they owe.</p>
        <button className="btn" onClick={() => { state.activeModal = 'client'; render(); }}>+ New client</button></div>}
      </section>
  </div>
  </>;
}
