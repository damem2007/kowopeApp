import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate, stepFrequency } from '../modules/date.ts';
import { formatMoney, renderPill } from '../modules/format.tsx';
import { isMail } from '../modules/selectors.ts';
import { hdates } from '../modules/recurrence.ts';
import { hdr } from '../ui/layout.tsx';
import { currencySigns } from '../modules/catalog.tsx';
import { svNext } from '../actions/recurring.ts';
import { go, render } from '../ui/render.tsx';

const isValidDate = value => {
  const dateText = String(value || '');
  const parsedDate = new Date(`${dateText}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateText;
};

export function service() {
  const serviceState = state.sv,
    serviceSteps = ["Service", "Billing history", "Price going forward", "Review"],
    frequencies = ["Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"],
    priceChangePercent = Math.round((serviceState.na - serviceState.a) / serviceState.a * 100),
    hasPriceChange = Boolean(serviceState.hist && Number(serviceState.a) > 0 && Number(serviceState.na) > 0 && +serviceState.na !== +serviceState.a),
    clientName = serviceState.c !== "" ? state.clientNames[serviceState.c].split(" (")[0] : "",
    currencies = Object.keys(currencySigns),
    historicalDates = serviceState.hist && Number(serviceState.n) >= 1 && isValidDate(serviceState.start) ? hdates(serviceState) : [],
    isPerpetual = serviceState.durationMode === 'perpetual',
    futureInvoiceCount = isPerpetual ? 3 : Math.max(1, Number(serviceState.occurrenceCount) || 1),
    futureDates = isValidDate(serviceState.from) ? Array.from({ length: futureInvoiceCount }, (_, invoiceOffset) => stepFrequency(serviceState.from, serviceState.f, invoiceOffset)) : [];
  const renderHistoryRow = (date, amount, isPaid: any = false) => <div key={date} className="row b" style={{
    "padding": "9px 0",
    "borderBottom": "1px solid var(--line)"
  }}><span>{formatDate(date)}</span>{renderPill(isPaid ? "Paid" : "Scheduled", isPaid ? "Paid" : "Sent")}<b>{formatMoney(amount)}</b></div>;
  const renderToggle = (toggleId, label, isChecked, onChange) => <div className="tg"><input type="checkbox" id={toggleId} defaultChecked={Boolean(isChecked)} onChange={onChange} /><label htmlFor={toggleId}>{label}</label></div>;
  let stepContent;
  if (serviceState.s === 0) stepContent = <><h2>What do you bill this client for?</h2>
    <label className="fl">Client</label>
    <select value={serviceState.c} onChange={event => {
      state.sv.c = event.currentTarget.value;
      render();
    }}>
      <option value="">Select client</option>
      {state.clientNames.map((clientName, clientIndex) => <option key={clientIndex} value={clientIndex}>{clientName}</option>)}
    </select>
    <label className="fl">Service description</label>
    <input defaultValue={serviceState.d} placeholder="Monthly advisory retainer" onChange={event => {
      state.sv.d = event.currentTarget.value;
    }} />
    <label className="fl">Billed</label>
    <select defaultValue={serviceState.f} onChange={event => {
      state.sv.f = event.currentTarget.value;
    }}>{frequencies.map(frequency => <option key={frequency} value={frequency}>{frequency}</option>)}</select></>;else if (serviceState.s === 1) stepContent = <><h2>Billing history</h2>
  <p className="mut">Already billed this client for this service? Record it once and it is kept as paid history.</p>
  {renderToggle("hh", "This client has already paid me for this service", serviceState.hist, event => {
      state.sv.hist = event.currentTarget.checked ? 1 : 0;
      render();
    })}{serviceState.hist ? <><div className="grid" style={{
        "gridTemplateColumns": "1fr 1fr 1fr",
        "gap": "0 10px"
      }}><div><label className="fl">Invoices paid</label><input type="number" min="1" value={serviceState.n} onChange={event => {
            state.sv.n = +event.currentTarget.value;
            render();
          }} /></div><div><label className="fl">Currency</label><select value={serviceState.currency || state.defaultCurrency} onChange={event => {
            state.sv.currency = event.currentTarget.value;
            render();
          }}>{currencies.map(currencyCode => <option key={currencyCode} value={currencyCode}>{currencyCode} ({currencySigns[currencyCode]})</option>)}</select></div><div><label className="fl">Amount each</label><input type="number" min="0" step="0.01" value={serviceState.a} onChange={event => {
            state.sv.a = +event.currentTarget.value;
            render();
          }} /></div><div><label className="fl">First invoice</label><input type="date" value={serviceState.start} onChange={event => {
            state.sv.start = event.currentTarget.value;
            render();
          }} /></div></div><p className="mut" style={{
        "margin": "14px 0 0"
      }}>These will be saved as paid invoices and added to Payments:</p>{historicalDates.map(date => renderHistoryRow(date, serviceState.a, 1))}</> : ""}</>;else if (serviceState.s === 2) stepContent = <><h2>Price going forward</h2><label className="fl">Amount for new invoices</label><input type="number" min="0" step="0.01" value={serviceState.na} onChange={event => {
      state.sv.na = +event.currentTarget.value;
      render();
    }} />{hasPriceChange ? <p className="ok" style={{
      "margin": "8px 0 0"
    }}>{priceChangePercent > 0 ? "Increase" : "Change"} of {Math.abs(priceChangePercent)}% from {formatMoney(serviceState.a)}. Your {serviceState.n} past invoices keep {formatMoney(serviceState.a)}.</p> : ""}<label className="fl">First new invoice on</label><input type="date" value={serviceState.from} onChange={event => {
      state.sv.from = event.currentTarget.value;
      render();
    }} /><label className="fl">Schedule duration</label><select value={serviceState.durationMode} onChange={event => {
      state.sv.durationMode = event.currentTarget.value;
      render();
    }}><option value="perpetual">Perpetual</option><option value="finite">Set number of invoices</option></select>{!isPerpetual ? <><label className="fl">Number of future invoices</label><input type="number" min="1" max="120" value={serviceState.occurrenceCount} onChange={event => {
      state.sv.occurrenceCount = event.currentTarget.value === '' ? '' : Number(event.currentTarget.value);
      render();
    }} /></> : <p className="mut" style={{
      "margin": "8px 0 0"
    }}>Invoices continue until you pause or cancel this service.</p>}{renderToggle("ha", "Send each invoice automatically" + (isMail() ? "" : " (needs an email account)"), serviceState.auto, event => {
      state.sv.auto = event.currentTarget.checked ? 1 : 0;
    })}{hasPriceChange ? renderToggle("hn", "Add a price-change note to the first new invoice", serviceState.note, event => {
      state.sv.note = event.currentTarget.checked ? 1 : 0;
    }) : ""}</>;else stepContent = <><h2>Review</h2><p className="mut" style={{
      "margin": "6px 0 10px"
    }}>{clientName}, {serviceState.d}, billed {serviceState.f.toLowerCase()}.</p>{historicalDates.map(date => renderHistoryRow(date, serviceState.a, 1))}{hasPriceChange ? <div style={{
      "background": "var(--pri2)",
      "color": "var(--pri)",
      "borderRadius": "10px",
      "padding": "10px 14px",
      "margin": "10px 0",
      "fontWeight": "700"
    }}>Price changes to {formatMoney(serviceState.na)} on {formatDate(serviceState.from)} ({priceChangePercent > 0 ? "+" : ""}{priceChangePercent}%)</div> : ""}<p className="mut" style={{
      "margin": "12px 0 4px"
    }}>{isPerpetual ? 'First 3 upcoming invoices (continues indefinitely):' : `${futureInvoiceCount} scheduled ${futureInvoiceCount === 1 ? 'invoice' : 'invoices'}:`}</p>{futureDates.map(date => renderHistoryRow(date, serviceState.na))}<p className="mut" style={{
      "margin": "12px 0 0"
    }}>Past invoices stay as history. Only new invoices use {formatMoney(serviceState.na)}. You can change the price later from the Recurring tab.</p></>;
  return <>{hdr("Set up a recurring service", "Record what you have billed, then set the price going forward.", <button className="btn s" onClick={event => {
      state.sv = null;
      go('invoices', 'Recurring');
    }}>Cancel</button>)}<div className="card" style={{
      "maxWidth": "680px"
    }}><div className="mut" style={{
        "fontSize": "13px"
      }}>Step {serviceState.s + 1} of 4: {serviceSteps[serviceState.s]}</div><div className="stp">{serviceSteps.map((serviceStep, stepIndex) => <div key={serviceStep} className={stepIndex <= serviceState.s ? "a" : ""} />)}</div>{stepContent}{serviceState.err ? <div className="err">{serviceState.err}</div> : ""}<div className="row b" style={{
        "marginTop": "20px"
      }}><button className="btn s" disabled={Boolean(serviceState.s ? "" : "disabled")} onClick={event => {
          state.sv.s--;
          state.sv.err = '';
          render();
        }}>Back</button><button className="btn" onClick={event => {
          svNext();
        }}>{serviceState.s === 3 ? "Create recurring service" : "Continue"}</button></div></div></>;
}
