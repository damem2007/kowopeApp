import React from 'react';
import { state } from './store.ts';
import { currencySigns } from './catalog.tsx';
export const formatMoney = (amount: any, currency?: string) => {
  const currencyCode = currency || state.invoiceEditor?.currency || state.invoiceEditor?.cur || state.defaultCurrency;
  return (currencySigns[currencyCode] || '$') + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
export const renderPill = (label: any, className: any = undefined) => <span className={`pill ${className || label}`}>{label}</span>;
export const renderDetails = (name: any, address: any = '', email: any = '', phone: any = '') => <div style={{
  "marginTop": "10px",
  "lineHeight": "1.6"
}}><b>{name}</b><div className="mut">{(address || "").split(/\n/).flatMap((line, index) => index ? [<br key={index} />, line] : [line])}</div><div className="mut">{[email, phone].filter(Boolean).join(" · ")}</div></div>;
