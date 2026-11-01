import { state } from '../modules/store.js'
import { today, formatDate, addDays, addMonths, stepFrequency } from '../modules/date.js'
import { $ } from '../modules/selectors.js'
import { formatMoney } from '../modules/format.js'
import { isMail } from '../modules/selectors.js'
import { hdates, svFrom } from '../modules/recurrence.js'
import { render, toast } from '../ui/render.js'

export const runRec = async recurringIndex => {
  const recurringService = state.recurringServices[recurringIndex]
  if (recurringService.chg && recurringService.chg.from <= recurringService.next) { recurringService.prev = recurringService.a; recurringService.a = recurringService.chg.a; recurringService.chg = null }
  try {
    const response = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: state.clientIds[recurringService.c], description: recurringService.d || 'Recurring service', amount: recurringService.a, dueDate: addDays(today, 30), currency: recurringService.cur || state.defaultCurrency, paymentInstructions: recurringService.n || '', lineItems: [{ description: recurringService.d || 'Recurring service', quantity: 1, unitPrice: recurringService.a }] }) })
    const savedInvoice = await response.json()
    if (!response.ok) throw new Error(savedInvoice.error || 'Unable to create recurring invoice')
    recurringService.next = stepFrequency(recurringService.next, recurringService.f, 1)
    if (recurringService.id) await fetch(`/api/recurring/${recurringService.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextRunAt: recurringService.next }) })
    state.invoices.push({ id: savedInvoice.number, c: recurringService.c, a: Number(savedInvoice.amount), due: savedInvoice.due_date || '', s: savedInvoice.status || 'Draft', rec: 1, cur: savedInvoice.currency || 'USD', n: savedInvoice.payment_instructions || '' })
    toast(savedInvoice.number + " created from schedule")
  } catch (error) { toast(error.message) }
}

export const mrs = () => { const frequency = $("#mf").value, nextDate = $("#mrd").value; $("#mrp").textContent = nextDate ? "Next 3 invoices: " + [0, 1, 2].map(offset => formatDate(stepFrequency(nextDate, frequency, offset))).join(", ") : "" }

export const saveRec = async () => {
  const sourceInvoice = state.invoices.find(invoice => invoice.id === state.mr), frequency = $("#mf").value, nextDate = $("#mrd").value, showError = message => ($("#mre").textContent = message)
  if (!nextDate) return showError("Pick the date of the first new invoice.")
  if (nextDate <= today) return showError("Choose a date after today.")
  try {
    const sourceResponse = await fetch(`/api/invoices/${encodeURIComponent(sourceInvoice.id)}`)
    const sourceDetails = await sourceResponse.json()
    if (!sourceResponse.ok) throw new Error(sourceDetails.error || 'Unable to load source invoice')
    const response = await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: state.clientIds[sourceInvoice.c], description: sourceInvoice.d || sourceDetails.description || 'Recurring service', amount: +$("#ma").value || sourceInvoice.a, frequency, nextRunAt: nextDate, currency: sourceInvoice.cur || state.defaultCurrency, autoSend: $("#mau").checked ? 1 : 0, sourceInvoiceId: sourceDetails.id }) })
    const savedSchedule = await response.json()
    if (!response.ok) throw new Error(savedSchedule.error || 'Unable to create recurring schedule')
    state.recurringServices.push({ id: savedSchedule.id, c: sourceInvoice.c, a: Number(savedSchedule.amount || $("#ma").value || sourceInvoice.a), d: sourceInvoice.d || 'Recurring service', f: frequency, next: nextDate, st: 'Active', auto: savedSchedule.auto_send, src: sourceInvoice.id })
    sourceInvoice.rec = 1; state.activeModal = null
    toast("Recurring schedule created. Next invoice on " + formatDate(nextDate))
  } catch (error) { toast(error.message) }
}

export const saveChg = async () => {
  const recurringService = state.recurringServices[state.cr], newAmount = +$("#ca2").value, effectiveDate = $("#cf").value, showError = message => ($("#ce2").textContent = message)
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
  const nextStatus = recurringService.st === 'Active' ? 'paused' : 'active'
  const response = await fetch(`/api/recurring/${recurringService.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
  const savedSchedule = await response.json()
  if (!response.ok) return toast(savedSchedule.error || 'Unable to update recurring schedule')
  recurringService.st = nextStatus === 'active' ? 'Active' : 'Paused'
  toast(`Recurring schedule ${recurringService.st.toLowerCase()}`)
}

export const svNew = c => { state.sv = { c: c === undefined ? "" : c, d: "", f: "Monthly", hist: 1, n: 3, a: 550, start: addMonths(today, -3), na: 660, from: "", auto: 0, note: 0, s: 0, err: "" }; state.currentRoute = "svc"; render(); scrollTo(0, 0) }

export const svNext = () => {
  const serviceState = state.sv, historicalDates = hdates(serviceState); serviceState.err = ""
  if (serviceState.s === 0 && (serviceState.c === "" || !serviceState.d.trim())) serviceState.err = "Choose a client and describe the service."
  else if (serviceState.s === 1 && serviceState.hist) { if (!(serviceState.n >= 1 && serviceState.n <= 36) || !(serviceState.a > 0) || !serviceState.start) serviceState.err = "Enter how many invoices, the amount each and the first invoice date."; else if (historicalDates[historicalDates.length - 1] > today) serviceState.err = "Past invoices cannot be dated in the future." }
  else if (serviceState.s === 2) { if (!(serviceState.na > 0)) serviceState.err = "Enter the price for new invoices."; else if (!serviceState.from || serviceState.from < today || (serviceState.hist && serviceState.from <= historicalDates[historicalDates.length - 1])) serviceState.err = "The first new invoice must be today or later, and after your last past invoice." }
  if (serviceState.err) return render()
  if (serviceState.s === 3) return svSave()
  serviceState.s++; if (serviceState.s === 2) serviceState.from = svFrom(serviceState); render()
}

export const svSave = async () => {
  const serviceState = state.sv, clientIndex = +serviceState.c, clientId = state.clientIds[clientIndex]
  try {
    let lastInvoice
    for (const issueDate of hdates(serviceState)) {
      const invoiceResponse = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, description: serviceState.d, amount: +serviceState.a, dueDate: issueDate, issueDate, isPast: true, currency: state.defaultCurrency, lineItems: [{ description: serviceState.d, quantity: 1, unitPrice: +serviceState.a }] }) })
      const savedInvoice = await invoiceResponse.json()
      if (!invoiceResponse.ok) throw new Error(savedInvoice.error || 'Unable to save historical invoice')
      const paymentResponse = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: savedInvoice.number, method: 'Manual', date: issueDate, amount: +serviceState.a }) })
      const savedPayment = await paymentResponse.json()
      if (!paymentResponse.ok) throw new Error(savedPayment.error || 'Unable to save historical payment')
      state.invoices.unshift({ id: savedInvoice.number, c: clientIndex, a: Number(savedInvoice.amount), iss: issueDate, due: issueDate, s: 'Paid', old: 1, d: serviceState.d, cur: savedInvoice.currency || state.defaultCurrency })
      state.payments.push({ d: savedPayment.date, inv: savedInvoice.number, c: clientIndex, m: savedPayment.method || 'Manual', a: Number(savedPayment.amount) })
      lastInvoice = savedInvoice
    }
    const scheduleResponse = await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, description: serviceState.d, amount: +serviceState.na, frequency: serviceState.f, nextRunAt: serviceState.from, currency: state.defaultCurrency, autoSend: serviceState.auto, sourceInvoiceId: lastInvoice?.id || null }) })
    const savedSchedule = await scheduleResponse.json()
    if (!scheduleResponse.ok) throw new Error(savedSchedule.error || 'Unable to save recurring service')
    state.recurringServices.push({ id: savedSchedule.id, c: clientIndex, a: +serviceState.na, d: serviceState.d, f: serviceState.f, next: savedSchedule.next_run_at, st: 'Active', auto: savedSchedule.auto_send, src: lastInvoice?.number || '' })
    state.sv = null; state.currentRoute = 'invoices'; state.activeInvoiceTab = 'Recurring'
    toast('Recurring service created. Next invoice on ' + formatDate(serviceState.from))
  } catch (error) { toast(error.message) }
}
