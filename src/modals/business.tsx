import React from 'react';
import { state } from '../modules/store.ts';
export const businessModal = () => {
  const businessProfile = state.be >= 0 ? state.businessProfiles[state.be] : {
    n: "",
    a: "",
    e: "",
    p: ""
  };
  const logoDataUrl = state.businessLogoDraft === undefined ? businessProfile.logoDataUrl || '' : state.businessLogoDraft;
  const logoRemoveButton = logoDataUrl ? <button type="button" className="business-logo-remove" aria-label="Remove logo" title="Remove logo" onClick={event => {
    event.preventDefault();
    event.stopPropagation();
    state.businessLogoDraft = null;
    render();
  }}>×</button> : '';
  return <div className="ov c"><div className="md"><h2>{state.be >= 0 ? "Edit business" : "New business"}</h2><label className="fl">Business name</label><input id="bn" defaultValue={businessProfile.n} /><label className="fl">Address</label><textarea id="ba" defaultValue={businessProfile.a} /><label className="fl">Email</label><input id="be" defaultValue={businessProfile.e} /><label className="fl">Phone</label><input id="bp" defaultValue={businessProfile.p} /><label className="fl">Company logo <span className="mut">(optional, max 512 KB)</span></label><div className="business-logo-container"><label className="invoice-logo-upload business-logo-upload" aria-label="Upload your logo">{logoDataUrl ? <img src={logoDataUrl} alt="Business logo preview" className="business-logo-preview" /> : <span className="invoice-logo-icon" aria-hidden="true">⊞</span>}<span><b>{logoDataUrl ? 'Replace your logo' : 'Upload your logo'}</b><small>PNG, JPG or WEBP · max 512 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            uploadBusinessLogo(event.currentTarget);
          }} /></label>{logoRemoveButton}</div><div className="row b" style={{
        "marginTop": "18px"
      }}><button className="btn s" onClick={event => {
          state.businessLogoDraft = undefined;
          state.activeModal = null;
          render();
        }}>Cancel</button><button className="btn" onClick={event => {
          saveBiz();
        }}>Save business</button></div></div></div>;
};
