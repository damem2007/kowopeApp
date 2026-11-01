import { state } from '../modules/store.js'
import { businessModal } from './business.js'
import { currencyModal } from './currency.js'
import { pastInvoiceModal } from './pastInvoice.js'
import { changePriceModal, makeRecurringModal } from './recurring.js'
import { newClientModal, clientEditModal } from './client.js'
import { recordPaymentModal } from './payment.js'

export function modal() {
  const m = state.activeModal
  if (m === "clientEdit") return clientEditModal()
  if (m === "biz") return businessModal()
  if (m === "cur") return currencyModal()
  if (m === "past") return pastInvoiceModal()
  if (m === "chg") return changePriceModal()
  if (m === "mkrec") return makeRecurringModal()
  if (m === "client") return newClientModal()
  return recordPaymentModal()
}
