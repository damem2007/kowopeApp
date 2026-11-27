import React from 'react';
import { state } from '../modules/store.ts';
import { providers } from '../modules/catalog.tsx';
import { formatDate } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { invoiceStatus, sum } from '../modules/selectors.ts';
import { hdr } from '../ui/layout.tsx';
import { intRow } from './integrations.tsx';
import { openInvoice, send } from '../actions/invoices.ts';
import { viewClient } from '../actions/clients.ts';
import { go } from '../ui/render.tsx';
const escapeHtml = value => String(value ?? ''); // React escapes rendered text and attributes automatically.

const localGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return {
    text: 'Good morning',
    icon: 'sun'
  };
  if (hour >= 12 && hour < 18) return {
    text: 'Good afternoon',
    icon: 'sun'
  };
  return {
    text: 'Good evening',
    icon: 'moon'
  };
};
const accountName = () => {
  const savedBusiness = state.businessProfiles?.find(profile => profile.id && profile.n?.trim());
  if (savedBusiness) return savedBusiness.n.trim();
  if (state.authEmail?.trim()) return state.authEmail.split('@')[0];
  return 'Your account';
};
const greetingIcon = iconName => iconName === 'sun' ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.6 8.6 0 1 0 12 12Z" /></svg>;
const overviewSubtitle = () => {
  const greeting = localGreeting();
  return <span className="overview-greeting"><span className="overview-greeting-icon">{greetingIcon(greeting.icon)}</span><span>{greeting.text}, {escapeHtml(accountName())}. Here is where your invoices stand.</span></span>;
};
export function overview() {
  const outstandingTotal = sum(invoice => ["Sent", "Overdue"].includes(invoiceStatus(invoice))),
    renderKpi = (label, value, tab) => <button className="card kpi" onClick={event => {
      go('invoices', String(tab));
    }}><small>{label}</small><b>{value}</b></button>;
  const bad = state.invoices.filter(invoice => invoiceStatus(invoice) === "Overdue");
  return <>{hdr("Overview", overviewSubtitle())}<><div className="grid k4">{renderKpi("Outstanding", formatMoney(outstandingTotal), "Sent")}{renderKpi("Paid", formatMoney(sum(invoice => invoice.s === "Paid")), "Paid")}{renderKpi("Overdue", formatMoney(sum(invoice => invoiceStatus(invoice) === "Overdue")), "Overdue")}{renderKpi("Total invoices", state.invoices.length, "All")}</div>
<div className="grid two" style={{
        "marginTop": "16px"
      }}><div className="grid">{bad.length ? <div className="card" style={{
            "borderColor": "var(--bad)"
          }}><h2>Needs attention</h2>{bad.map(invoice => <div key={invoice.id} className="row b" style={{
              "marginTop": "12px"
            }}><span><button className="btn s sm" onClick={() => openInvoice(String(invoice.id))}>{invoice.number}</button> · <button className="btn s sm" onClick={() => viewClient(state.clientIds[invoice.c])}>{state.clientNames[invoice.c].split(" (")[0]}</button> is overdue since {formatDate(invoice.due)}</span><button className="btn sm" onClick={event => {
                send(String(invoice.id));
              }}>Send reminder</button></div>)}</div> : ""}
<div className="card"><div className="row b"><h2>Recent invoices</h2><a className="mut" style={{
                "cursor": "pointer"
              }} onClick={event => {
                go('invoices');
              }}>View all</a></div><div className="tbw"><table><tbody>{state.invoices.slice(0, 5).map(invoice => <tr key={invoice.id}><td><button className="btn s sm" onClick={() => openInvoice(String(invoice.id))}>{invoice.number}</button> {invoice.rec ? renderPill("Recurring") : ""}<br /><button className="btn s sm mut" onClick={() => viewClient(state.clientIds[invoice.c])}>{state.clientNames[invoice.c].split(" (")[0]}</button></td><td>{renderPill(invoiceStatus(invoice))}</td><td className="r">{formatMoney(invoice.a)}</td></tr>)}</tbody></table></div></div></div>
<div className="grid"><div className="card"><h2>Upcoming recurring</h2>{state.recurringServices.filter(recurringService => recurringService.st === "Active").map((recurringService, recurringIndex) => <div key={recurringService.id || recurringIndex} className="row b" style={{
              "marginTop": "12px"
            }}><span>{state.clientNames[recurringService.c].split(" (")[0]}<br /><span className="mut">{recurringService.f} · {formatDate(recurringService.next)}</span></span><b>{formatMoney(recurringService.a)}</b></div>) || <p className="mut">Nothing scheduled. Turn on Repeat when you create an invoice.</p>}</div>
<div className="card"><div className="row b"><h2>Integrations</h2><a className="mut" style={{
                "cursor": "pointer"
              }} onClick={event => {
                go('integrations');
              }}>Manage</a></div>{Object.keys(providers).map(providerId => intRow(providerId))}</div></div></div></></>;
}
