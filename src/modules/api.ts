const json = async (response) => {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export const api = {
  clients: () => fetch('/api/clients').then(json),
  invoices: () => fetch('/api/invoices').then(json),
  profile: () => fetch('/api/business-profile').then(json),
  integrations: () => fetch('/api/integrations').then(json),
  createInvoice: (payload) => fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(json),
  pdfPreview: (payload) => fetch('/api/invoices/preview/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
}
