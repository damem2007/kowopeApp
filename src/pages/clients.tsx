import React from 'react';
import { state } from "../modules/store.ts";
import { formatMoney } from "../modules/format.tsx";
import { hdr } from "../ui/layout.tsx";
export function clients() {
  const clientRows = state.clientNames.map((clientName, clientIndex) => {
    const clientInvoices = state.invoices.filter(invoice => invoice.c === clientIndex);
    const clientDetails = state.clientDetails[clientIndex] || {};
    return <tr key={clientIndex}><td><b>{clientName}</b></td>
    <td className="mut">{[clientDetails.e, clientDetails.p].filter(Boolean).join(" · ") || "—"}</td>
    <td>{clientInvoices.length}</td>
    <td className="r">{formatMoney(clientInvoices.reduce((total, invoice) => total + invoice.a, 0))}</td>
    <td className="r"><button className="btn s sm" onClick={event => {
          editClient(clientIndex);
        }}>Edit</button> <button className="btn s sm" onClick={event => {
          state.pc = clientIndex;
          state.activeModal = 'past';
          render();
        }}>Add past invoice</button> <button className="btn sm" onClick={event => {
          svNew(clientIndex);
        }}>Recurring service</button></td></tr>;
  });
  return <>{hdr("Clients", state.clientNames.length + (state.clientNames.length === 1 ? " saved client" : " saved clients"), <button className="btn" onClick={event => {
      state.activeModal = 'client';
      render();
    }}>+ New client</button>)}<div className="card tbw">{state.clientNames.length ? <table><thead><tr><th>Client</th><th>Contact</th><th>Invoices</th><th className="r">Total billed</th><th /></tr></thead><tbody>{clientRows}</tbody></table> : <div className="empty-state" style={{
        "padding": "56px 20px"
      }}><h2>No clients yet</h2><p className="mut">Create your first client to link them to invoices and track what they owe.</p><button className="btn" onClick={event => {
          state.activeModal = 'client';
          render();
        }}>+ New client</button></div>}</div></>;
}
