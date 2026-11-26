import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate, stepFrequency } from '../modules/date.ts';
import { formatMoney } from '../modules/format.tsx';
import { isMail } from '../modules/selectors.ts';
import { nextOn } from '../modules/recurrence.ts';
import { querySelector } from '../modules/selectors.ts';
import { mrs, saveChg, saveRec } from '../actions/recurring.ts';
import { render } from '../ui/render.tsx';
export const makeRecurringModal = () => {
  const invoice = state.invoices.find(candidate => candidate.id === state.mr),
    nextDate = nextOn(invoice, "Monthly");
  return <div className="ov c"><div className="md"><h2>Make {invoice.number} recurring</h2><p className="mut" style={{
        "margin": "6px 0 0"
      }}>{state.clientNames[invoice.c].split(" (")[0]} is billed {formatMoney(invoice.a)} each time. Future invoices copy this one.</p><label className="fl">Amount for new invoices</label><input id="ma" type="number" min="0" step="0.01" defaultValue={invoice.a} /><div className="mut" style={{
        "fontSize": "12px"
      }}>{invoice.number} keeps its {formatMoney(invoice.a)} in your history.</div><label className="fl">Frequency</label><select id="mf" onChange={event => {
        (querySelector('#mrd') as HTMLInputElement).value = nextOn(state.invoices.find(candidate => candidate.id === state.mr), event.currentTarget.value);
        mrs();
      }} defaultValue="Monthly">{["Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly"].map(frequency => <option key={frequency} value={frequency}>{frequency}</option>)}</select><label className="fl">First new invoice on</label><input type="date" id="mrd" defaultValue={nextDate} onChange={event => {
        mrs();
      }} /><div className="tg"><input type="checkbox" id="mau" /><label htmlFor="mau">Send automatically{isMail() ? "" : " (needs an email account)"}</label></div><p id="mrp" className="ok" style={{
        "margin": "10px 0 0"
      }}>Next 3 invoices: {[0, 1, 2].map(offset => formatDate(stepFrequency(nextDate, "Monthly", offset))).join(", ")}</p><div id="mre" className="err" /><div className="row b" style={{
        "marginTop": "18px"
      }}><button className="btn s" onClick={event => {
          state.activeModal = null;
          render();
        }}>Not now</button><button className="btn" onClick={event => {
          saveRec();
        }}>Create schedule</button></div></div></div>;
};
export const changePriceModal = () => {
  const recurringSchedule = state.recurringServices[state.cr];
  return <div className="ov c"><div className="md"><h2>Change price</h2><p className="mut" style={{
        "margin": "6px 0 0"
      }}>Invoices already issued keep their amounts. Only invoices created from the effective date use the new price.</p><label className="fl">New amount (currently {formatMoney(recurringSchedule.a)})</label><input id="ca2" type="number" min="0" step="0.01" /><label className="fl">Effective from</label><input id="cf" type="date" defaultValue={recurringSchedule.next} /><div id="ce2" className="err" /><div className="row b" style={{
        "marginTop": "18px"
      }}><button className="btn s" onClick={event => {
          state.activeModal = null;
          render();
        }}>Cancel</button><button className="btn" onClick={event => {
          saveChg();
        }}>Apply price change</button></div></div></div>;
};
