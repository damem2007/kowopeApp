import React from 'react';
import { state } from '../modules/store.ts';
import { addDays, today } from '../modules/date.ts';
import { calcInvoice, recurringSummary } from '../modules/invoiceMath.ts';
import { render } from '../ui/render.tsx';
import { InvoiceEditor } from '../components/InvoiceEditor.tsx';
export function sample() {
  return {
    invoiceId: null,
    invoiceNumber: '',
    businessIndex: 0,
    paymentInstructions: '',
    clientIndex: '',
    lineItems: [{
      description: '',
      quantity: 1,
      unitPrice: 0
    }],
    tax: 0,
    taxName: 'Tax',
    discountValue: 0,
    discountType: '%',
    dueDate: addDays(today, 30),
    duePreset: 30,
    currency: state.defaultCurrency,
    isRecurring: 0,
    frequency: 'Monthly',
    recurrenceEnd: 'Never',
    autoSend: 0,
    logoDataUrl: '',
    logoRemoved: false,
    errors: []
  };
}
export const calc = () => calcInvoice(state.invoiceEditor);
export const repSum = () => recurringSummary(state.invoiceEditor);
export const upd = () => render();
export const editor = () => <InvoiceEditor />;
