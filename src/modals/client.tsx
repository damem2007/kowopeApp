import React from 'react';
import { state } from '../modules/store.ts';
import { addC, saveClientEdit } from '../actions/clients.ts';
import { render } from '../ui/render.tsx';
export const newClientModal = () => <div className="ov c"><div className="md"><h2>New client</h2><label className="fl">Name</label><input id="cn" /><label className="fl">Email</label><input id="ce" /><label className="fl">Phone</label><input id="cp" /><label className="fl">Address</label><textarea id="ca" /><div className="row b" style={{
      "marginTop": "18px"
    }}><button className="btn s" onClick={event => {
        state.activeModal = null;
        render();
      }}>Cancel</button><button className="btn" onClick={event => {
        addC();
      }}>Save client</button></div></div></div>;
export function clientEditModal() {
  const clientIndex = state.ce,
    clientDetails = state.clientDetails[clientIndex] || {};
  return <div className="ov c"><div className="md"><h2>Edit client</h2><label className="fl">Name</label><input id="ecn" defaultValue={state.clientNames[clientIndex] || ''} /><label className="fl">Email</label><input id="ece" defaultValue={clientDetails.e || ''} /><label className="fl">Phone</label><input id="ecp" defaultValue={clientDetails.p || ''} /><label className="fl">Address</label><textarea id="eca" defaultValue={clientDetails.a || ''} /><div className="row b" style={{
        "marginTop": "18px"
      }}><button className="btn s" onClick={event => {
          state.activeModal = null;
          render();
        }}>Cancel</button><button className="btn" onClick={event => {
          saveClientEdit();
        }}>Save changes</button></div></div></div>;
}
