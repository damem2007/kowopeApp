import { state } from '../modules/store.ts'
import { today, formatDate, addDays, stepFrequency } from '../modules/date.ts'
import { querySelector } from '../modules/selectors.ts'
import { formatMoney } from '../modules/format.tsx'
import { isMail } from '../modules/selectors.ts'
import { hdates, svFrom } from '../modules/recurrence.ts'
import { render, toast } from '../ui/render.tsx'

const isValidDate = value => {
  const dateText = String(value || '')
  const parsedDate = new Date(`${dateText}T00:00:00.000Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateText
}

export const runRec = async recurringIndex => {
  const recurringService = state.recurringServices[recurringIndex]
  if (recurringService?.st === 'Cancelled' || recurringService?.st === 'Completed') return toast(`${recurringService.st} recurring services cannot create invoices.`)
  if (recurringService?.endAt && recurringService.next > recurringService.endAt) {
    recurringService.st = 'Completed'
    render()
    return toast('This recurring service has reached its selected duration.')
  }
  if (recurringService.chg && recurringService.chg.from <= recurringService.next) { recurringService.prev = recurringService.a; recurringService.a = recurringService.chg.a; recurringService.chg = null }
  try {
    const response = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessProfileId: recurringService.businessProfileId ?? state.numberingBusinessProfileId ?? null, clientId: state.clientIds[recurringService.c], description: recurringService.d || 'Recurring service', amount: recurringService.a, dueDate: addDays(today, 30), currency: recurringService.cur || state.defaultCurrency, paymentInstructions: recurringService.n || '', lineItems: [{ description: recurringService.d || 'Recurring service', quantity: 1, unitPrice: recurringService.a }] }) })
    const savedInvoice = await response.json()
    if (!response.ok) throw new Error(savedInvoice.error || 'Unable to create recurring invoice')
    recurringService.next = stepFrequency(recurringService.next, recurringService.f, 1)
    if (recurringService.id) {
      const scheduleResponse = await fetch(`/api/recurring/${recurringService.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextRunAt: recurringService.next }) })
      const savedSchedule = await scheduleResponse.json()
      if (!scheduleResponse.ok) throw new Error(savedSchedule.error || 'Unable to update recurring schedule')
      if (savedSchedule.status === 'completed') recurringService.st = 'Completed'
    }
    state.invoices.push({ id: savedInvoice.number, c: recurringService.c, a: Number(savedInvoice.amount), due: savedInvoice.due_date || '', s: savedInvoice.status || 'Draft', rec: 1, cur: savedInvoice.currency || 'USD', n: savedInvoice.payment_instructions || '' })
    toast(savedInvoice.number + " created from schedule")
  } catch (error) { toast(error.message) }
}

export const mrs = () => { const frequency = querySelector("#mf").value, nextDate = querySelector("#mrd").value; querySelector("#mrp").textContent = nextDate ? "Next 3 invoices: " + [0, 1, 2].map(offset => formatDate(stepFrequency(nextDate, frequency, offset))).join(", ") : "" }

export const saveRec = async () => {
  const sourceInvoice = state.invoices.find(invoice => invoice.id === state.mr), frequency = querySelector("#mf").value, nextDate = querySelector("#mrd").value, showError = message => (querySelector("#mre").textContent = message)
  if (!nextDate) return showError("Pick the date of the first new invoice.")
  if (nextDate <= today) return showError("Choose a date after today.")
  try {
    const sourceResponse = await fetch(`/api/invoices/${encodeURIComponent(sourceInvoice.id)}`)
    const sourceDetails = await sourceResponse.json()
    if (!sourceResponse.ok) throw new Error(sourceDetails.error || 'Unable to load source invoice')
    const response = await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessProfileId: sourceDetails.business_profile_id ?? sourceInvoice.businessProfileId ?? null, clientId: state.clientIds[sourceInvoice.c], description: sourceInvoice.d || sourceDetails.description || 'Recurring service', amount: +querySelector("#ma").value || sourceInvoice.a, frequency, nextRunAt: nextDate, currency: sourceInvoice.cur || state.defaultCurrency, autoSend: querySelector("#mau").checked ? 1 : 0, sourceInvoiceId: sourceDetails.id }) })
    const savedSchedule = await response.json()
    if (!response.ok) throw new Error(savedSchedule.error || 'Unable to create recurring schedule')
    state.recurringServices.push({ businessProfileId: savedSchedule.business_profile_id ?? null, id: savedSchedule.id, c: sourceInvoice.c, a: Number(savedSchedule.amount || querySelector("#ma").value || sourceInvoice.a), d: sourceInvoice.d || 'Recurring service', f: frequency, next: nextDate, st: 'Active', auto: savedSchedule.auto_send, src: sourceInvoice.id })
    sourceInvoice.rec = 1; state.activeModal = null
    toast("Recurring schedule created. Next invoice on " + formatDate(nextDate))
  } catch (error) { toast(error.message) }
}

