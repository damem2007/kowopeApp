import React, { useEffect, useMemo, useState } from 'react';
import { state } from '../modules/store.ts';
import { saveInvoiceNumbering } from '../actions/settings.ts';
const DEFAULT_FORMAT = '{PREFIX}{YYYY}-{NUMBER}';
type BusinessProfile = {
  id?: number | null;
  n?: string;
  invoicePrefix?: string;
  invoicePadding?: number;
  invoiceFormat?: string;
};
type NumberingDraft = {
  prefix: string;
  padding: number | string;
  format: string;
};
function initialDraft(profile?: BusinessProfile): NumberingDraft {
  return {
    prefix: profile?.invoicePrefix ?? 'INV-',
    padding: profile?.invoicePadding ?? 4,
    format: profile?.invoiceFormat ?? DEFAULT_FORMAT
  };
}
export function InvoiceNumberingCard() {
  const appState = state as any;
  const profiles = (appState.businessProfiles as BusinessProfile[]).filter(profile => profile.id != null);
  const selected = Number.isInteger(appState.numberingBusinessIndex) ? appState.numberingBusinessIndex : 0;
  const businessIndex = profiles.findIndex(profile => profile.id === appState.numberingBusinessProfileId);
  const index = businessIndex >= 0 ? businessIndex : Math.min(selected, Math.max(profiles.length - 1, 0));
  const profile = profiles[index];
  const [draft, setDraft] = useState(() => initialDraft(profile));
  useEffect(() => {
    setDraft(initialDraft(profile));
  }, [profile?.id]);
  const changeBusiness = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = Number(event.currentTarget.value);
    appState.numberingBusinessIndex = newIndex;
    appState.numberingBusinessProfileId = profiles[newIndex].id;
    setDraft(initialDraft(profiles[newIndex]));
  };
  const preview = useMemo(() => {
    const year = String(new Date().getFullYear());
    const padding = Math.min(10, Math.max(1, Number(draft.padding) || 4));
    return draft.format.replaceAll('{PREFIX}', draft.prefix).replaceAll('{YYYY}', year).replaceAll('{YY}', year.slice(-2)).replaceAll('{NUMBER}', String(1).padStart(padding, '0'));
  }, [draft]);
  const insertToken = (token: string) => {
    setDraft(current => ({
      ...current,
      format: current.format + token
    }));
  };
  return <section className="card numbering-card">
      <div className="settings-head">
        <div>
          <h3>Invoice numbering</h3>
          <p className="settings-sub">Every invoice uses the saved format for its business. Existing invoice numbers do not change.</p>
        </div>
      </div>
      {profiles.length === 0 ? <p className="mut">Save a business profile to configure its invoice numbering.</p> : <>
          <div className="settings-fields">
            <label className="fl" htmlFor="numbering-business">Business profile
              <select id="numbering-business" value={index} onChange={changeBusiness}>
                {profiles.map((item, profileIndex) => <option key={item.id} value={profileIndex}>{item.n || `Business ${item.id}`}</option>)}
              </select>
            </label>
          </div>
          <div className="settings-fields">
            <label className="fl" htmlFor="invoice-format">Format pattern
              <input id="invoice-format" value={draft.format} onChange={event => setDraft(current => ({...current,format: event.target.value}))} />
            </label>
            <label className="fl" htmlFor="invoice-prefix">Prefix value
              <input id="invoice-prefix" value={draft.prefix} onChange={event => setDraft(current => ({...current,prefix: event.target.value}))} />
            </label>
            <label className="fl" htmlFor="invoice-padding">Number padding
            <input id="invoice-padding" type="number" min="1" max="10" value={draft.padding} onChange={event => setDraft(current => ({...current,padding: event.target.value}))} />
            </label>
          </div>
          <p className="settings-sub">Insert a format token:</p>
          <div className="chips">
            {['{PREFIX}', '{YYYY}', '{YY}', '{NUMBER}'].map(token => <button key={token} type="button" className="token" onClick={() => insertToken(token)}>{token}</button>)}
          </div>
          <div className="preview numbering-preview">Example: <b id="invoice-format-example">{preview}</b></div>
          <div className="settings-footer numbering-footer">
            <button className="btn" type="button" onClick={saveInvoiceNumbering}>Save numbering</button>
          </div>
        </>}
    </section>;
}
