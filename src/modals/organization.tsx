import React from 'react';
import { state } from '../modules/store.ts';
import { createOrganization } from '../actions/auth.ts';
import { render } from '../ui/render.tsx';
export function createOrganizationModal() {
  return <div className="ov c"><div className="md" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title"><div className="row b"><h2 id="organization-modal-title">Create organization</h2><button className="ghost" onClick={event => {
          state.activeModal = null;
          render();
        }} aria-label="Close">×</button></div><p className="mut">Create a shared workspace for collaborating on invoices, clients, and payments with invited members.</p><label className="fl" htmlFor="organization-name">Organization name</label><input id="organization-name" type="text" placeholder="e.g. Acme Studio" autoComplete="organization" autoFocus /><div className="row" style={{
        "justifyContent": "flex-end",
        "marginTop": "18px"
      }}><button className="btn s" onClick={event => {
          state.activeModal = null;
          render();
        }}>Cancel</button><button className="btn" onClick={event => {
          createOrganization();
        }}>Create organization</button></div></div></div>;
}