export const saveChg = async () => {
  const recurringService = state.recurringServices[state.cr], newAmount = +querySelector("#ca2").value, effectiveDate = querySelector("#cf").value, showError = message => (querySelector("#ce2").textContent = message)
  if (!(newAmount > 0)) return showError("Enter the new amount.")
  if (!effectiveDate || effectiveDate <= today) return showError("Choose a date after today.")
  try {
    if (!recurringService.id) throw new Error('This recurring schedule has not been saved yet.')
    const response = await fetch(`/api/recurring/${recurringService.id}/price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmount, effectiveFrom: effectiveDate }) })
    const savedPriceChange = await response.json()
    if (!response.ok) throw new Error(savedPriceChange.error || 'Unable to save price change')
    recurringService.chg = { from: effectiveDate, a: newAmount }; state.activeModal = null
    toast("Price changes to " + formatMoney(newAmount) + " from " + formatDate(effectiveDate))
  } catch (error) { showError(error.message) }
}

export const toggleRecurring = async recurringIndex => {
  const recurringService = state.recurringServices[recurringIndex]
  if (!recurringService?.id) return toast('This recurring schedule is not saved in the database.')
  if (recurringService.st === 'Cancelled' || recurringService.st === 'Completed') return toast(`${recurringService.st} recurring services cannot be resumed.`)
  const nextStatus = recurringService.st === 'Active' ? 'paused' : 'active'
  const response = await fetch(`/api/recurring/${recurringService.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
  const savedSchedule = await response.json()
  if (!response.ok) return toast(savedSchedule.error || 'Unable to update recurring schedule')
  recurringService.st = nextStatus === 'active' ? 'Active' : 'Paused'
  toast(`Recurring schedule ${recurringService.st.toLowerCase()}`)
}

export const cancelRecurring = async recurringIndex => {
  const recurringService = state.recurringServices[recurringIndex]
  if (!recurringService?.id) return toast('This recurring schedule is not saved in the database.')
  try {
    const response = await fetch(`/api/recurring/${recurringService.id}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to cancel recurring schedule')
    if (result.action === 'cancelled') {
      recurringService.st = 'Cancelled'
      toast('Recurring service cancelled. Its issued invoice history is retained.')
    } else {
      state.recurringServices.splice(recurringIndex, 1)
      toast('Recurring service deleted because it has no issued or paid invoices.')
    }
    render()
  } catch (error) { toast(error.message) }
}

export const svNew = clientIndex => { state.sv = { businessProfileId: state.numberingBusinessProfileId ?? state.businessProfiles[0]?.id ?? null, c: clientIndex === undefined ? "" : clientIndex, d: "", f: "Monthly", hist: 0, n: 1, a: '', start: '', na: '', from: "", durationMode: 'perpetual', occurrenceCount: 1, auto: 0, note: 0, s: 0, err: "" }; state.currentRoute = "svc"; render(); scrollTo(0, 0) }

export const svNext = () => {
  const serviceState = state.sv, hasValidHistoryStart = isValidDate(serviceState.start), historicalDates = serviceState.hist && hasValidHistoryStart ? hdates(serviceState) : []; serviceState.err = ""
  if (serviceState.s === 0 && (serviceState.c === "" || !serviceState.d.trim())) serviceState.err = "Choose a client and describe the service."
  else if (serviceState.s === 1 && serviceState.hist) { if (!(serviceState.n >= 1 && serviceState.n <= 36) || !(serviceState.a > 0) || !hasValidHistoryStart) serviceState.err = "Enter how many invoices, the amount each and a valid first invoice date."; else if (historicalDates[historicalDates.length - 1] > today) serviceState.err = "Past invoices cannot be dated in the future." }
  else if (serviceState.s === 2) { if (!(serviceState.na > 0)) serviceState.err = "Enter the price for new invoices."; else if (!serviceState.from || serviceState.from < today || (serviceState.hist && serviceState.from <= historicalDates[historicalDates.length - 1])) serviceState.err = "The first new invoice must be today or later, and after your last past invoice."; else if (serviceState.durationMode === 'finite' && (!Number.isInteger(Number(serviceState.occurrenceCount)) || serviceState.occurrenceCount < 1 || serviceState.occurrenceCount > 120)) serviceState.err = "Choose between 1 and 120 future invoices, or select a perpetual schedule." }
  if (serviceState.err) return render()
  if (serviceState.s === 3) return svSave()
  serviceState.s++; if (serviceState.s === 2) serviceState.from = svFrom(serviceState); render()
}

export const svSave = async () => {
  const serviceState = state.sv, clientIndex = +serviceState.c, clientId = state.clientIds[clientIndex]
  try {
    let lastInvoice
    const historicalInvoiceIds = []
    for (const issueDate of hdates(serviceState)) {
      const invoiceResponse = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessProfileId: serviceState.businessProfileId ?? state.numberingBusinessProfileId ?? state.businessProfiles[0]?.id ?? null, clientId, description: serviceState.d, amount: +serviceState.a, dueDate: issueDate, issueDate, isPast: true, currency: state.defaultCurrency, lineItems: [{ description: serviceState.d, quantity: 1, unitPrice: +serviceState.a }] }) })
      const savedInvoice = await invoiceResponse.json()
      if (!invoiceResponse.ok) throw new Error(savedInvoice.error || 'Unable to save historical invoice')
      const paymentResponse = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: savedInvoice.number, method: 'Manual', date: issueDate, amount: +serviceState.a }) })
      const savedPayment = await paymentResponse.json()
      if (!paymentResponse.ok) throw new Error(savedPayment.error || 'Unable to save historical payment')
      state.invoices.unshift({ id: savedInvoice.number, c: clientIndex, a: Number(savedInvoice.amount), iss: issueDate, due: issueDate, s: 'Paid', old: 1, d: serviceState.d, cur: savedInvoice.currency || state.defaultCurrency })
      state.payments.push({ d: savedPayment.date, inv: savedInvoice.number, c: clientIndex, m: savedPayment.method || 'Manual', a: Number(savedPayment.amount) })
      historicalInvoiceIds.push(savedInvoice.id)
      lastInvoice = savedInvoice
    }
    const scheduleResponse = await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessProfileId: serviceState.businessProfileId ?? state.numberingBusinessProfileId ?? state.businessProfiles[0]?.id ?? null, clientId, description: serviceState.d, amount: +serviceState.na, frequency: serviceState.f, nextRunAt: serviceState.from, currency: state.defaultCurrency, perpetual: serviceState.durationMode === 'perpetual', occurrenceCount: Number(serviceState.occurrenceCount), autoSend: serviceState.auto, sourceInvoiceId: lastInvoice?.id || null, historicalInvoiceIds }) })
    const savedSchedule = await scheduleResponse.json()
    if (!scheduleResponse.ok) throw new Error(savedSchedule.error || 'Unable to save recurring service')
    state.recurringServices.push({ businessProfileId: savedSchedule.business_profile_id ?? null, id: savedSchedule.id, c: clientIndex, a: +serviceState.na, d: serviceState.d, f: serviceState.f, next: savedSchedule.next_run_at, endAt: savedSchedule.end_at || null, st: 'Active', auto: savedSchedule.auto_send, src: lastInvoice?.number || '' })
    state.sv = null; state.currentRoute = 'invoices'; state.activeInvoiceTab = 'Recurring'
    toast('Recurring service created. Next invoice on ' + formatDate(serviceState.from))
  } catch (error) { toast(error.message) }
}
