import React from 'react';
import { state } from '../modules/store.ts';
import { today, formatDate } from '../modules/date.ts';
import { formatMoney } from '../modules/format.tsx';
import { calcInvoice } from '../modules/invoiceMath.ts';
import { render } from '../ui/render.tsx';
import { save, downloadPreviewPdf } from '../actions/invoices.ts';
const lines = (value: unknown) => String(value || '').split('\n').map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{line}</React.Fragment>);
export function InvoicePreview() {
  const appState = state as any;
  const invoice: any = appState.invoiceEditor;
  if (!invoice) return <p>No active invoice preview.</p>;
  const business: any = appState.businessProfiles[invoice.businessIndex] || {};
  const client: any = invoice.clientIndex !== '' ? appState.clientDetails[invoice.clientIndex] : null;
  const logo = invoice.logoDataUrl || !invoice.logoRemoved && business.logoDataUrl || '';
  const total = calcInvoice(invoice);
  const due = invoice.dueDate ? formatDate(invoice.dueDate) : 'Not set';
  const number = invoice.invoiceNumber || 'Assigned when saved';
  return <div style={{
    maxWidth: 794,
    margin: '0 auto'
  }}>
    <div className="row b" style={{
      flexWrap: 'wrap',
      marginBottom: 10
    }}>
      <button className="btn s sm" onClick={() => {
        state.currentRoute = 'new';
        render();
        window.scrollTo?.(0, 0);
      }}>← Back to editing</button>
      <div className="row">
        <button className="btn s" onClick={downloadPreviewPdf}>Download PDF</button>
        <button className="btn" onClick={() => save('send')}>Send invoice</button>
      </div>
    </div>
    <p className="mut">This preview has not been sent. A final invoice number is assigned when saved.</p>
    <article className="invoice-document" style={{
      background: '#fff',
      color: '#1b1a24',
      padding: 'clamp(20px,6vw,56px)',
      font: '14px/1.55 Georgia, serif'
    }}>
      <header className="row b" style={{
        paddingBottom: 22,
        borderBottom: '3px double #1b1a24'
      }}>
        <div>{logo && <img src={logo} alt="Invoice logo" style={{
            maxWidth: 140,
            maxHeight: 60,
            objectFit: 'contain'
          }} />}
          <h2>{business.n || 'Your business'}</h2>
          <p>{lines(business.a)}<br />{business.e}<br />{business.p}</p>
        </div>
        <div style={{
          textAlign: 'right'
        }}><h1>INVOICE</h1><p>No. {number}</p></div>
      </header>
      <section className="row b" style={{
        margin: '26px 0',
        alignItems: 'start'
      }}>
        <div><i>Billed to</i><h3>{client ? appState.clientNames[invoice.clientIndex] : 'Client not selected'}</h3>
          {client && <p>{lines(client.a)}<br />{client.e}<br />{client.p}</p>}</div>
        <table><tbody>
          <tr><td>Date of issue</td><td>{formatDate(today)}</td></tr>
          <tr><td>Due date</td><td>{due}</td></tr>
          <tr><td>Currency</td><td>{invoice.currency}</td></tr>
        </tbody></table>
      </section>
      <div className="row b" style={{
        border: '1px solid #1b1a24',
        padding: '12px 16px',
        marginBottom: 24
      }}>
        <span>Amount due by {due}</span><b>{formatMoney(total.total)}</b>
      </div>
      <table style={{
        width: '100%'
      }}><thead><tr><th>No.</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
        {invoice.lineItems.filter((item: any) => item.description || Number(item.unitPrice) > 0).map((item: any, index: number) => <tr key={index}>
          <td>{index + 1}</td><td>{item.description || 'Line item'}</td><td>{item.quantity}</td>
          <td>{formatMoney(item.unitPrice)}</td><td>{formatMoney(Number(item.quantity) * Number(item.unitPrice))}</td>
        </tr>)}
      </tbody></table>
      <div style={{
        marginLeft: 'auto',
        maxWidth: 300,
        marginTop: 14
      }}>
        <div className="row b"><span>Subtotal</span><b>{formatMoney(total.subtotal)}</b></div>
        <div className="row b"><span>Discount</span><b>−{formatMoney(total.discount)}</b></div>
        <div className="row b"><span>{invoice.taxName} {invoice.tax}%</span><b>{formatMoney(total.taxAmount)}</b></div>
        <hr /><div className="row b"><b>Total due</b><b>{formatMoney(total.total)}</b></div>
      </div>
      <section style={{
        marginTop: 32
      }}><b>Payment terms and instructions</b>
        <p style={{
          whiteSpace: 'pre-wrap'
        }}>Payment is due on {due}. {invoice.paymentInstructions || ''}</p>
      </section>
      <footer style={{
        marginTop: 40,
        textAlign: 'center',
        borderTop: '1px solid #cfccd8',
        paddingTop: 14
      }}>
        Thank you for your business.<br />{business.n || 'Your business'} {business.e && ` · ${business.e}`}
      </footer>
    </article>
  </div>;
}
