import { today, stepFrequency } from './date.js'

export const nextOn = (invoice, frequency) => { const baseDate = invoice.iss || invoice.due; let occurrenceIndex = 1; while (stepFrequency(baseDate, frequency, occurrenceIndex) <= today) occurrenceIndex++; return stepFrequency(baseDate, frequency, occurrenceIndex) }
export const hdates = serviceState => serviceState.hist ? [...Array(serviceState.n).keys()].map(invoiceOffset => stepFrequency(serviceState.start, serviceState.f, invoiceOffset)) : []
export const svFrom = serviceState => { let occurrenceIndex = serviceState.hist ? serviceState.n : 0; const baseDate = serviceState.hist ? serviceState.start : today; while (stepFrequency(baseDate, serviceState.f, occurrenceIndex) < today) occurrenceIndex++; return stepFrequency(baseDate, serviceState.f, occurrenceIndex) }
