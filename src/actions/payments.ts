import { state } from '../modules/store.ts'
import { today} from '../modules/date.ts'
import { querySelector } from '../modules/selectors.ts'
import { render, toast } from '../ui/render.tsx'

export const recPay = async () => {
  const value = querySelector("#pi").value
  if (!value) { state.activeModal = null; return render() }
  const invoice = state.invoices.find(candidate => candidate.id === value)
  try {
    const response = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: value, method: querySelector("#pm").value, date: today, amount: invoice.a }) })
    const payment = await response.json(); 
    if (!response.ok) throw new Error(payment.error || 'Unable to record payment')
    invoice.s = 'Paid';
    state.payments.push({ d: payment.date, inv: value, c: invoice.c, m: payment.method, a: payment.amount }); state.activeModal = null
    toast("Payment recorded. " + value + " is paid")
  } catch (error) { toast(error.message) }
}
