import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { invoiceStatus } from '../modules/selectors.ts';
import { hdr } from '../ui/layout.tsx';
import { del, downloadInvoice, dup, editDraft, markPaid, newInv, send } from '../actions/invoices.ts';
import { cancelRecurring, runRec, svNew, toggleRecurring } from '../actions/recurring.ts';
import { render } from '../ui/render.tsx';
export function tbl() {
  const searchQuery = state.searchQuery.toLowerCase();
  if (state.activeInvoiceTab === "Recurring") return <><div style={{
      "padding": "6px 0 12px"
    }}><button className="btn sm" onClick={event => {
        svNew(undefined);
      }}>+ Set up recurring service</button></div><table><thead><tr><th>Client</th><th>Frequency</th><th>Next run</th><th>Status</th><th className="r">Amount</th><th /></tr></thead><tbody>{state.recurringServices.map((recurringService, recurringIndex) => <tr key={recurringService.id || recurringIndex}><td><b>{state.clientNames[recurringService.c].split(" (")[0]}</b><br /><span className="mut">{recurringService.auto ? "Sends automatically" : "Creates drafts"}{recurringService.src ? ", based on " + recurringService.src : ""}</span></td><td>{recurringService.f}</td><td>{recurringService.st === "Active" ? formatDate(recurringService.next) : "—"}</td><td>{renderPill(recurringService.st)}</td><td className="r">{formatMoney(recurringService.a)}{recurringService.chg ? <><br /><span className="mut" style={{
              "fontSize": "12px"
            }}>{formatMoney(recurringService.chg.a)} from {formatDate(recurringService.chg.from)}</span></> : recurringService.prev ? <><br /><span className="mut" style={{
              "fontSize": "12px"
            }}>was {formatMoney(recurringService.prev)}</span></> : ""}</td><td className="r"><button className="btn s sm" onClick={event => {
            runRec(recurringIndex);
          }} disabled={recurringService.st === 'Cancelled' || recurringService.st === 'Completed'}>Run now</button> <button className="btn s sm" onClick={event => {
            state.cr = recurringIndex;
            state.activeModal = 'chg';
            render();
          }} disabled={recurringService.st === 'Cancelled' || recurringService.st === 'Completed'}>Change price</button> {(recurringService.st === 'Active' || recurringService.st === 'Paused') && <><button className="btn s sm" onClick={event => {
            toggleRecurring(recurringIndex);
          }}>{recurringService.st === "Active" ? "Pause" : "Resume"}</button><button className="btn s sm d" onClick={event => {
            cancelRecurring(recurringIndex);
          }}>Cancel</button></>}</td></tr>)}</tbody></table></>;
  const filteredInvoices = state.invoices.map(invoice => ({
    ...invoice,
    status: invoiceStatus(invoice)
  })).filter(invoice => (state.activeInvoiceTab === "All" || invoice.status === state.activeInvoiceTab || state.activeInvoiceTab === "Sent" && invoice.status === "Sent") && (state.clientNames[invoice.c] + invoice.number).toLowerCase().includes(searchQuery)).reverse();
  if (!filteredInvoices.length) return <div style={{
    "textAlign": "center",
    "padding": "40px"
  }} className="mut">No invoices match. <a style={{
      "color": "var(--pri)",
      "cursor": "pointer"
    }} onClick={event => {
      newInv();
    }}>Create an invoice</a></div>;
  return <table><thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Status</th><th className="r">Amount</th><th /></tr></thead><tbody>{filteredInvoices.map(invoice => <tr key={invoice.id}><td><b>{invoice.number}</b> {invoice.rec ? renderPill("Recurring") : ""}{invoice.old ? renderPill("Past invoice", "Draft") : ""}</td><td>{state.clientNames[invoice.c].split(" (")[0]}</td><td>{formatDate(invoice.due)}</td><td>{renderPill(invoice.status)}</td><td className="r">{formatMoney(invoice.a)}</td><td className="r">
    <details><summary>⋯</summary><div className="menu">{invoice.s === "Draft" ? <button onClick={event => {
              editDraft(String(invoice.id));
            }}>Edit</button> : ""}{invoice.s !== "Paid" ? <><button onClick={event => {
                markPaid(String(invoice.id));
              }}>Mark paid</button><button onClick={event => {
                send(String(invoice.id));
              }}>Send</button></> : ""}<button onClick={event => {
              downloadInvoice(String(invoice.id));
            }}>Download PDF</button>{!invoice.rec ? <button onClick={event => {
              state.mr = String(invoice.id);
              state.activeModal = 'mkrec';
              render();
            }}>Make recurring</button> : ""}<button onClick={event => {
              dup(String(invoice.id));
            }}>Duplicate</button><button className="d" onClick={event => {
              del(String(invoice.id));
            }}>Delete</button></div></details></td></tr>)}</tbody></table>;
}
export function invoices() {
  const countByTab = tab => tab === "All" ? state.invoices.length : tab === "Recurring" ? state.recurringServices.length : state.invoices.filter(invoice => invoiceStatus(invoice) === tab).length;
  return <>{hdr("Invoices", "Search, filter and act on every invoice.", <div className="row"><button className="btn s" onClick={event => {
        state.pc = undefined;
        state.activeModal = 'past';
        render();
      }}>Add past invoice</button><button className="btn" onClick={event => {
        newInv();
      }}>+ New invoice</button></div>)}<div className="card"><div className="row b" style={{
        "flexWrap": "wrap"
      }}><div className="tabs" style={{
          "flex": "1",
          "border": "0",
          "margin": "0"
        }}>{["All", "Draft", "Sent", "Paid", "Overdue", "Recurring"].map(tab => <button key={tab} className={state.activeInvoiceTab === tab ? "on" : ""} onClick={event => {
            state.activeInvoiceTab = String(tab);
            render();
          }}>{tab} {countByTab(tab)}</button>)}</div><input className="search" placeholder="Search invoices" value={state.searchQuery} onChange={event => {
          state.searchQuery = event.currentTarget.value;
          render();
        }} /></div><div className="tbw" id="tbl" style={{
        "minHeight": "200px"
      }}>{tbl()}</div></div></>;
}
