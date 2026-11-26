import React from 'react';
import { state } from '../modules/store.ts';
import { formatDate, today } from '../modules/date.ts';
import { currencySigns } from '../modules/catalog.tsx';
import { guestDownload, promptGuestLogin } from '../actions/auth.ts';
import { render } from '../ui/render.tsx';
const escapeHtml = value => String(value ?? ''); // React escapes rendered text and attributes automatically.
const guestMoney = (amount, currencyCode) => {
  const customCurrency = (state.guestCurrencies || []).find(currency => currency.code === currencyCode);
  const symbol = customCurrency?.symbol || currencySigns[currencyCode] || '$';
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};
export const guestPreview = () => {
  const invoice = state.guestInvoice;
  const subtotal = invoice.items.reduce((sum, item) => sum + (+item.q || 0) * (+item.p || 0), 0);
  const discount = invoice.dt === '%' ? subtotal * (+invoice.dv || 0) / 100 : +invoice.dv || 0;
  const tax = (subtotal - discount) * (+invoice.tax || 0) / 100;
  const total = subtotal - discount + tax;
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : 'Not set';
  const currency = invoice.currency;
  const businessAddress = escapeHtml(invoice.businessAddress).split(/\n/).join(" · ");
  const clientAddress = escapeHtml(invoice.clientAddress).split(/\n/).join(" · ");
  const notes = escapeHtml(invoice.notes || `Payment is due on ${dueDate}. Please quote invoice number GUEST-INVOICE with your payment.`).split(/\n/).join(" · ");
  const lineItems = invoice.items.filter(item => item.d || item.p > 0).map((item, itemIndex) => <tr key={itemIndex}><td>{escapeHtml(item.d || '—')}</td><td style={{
      "textAlign": "right"
    }}>{escapeHtml(item.q)}</td><td style={{
      "textAlign": "right"
    }}>{guestMoney(item.p, currency)}</td><td style={{
      "textAlign": "right"
    }}>{guestMoney(item.q * item.p, currency)}</td></tr>) || <tr><td colSpan={4}>No line items yet</td></tr>;
  return <div style={{
    "maxWidth": "794px",
    "margin": "0 auto"
  }}><div className="row b" style={{
      "marginBottom": "10px"
    }}><button className="btn s sm" onClick={event => {
        state.currentRoute = 'guest-new';
        render();
      }}>← Back to editing</button><div className="row"><button className="btn s" onClick={event => {
          guestDownload();
        }}>Download PDF</button><button className="btn" onClick={event => {
          promptGuestLogin();
        }}>Send invoice 🔒</button></div></div><p className="mut">This is exactly what your client will receive. Nothing has been sent yet.</p><article className="guest-document" style={{
      "background": "#fff",
      "color": "#1b1a24",
      "padding": "clamp(20px,6vw,56px)",
      "font": "14px/1.55 Georgia,serif"
    }}><header style={{
        "display": "flex",
        "justifyContent": "space-between",
        "gap": "24px",
        "flexWrap": "wrap",
        "paddingBottom": "22px",
        "borderBottom": "3px double #1b1a24"
      }}><div>{invoice.logoDataUrl ? <img src={escapeHtml(invoice.logoDataUrl)} alt="Company logo" style={{
            "maxWidth": "140px",
            "maxHeight": "60px",
            "objectFit": "contain"
          }} /> : ''}<b style={{
            "display": "block",
            "fontSize": "24px"
          }}>{escapeHtml(invoice.businessName || 'Your business')}</b><div style={{
            "marginTop": "6px"
          }}>{businessAddress}<br />{escapeHtml(invoice.businessEmail)}<br />{escapeHtml(invoice.businessPhone)}</div></div><div style={{
          "textAlign": "right"
        }}><b style={{
            "fontSize": "30px",
            "letterSpacing": ".16em"
          }}>INVOICE</b><div>No. GUEST-INVOICE</div></div></header><section style={{
        "display": "flex",
        "justifyContent": "space-between",
        "gap": "24px",
        "flexWrap": "wrap",
        "margin": "26px 0"
      }}><div><i>Billed to</i><div style={{
            "fontWeight": "700",
            "fontSize": "17px"
          }}>{escapeHtml(invoice.clientName || 'Client not selected')}</div><div>{clientAddress}<br />{escapeHtml(invoice.clientEmail)}<br />{escapeHtml(invoice.clientPhone)}</div></div><div>Invoice number: GUEST-INVOICE<br />Date of issue: {formatDate(today)}<br />Payment due: {dueDate}<br />Currency: {escapeHtml(currency)}</div></section><div style={{
        "border": "1px solid #1b1a24",
        "padding": "12px 16px",
        "marginBottom": "26px",
        "display": "flex",
        "justifyContent": "space-between"
      }}><span>Amount due by {dueDate}</span><b>{guestMoney(total, currency)} {escapeHtml(currency)}</b></div><table style={{
        "width": "100%"
      }}><tr><th style={{
            "textAlign": "left"
          }}>Description</th><th style={{
            "textAlign": "right"
          }}>Qty</th><th style={{
            "textAlign": "right"
          }}>Unit price</th><th style={{
            "textAlign": "right"
          }}>Amount</th></tr>{lineItems}</table><div style={{
        "marginLeft": "auto",
        "maxWidth": "300px",
        "marginTop": "14px"
      }}>Subtotal {guestMoney(subtotal, currency)}<br />Discount −{guestMoney(discount, currency)}<br />{escapeHtml(invoice.tn)} {escapeHtml(invoice.tax)}% {guestMoney(tax, currency)}<hr /><b>Total due {guestMoney(total, currency)}</b></div><section style={{
        "marginTop": "32px"
      }}><b>Payment terms and instructions</b><p>{notes}</p></section></article></div>;
};
