import React from 'react';
import { state } from '../modules/store.ts';
export const currencyModal = () => <div className="ov c"><div className="md"><h2>Add currency</h2><label className="fl">ISO code</label><input id="xc" maxLength={3} placeholder="GBP" style={{
      "textTransform": "uppercase"
    }} /><label className="fl">Currency name</label><input id="xn" placeholder="British pound" /><label className="fl">Sign</label><input id="xs" maxLength={4} placeholder="\xA3" /><div id="xe" className="err" /><div className="row b" style={{
      "marginTop": "18px"
    }}><button className="btn s" onClick={event => {
        state.activeModal = null;
        render();
      }}>Cancel</button><button className="btn" onClick={event => {
        addCur();
      }}>Add currency</button></div></div></div>;
