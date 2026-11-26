const number = value => Number(value || 0);

const dateOnly = value => String(value || '').slice(0, 10);

const daysBetween = (from, to) => {
  const fromTime = Date.parse(`${dateOnly(from)}T00:00:00Z`);
  const toTime = Date.parse(`${dateOnly(to)}T00:00:00Z`);
  return Number.isFinite(fromTime) && Number.isFinite(toTime)
    ? Math.max(0, Math.floor((toTime - fromTime) / 86_400_000))
    : 0;
};

export const emptyAging = () => ({ current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0 });

export const agingBucket = (dueDate, asOfDate) => {
  if (!dueDate || dateOnly(dueDate) >= dateOnly(asOfDate)) return 'current';
  const daysOverdue = daysBetween(dueDate, asOfDate);
  if (daysOverdue <= 30) return 'days1To30';
  if (daysOverdue <= 60) return 'days31To60';
  if (daysOverdue <= 90) return 'days61To90';
  return 'daysOver90';
};

const inPeriod = (date, from, to) => {
  const day = dateOnly(date);
  return (!from || day >= from) && (!to || day <= to);
};

const currencySummary = currency => ({
  currency,
  invoiced: 0,
  collected: 0,
  outstanding: 0,
  overdue: 0,
  invoiceCount: 0,
  openInvoiceCount: 0,
  aging: emptyAging(),
  clients: new Map(),
  monthly: new Map(),
});

/**
 * Keeps monetary amounts in their original currency. This deliberately does
 * not convert or combine currencies: exchange rates are not ledger data.
 */
export const buildReceivablesReport = ({ invoices = [], payments = [], asOfDate, fromDate, toDate }) => {
  const summaries = new Map();
  const getSummary = currency => {
    const code = currency || 'USD';
    if (!summaries.has(code)) summaries.set(code, currencySummary(code));
    return summaries.get(code);
  };

  const reportInvoices = invoices.map(invoice => {
    const amount = number(invoice.amount);
    const collectedToDate = number(invoice.collected_to_date);
    const outstanding = Math.max(0, amount - collectedToDate);
    const currency = invoice.currency || 'USD';
    const summary = getSummary(currency);
    const reportInvoice = { ...invoice, amount, collectedToDate, outstanding, currency };
    summary.invoiceCount += 1;
    summary.outstanding += outstanding;
    if (outstanding > 0) {
      summary.openInvoiceCount += 1;
      const bucket = agingBucket(invoice.due_date, asOfDate);
      summary.aging[bucket] += outstanding;
      if (bucket !== 'current') summary.overdue += outstanding;
      const clientId = invoice.client_id || 'unassigned';
      if (!summary.clients.has(clientId)) {
        summary.clients.set(clientId, { id: clientId, name: invoice.client_name || 'Unassigned client', outstanding: 0, aging: emptyAging() });
      }
      const client = summary.clients.get(clientId);
      client.outstanding += outstanding;
      client.aging[bucket] += outstanding;
    }
    if (inPeriod(invoice.issue_date || invoice.created_at, fromDate, toDate)) {
      summary.invoiced += amount;
      const month = dateOnly(invoice.issue_date || invoice.created_at).slice(0, 7);
      if (month) {
        if (!summary.monthly.has(month)) summary.monthly.set(month, { month, invoiced: 0, collected: 0 });
        summary.monthly.get(month).invoiced += amount;
      }
    }
    return reportInvoice;
  });

  const reportPayments = payments.filter(payment => inPeriod(payment.date, fromDate, toDate)).map(payment => {
    const amount = number(payment.amount);
    const currency = payment.currency || 'USD';
    const summary = getSummary(currency);
    summary.collected += amount;
    const month = dateOnly(payment.date).slice(0, 7);
    if (month) {
      if (!summary.monthly.has(month)) summary.monthly.set(month, { month, invoiced: 0, collected: 0 });
      summary.monthly.get(month).collected += amount;
    }
    return { ...payment, amount, currency };
  });

  return {
    currencies: [...summaries.values()].map(summary => ({
      ...summary,
      clients: [...summary.clients.values()].sort((left, right) => right.outstanding - left.outstanding),
      monthly: [...summary.monthly.values()].sort((left, right) => left.month.localeCompare(right.month)),
    })).sort((left, right) => left.currency.localeCompare(right.currency)),
    invoices: reportInvoices.filter(invoice => inPeriod(invoice.issue_date || invoice.created_at, fromDate, toDate)),
    payments: reportPayments.sort((left, right) => dateOnly(right.date).localeCompare(dateOnly(left.date))),
  };
};
