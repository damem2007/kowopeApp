import React, { useEffect } from 'react';
import { state } from '../modules/store.ts';
import { formatDate } from '../modules/date.ts';
import { formatMoney } from '../modules/format.tsx';
import { hdr } from '../ui/layout.tsx';
import { render, toast } from '../ui/render.tsx';

const localDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const defaultFilters = () => {
  const today = localDate();
  return { fromDate: `${today.slice(0, 7)}-01`, toDate: today, asOfDate: today, businessProfileId: '', clientId: '', scope: 'account' };
};

const reportFilters = () => state.reportFilters || (state.reportFilters = defaultFilters());

export const loadReceivablesReport = async () => {
  if (state.reportsLoading) return;
  const filters = reportFilters();
  state.reportsLoading = true;
  render();
  try {
    const query = new URLSearchParams({ from: filters.fromDate, to: filters.toDate, asOf: filters.asOfDate, scope: filters.scope });
    if (filters.businessProfileId) query.set('businessProfileId', filters.businessProfileId);
    if (filters.clientId) query.set('clientId', filters.clientId);
    const response = await fetch(`/api/reports/receivables?${query}`);
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 404) throw new Error('The Reports API is unavailable. Restart or redeploy the Kowope API so it loads the current server routes.');
      throw new Error(body.error || 'Unable to load reports.');
    }
    state.receivablesReport = body;
  } catch (error: any) {
    toast(error.message || 'Unable to load reports.', undefined, { error: true, persistent: true });
  } finally {
    state.reportsLoading = false;
    render();
  }
};

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export const exportReceivablesCsv = () => {
  const report = state.receivablesReport;
  if (!report?.invoices?.length) return toast('Run a report with invoice data before exporting.');
  const headers = ['Invoice', 'Issue date', 'Due date', 'Business', 'Client', 'Currency', 'Invoiced', 'Collected as of date', 'Outstanding', 'Status'];
  const rows = report.invoices.map((invoice: any) => [invoice.number, invoice.issue_date || invoice.created_at, invoice.due_date, invoice.business_name, invoice.client_name, invoice.currency, invoice.amount, invoice.collectedToDate, invoice.outstanding, invoice.status]);
  const blob = new Blob([[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `kowope-receivables-${report.filters.asOfDate}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

const currencyAmount = (amount: number, currency: string) => formatMoney(amount, currency);
const agingColumns = ['current', 'days1To30', 'days31To60', 'days61To90', 'daysOver90'] as const;
const agingLabels: Record<(typeof agingColumns)[number], string> = { current: 'Current', days1To30: '1–30', days31To60: '31–60', days61To90: '61–90', daysOver90: '90+' };

export function reports() {
  const filters = reportFilters();
  const report = state.receivablesReport;
  useEffect(() => { if (!state.receivablesReport && !state.reportsLoading) void loadReceivablesReport(); }, []);
  const options = report?.filterOptions || { profiles: state.businessProfiles || [], clients: [] };
  return <>{hdr('Reports', 'Receivables, collections and recurring forecast. Amounts always remain in their transaction currency.', <div className="row"><button className="btn s" type="button" onClick={exportReceivablesCsv}>Export CSV</button><button className="btn" type="button" onClick={() => void loadReceivablesReport()} disabled={state.reportsLoading}>{state.reportsLoading ? 'Loading…' : 'Run report'}</button></div>)}
    <section className="card report-filters">
      <div><label htmlFor="report-from">From</label><input id="report-from" type="date" defaultValue={filters.fromDate} onChange={event => { filters.fromDate = event.currentTarget.value; }} /></div>
      <div><label htmlFor="report-to">To</label><input id="report-to" type="date" defaultValue={filters.toDate} onChange={event => { filters.toDate = event.currentTarget.value; }} /></div>
      <div><label htmlFor="report-as-of">As of</label><input id="report-as-of" type="date" defaultValue={filters.asOfDate} onChange={event => { filters.asOfDate = event.currentTarget.value; }} /></div>
      <div><label htmlFor="report-business">Business</label><select id="report-business" defaultValue={filters.businessProfileId} onChange={event => { filters.businessProfileId = event.currentTarget.value; }}><option value="">All businesses</option>{options.profiles.map((profile: any) => <option key={profile.id} value={profile.id}>{profile.name || profile.n || 'Unnamed business'}</option>)}</select></div>
      <div><label htmlFor="report-client">Client</label><select id="report-client" defaultValue={filters.clientId} onChange={event => { filters.clientId = event.currentTarget.value; }}><option value="">All clients</option>{options.clients.map((client: any) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
      <div><label htmlFor="report-scope">Scope</label><select id="report-scope" defaultValue={filters.scope} onChange={event => { filters.scope = event.currentTarget.value; }}><option value="account">My account & organization</option>{state.authUserRole === 'owner' && <option value="platform">Platform overview</option>}</select></div>
    </section>
    {report?.platform && <div className="grid k4 report-platform"><div className="card kpi"><small>Platform users</small><b>{report.platform.users}</b></div><div className="card kpi"><small>Organizations</small><b>{report.platform.organizations}</b></div><div className="card kpi"><small>Business profiles</small><b>{report.platform.businesses}</b></div><div className="card kpi"><small>Generated</small><b className="report-generated">{new Date(report.generatedAt).toLocaleDateString()}</b></div></div>}
    {!report && !state.reportsLoading && <div className="card mut">No report data is available yet.</div>}
    {report?.currencies?.map((summary: any) => <section className="report-section" key={summary.currency}>
      <h2>{summary.currency} receivables</h2>
      <div className="grid k4"><div className="card kpi"><small>Invoiced in period</small><b>{currencyAmount(summary.invoiced, summary.currency)}</b></div><div className="card kpi"><small>Collected in period</small><b>{currencyAmount(summary.collected, summary.currency)}</b></div><div className="card kpi"><small>Outstanding</small><b>{currencyAmount(summary.outstanding, summary.currency)}</b></div><div className="card kpi"><small>Overdue</small><b>{currencyAmount(summary.overdue, summary.currency)}</b></div></div>
      <div className="grid two report-detail-grid"><div className="card tbw"><h3>Accounts receivable aging</h3><table><thead><tr><th>Client</th>{agingColumns.map(column => <th className="r" key={column}>{agingLabels[column]}</th>)}<th className="r">Total</th></tr></thead><tbody>{summary.clients.length ? summary.clients.map((client: any) => <tr key={client.id}><td>{client.name}</td>{agingColumns.map(column => <td className="r" key={column}>{currencyAmount(client.aging[column], summary.currency)}</td>)}<td className="r"><b>{currencyAmount(client.outstanding, summary.currency)}</b></td></tr>) : <tr><td colSpan={7} className="mut">No open receivables.</td></tr>}</tbody></table></div>
      <div className="card tbw"><h3>Sales & collections</h3><table><thead><tr><th>Month</th><th className="r">Invoiced</th><th className="r">Collected</th></tr></thead><tbody>{summary.monthly.length ? summary.monthly.map((month: any) => <tr key={month.month}><td>{month.month}</td><td className="r">{currencyAmount(month.invoiced, summary.currency)}</td><td className="r">{currencyAmount(month.collected, summary.currency)}</td></tr>) : <tr><td colSpan={3} className="mut">No activity in this period.</td></tr>}</tbody></table></div></div>
    </section>)}
    {report && <div className="grid two report-detail-grid"><div className="card tbw"><h2>Invoice register</h2><table><thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th className="r">Outstanding</th></tr></thead><tbody>{report.invoices.length ? report.invoices.map((invoice: any) => <tr key={invoice.id}><td><b>{invoice.number}</b><br /><span className="mut">{invoice.currency}</span></td><td>{invoice.client_name || '—'}</td><td>{formatDate(invoice.due_date)}</td><td className="r">{currencyAmount(invoice.outstanding, invoice.currency)}</td></tr>) : <tr><td colSpan={4} className="mut">No invoices in this period.</td></tr>}</tbody></table></div>
      <div className="card tbw"><h2>Payment register</h2><table><thead><tr><th>Date</th><th>Invoice</th><th className="r">Amount</th></tr></thead><tbody>{report.payments.length ? report.payments.map((payment: any) => <tr key={payment.id}><td>{formatDate(payment.date)}</td><td>{payment.invoice_number || '—'}<br /><span className="mut">{payment.method}</span></td><td className="r">{currencyAmount(payment.amount, payment.currency)}</td></tr>) : <tr><td colSpan={3} className="mut">No payments in this period.</td></tr>}</tbody></table></div></div>}
    {report && <div className="card tbw report-section"><h2>Recurring forecast</h2><table><thead><tr><th>Client</th><th>Service</th><th>Next run</th><th>Duration</th><th className="r">Amount</th></tr></thead><tbody>{report.recurring.length ? report.recurring.map((schedule: any) => <tr key={schedule.id}><td>{schedule.client_name || '—'}</td><td>{schedule.description}</td><td>{formatDate(schedule.next_run_at)}</td><td>{schedule.end_at ? `Ends ${formatDate(schedule.end_at)}` : 'Perpetual'}</td><td className="r">{currencyAmount(schedule.amount, schedule.currency_code)}</td></tr>) : <tr><td colSpan={5} className="mut">No recurring services are scheduled.</td></tr>}</tbody></table></div>}
    <section className="card report-ledger-note"><h2>Financial statements</h2><p>{report?.accountingFramework?.message || 'No P&L, Balance Sheet, or Cash Flow until Kowope has ledger-grade accounting data.'}</p><span className="mut">Reserved for the future ledger, account mapping, period close, and disclosed exchange-rate framework.</span></section>
  </>;
}
