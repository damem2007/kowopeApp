import { state } from '../modules/store.ts'
import { querySelector } from '../modules/selectors.ts'
import { render, toast } from '../ui/render.tsx'
import { queueInvoiceDraftAutosave } from './invoices.ts'

export const editClient = clientIndex => { state.ce = clientIndex; state.activeModal = 'clientEdit'; render() }

export const viewClient = clientId => {
  if (!state.clientIds.includes(clientId)) return toast('Client not found.')
  state.selectedClientId = clientId
  state.currentRoute = 'clients'
  render()
  window.scrollTo?.(0, 0)
}

export const viewClientInvoices = clientId => {
  if (!state.clientIds.includes(clientId)) return toast('Client not found.')
  state.invoiceClientId = clientId
  state.activeInvoiceTab = 'All'
  state.currentRoute = 'invoices'
  render()
  window.scrollTo?.(0, 0)
}

export const saveClientEdit = async () => {
  const clientIndex = state.ce, clientData = { name: querySelector('#ecn').value.trim(), email: querySelector('#ece').value.trim(), phone: querySelector('#ecp').value.trim(), address: querySelector('#eca').value }, clientId = state.clientIds?.[clientIndex]
  if (!clientData.name || !clientData.email) return
  if (clientId) { const response = await fetch(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clientData) }); if (!response.ok) return toast('Unable to update client') }
  state.clientNames[clientIndex] = clientData.name; state.clientDetails[clientIndex] = { e: clientData.email, p: clientData.phone, a: clientData.address }; state.activeModal = null
  toast(clientData.name + ' updated')
}

export const addC = async () => {
  const body = { name: querySelector("#cn").value.trim(), email: querySelector("#ce").value.trim(), phone: querySelector("#cp").value, address: querySelector("#ca").value }
  if (!body.name || !body.email) return toast('Client name and email are required.')
  try {
    const response = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const client = await response.json()
    if (!response.ok) throw new Error(client.error || 'Unable to save client')
    state.clientNames.push(client.name); state.clientDetails.push({ e: client.email, p: client.phone || '', a: client.address || '' }); state.clientIds.push(client.id)
    if (state.invoiceEditor) {
      state.invoiceEditor.clientIndex = state.clientNames.length - 1
      queueInvoiceDraftAutosave()
    }
    state.activeModal = null; toast(client.name + " added")
  } catch (error) { toast(error.message) }
}
