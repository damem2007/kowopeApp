import { state } from '../modules/store.js'
import { $ } from '../modules/selectors.js'
import { render, toast } from '../ui/render.js'

export const editClient = clientIndex => { state.ce = clientIndex; state.activeModal = 'clientEdit'; render() }

export const saveClientEdit = async () => {
  const clientIndex = state.ce, clientData = { name: $('#ecn').value.trim(), email: $('#ece').value.trim(), phone: $('#ecp').value.trim(), address: $('#eca').value }, clientId = state.clientIds?.[clientIndex]
  if (!clientData.name || !clientData.email) return
  if (clientId) { const response = await fetch(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clientData) }); if (!response.ok) return toast('Unable to update client') }
  state.clientNames[clientIndex] = clientData.name; state.clientDetails[clientIndex] = { e: clientData.email, p: clientData.phone, a: clientData.address }; state.activeModal = null
  toast(clientData.name + ' updated')
}

export const addC = async () => {
  const body = { name: $("#cn").value.trim(), email: $("#ce").value.trim(), phone: $("#cp").value, address: $("#ca").value }
  if (!body.name || !body.email) return toast('Client name and email are required.')
  try {
    const response = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const client = await response.json()
    if (!response.ok) throw new Error(client.error || 'Unable to save client')
    state.clientNames.push(client.name); state.clientDetails.push({ e: client.email, p: client.phone || '', a: client.address || '' }); state.clientIds.push(client.id)
    if (state.invoiceEditor) state.invoiceEditor.clientIndex = state.clientNames.length - 1
    state.activeModal = null; toast(client.name + " added")
  } catch (error) { toast(error.message) }
}
