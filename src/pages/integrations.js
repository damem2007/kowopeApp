import { state } from '../modules/store.js'
import { providers } from '../modules/catalog.js'
import { renderPill } from '../modules/format.js'
import { hdr, renderProviderBadge } from '../ui/layout.js'

export function intRow(providerId, showDetails) {
  const integration = state.integrations[providerId] || { on: false, acct: '' }, isConnected = integration.on
  const ownerActions = state.authUserRole === 'owner' ? (isConnected && showDetails ? `<button class="btn s sm" onclick="wiz('${providerId}',1)">Configure</button><button class="btn s sm" onclick="disc('${providerId}')">Disconnect</button>` : `<button class="btn ${isConnected ? "s" : ""} sm" onclick="manageIntegration('${providerId}')">${isConnected ? "Manage" : "Connect"}</button>`) : ''
  return `<div class="int">${renderProviderBadge(providerId)}<div><b>${providers[providerId][0]}</b><div class="mut" style="font-size:13px">${isConnected ? integration.acct : showDetails ? providers[providerId][1] + " · not connected" : "Not connected"}</div></div>${renderPill(isConnected ? "Connected" : "Off", "")}${ownerActions}</div>`
}

export function integrations() {
  const integrationGroup = (title, providerIds) => `<div class="card"><h2>${title}</h2>${providerIds.map(providerId => intRow(providerId, 1)).join("")}</div>`
  const connectedEmailProviders = ['gmail', 'outlook', 'mailjet'].filter(providerId => state.integrations[providerId]?.on)
  const preferredProvider = state.businessProfiles[0]?.preferredEmailProvider || ''
  const preferredEmailCard = state.authUserRole === 'owner' && connectedEmailProviders.length > 1 ? `<div class="card"><div class="row b"><div><h2>Preferred email provider</h2><span class="mut">Choose which connected provider sends invoices.</span></div>${renderPill('Saved preference', 'Active')}</div><select style="margin-top:14px" onchange="savePreferredEmailProvider(this.value)">${connectedEmailProviders.map(providerId => `<option value="${providerId}" ${preferredProvider === providerId ? 'selected' : ''}>${providers[providerId][0]}</option>`).join('')}</select></div>` : ''
  return hdr("Integrations", "Connect once. Kowope uses them for sending, getting paid and syncing.") + `<div class="grid">${preferredEmailCard}${integrationGroup("Email delivery", ["gmail", "outlook", "mailjet"])}${integrationGroup("Payments", ["stripe"])}${integrationGroup("Accounting", ["qb"])}</div>`
}
