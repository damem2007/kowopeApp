import test from 'node:test';
import assert from 'node:assert/strict';
import { agingBucket, buildReceivablesReport } from '../server/services/reporting.js';

test('receivables reporting preserves currencies and handles partial payments', () => {
  const report = buildReceivablesReport({
    asOfDate: '2026-11-30', fromDate: '2026-11-01', toDate: '2026-11-30',
    invoices: [
      { id: 'cad', amount: 100, collected_to_date: 25, currency: 'CAD', due_date: '2026-10-15', issue_date: '2026-11-01', client_name: 'A' },
      { id: 'usd', amount: 60, collected_to_date: 0, currency: 'USD', due_date: '2026-12-15', issue_date: '2026-11-02', client_name: 'B' },
    ],
    payments: [{ id: 1, amount: 25, currency: 'CAD', date: '2026-11-05' }],
  });
  assert.equal(report.currencies.length, 2);
  assert.equal(report.currencies.find(summary => summary.currency === 'CAD').outstanding, 75);
  assert.equal(report.currencies.find(summary => summary.currency === 'CAD').collected, 25);
  assert.equal(report.currencies.find(summary => summary.currency === 'USD').outstanding, 60);
  assert.equal(agingBucket('2026-10-15', '2026-11-30'), 'days31To60');
});
