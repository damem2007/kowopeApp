import React from 'react';
import { state } from '../modules/store.ts';
import { providers } from '../modules/catalog.tsx';
import { renderPill } from '../modules/format.tsx';
import { hdr, renderProviderBadge } from '../ui/layout.tsx';
import { disc, manageIntegration, savePreferredEmailProvider, wiz } from '../actions/integrations.ts';
export function intRow(providerId: any, showDetails: any = false) {
  const integration = state.integrations[providerId] || {
      on: false,
      acct: ''
    },
    isConnected = integration.on;
  const ownerActions = state.authUserRole === 'owner' ? isConnected && showDetails ? <><button className="btn s sm" onClick={event => {
      wiz(String(providerId), 1);
    }}>Configure</button><button className="btn s sm" onClick={event => {
      disc(String(providerId));
    }}>Disconnect</button></> : <button className={`btn ${isConnected ? "s" : ""} sm`} onClick={event => {
    manageIntegration(String(providerId));
  }}>{isConnected ? "Manage" : "Connect"}</button> : '';
  return <div key={providerId} className="int">{renderProviderBadge(providerId)}<div><b>{providers[providerId][0]}</b><div className="mut" style={{
        "fontSize": "13px"
      }}>{isConnected ? integration.acct : showDetails ? providers[providerId][1] + " · not connected" : "Not connected"}</div></div>{renderPill(isConnected ? "Connected" : "Off", "")}{ownerActions}</div>;
}
export function integrations() {
  const integrationGroup = (title, providerIds) => <div className="card"><h2>{title}</h2>{providerIds.map(providerId => intRow(providerId, 1))}</div>;
  const connectedEmailProviders = ['gmail', 'outlook', 'mailjet'].filter(providerId => state.integrations[providerId]?.on);
  const preferredProvider = state.businessProfiles[0]?.preferredEmailProvider || '';
  const preferredEmailCard = state.authUserRole === 'owner' && connectedEmailProviders.length > 1 ? <div className="card"><div className="row b"><div><h2>Preferred email provider</h2><span className="mut">Choose which connected provider sends invoices.</span></div>{renderPill('Saved preference', 'Active')}</div><select style={{
      "marginTop": "14px"
    }} onChange={event => {
      savePreferredEmailProvider(event.currentTarget.value);
    }} value={preferredProvider}>{connectedEmailProviders.map(providerId => <option key={providerId} value={providerId}>{providers[providerId][0]}</option>)}</select></div> : '';
  return <>{hdr("Integrations", "Connect once. Kowope uses them for sending, getting paid and syncing.")}<div className="grid">{preferredEmailCard}{integrationGroup("Email delivery", ["gmail", "outlook", "mailjet"])}{integrationGroup("Payments", ["stripe"])}{integrationGroup("Accounting", ["qb"])}</div></>;
}
