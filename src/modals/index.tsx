import { state } from '../modules/store.ts';
import { businessModal } from './business.tsx';
import { currencyModal } from './currency.tsx';
import { pastInvoiceModal } from './pastInvoice.tsx';
import { changePriceModal, makeRecurringModal } from './recurring.tsx';
import { newClientModal, clientEditModal } from './client.tsx';
import { recordPaymentModal } from './payment.tsx';
import { createOrganizationModal } from './organization.tsx';
export function modal() {
  const activeModal = state.activeModal;
  if (activeModal === "clientEdit") return clientEditModal();
  if (activeModal === "biz") return businessModal();
  if (activeModal === "cur") return currencyModal();
  if (activeModal === "past") return pastInvoiceModal();
  if (activeModal === "chg") return changePriceModal();
  if (activeModal === "mkrec") return makeRecurringModal();
  if (activeModal === "client") return newClientModal();
  if (activeModal === "organization") return createOrganizationModal();
  return recordPaymentModal();
}
