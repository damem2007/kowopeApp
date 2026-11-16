import { InvoiceNumberingCard } from '../components/InvoiceNumberingCard.tsx';
import React from 'react';
import { state } from '../modules/store.ts';
import { currencySigns, currencyNames } from '../modules/catalog.tsx';
import { renderDetails, renderPill } from '../modules/format.tsx';
import { hdr } from '../ui/layout.tsx';
export const curCard = () => <div className="card"><div className="row b" style={{
    "flexWrap": "wrap"
  }}><div><h2>Currencies</h2><span className="mut">Choose from these on any invoice. The default is pre-selected on new invoices.</span></div><button className="btn s sm" onClick={event => {
      state.activeModal = 'cur';
      render();
    }}>+ Add currency</button></div><div className="tbw"><table><thead><tr><th>ISO code</th><th>Name</th><th>Sign</th><th>Example</th><th /></tr></thead><tbody>{Object.keys(currencySigns).map(currencyCode => <tr key={currencyCode}><td><b>{currencyCode}</b></td><td>{currencyNames[currencyCode] || "—"}</td><td>{currencySigns[currencyCode]}</td><td className="mut">{currencySigns[currencyCode]}1,250.00</td><td className="r">{currencyCode === state.defaultCurrency ? renderPill("Default", "Active") : <><button className="btn s sm" onClick={event => {
              setDefaultCurrency(String(currencyCode));
            }}>Make default</button> <button className="btn s sm" onClick={event => {
              delCur(String(currencyCode));
            }}>Remove</button></>}</td></tr>)}</tbody></table></div></div>;
export const invoiceNumberingCard = () => <InvoiceNumberingCard />;
export function settings() {
  const security = state.authUserRole === 'owner' && state.securitySettings ? state.securitySettings : null;
  const passwordPolicy = security?.password || null;
  const backupSettings = security?.backup || {
    enabled: false,
    recipient_email: '',
    interval_days: 14,
  };
  const accountCard = <section className="card settings-card c4"><h3>Change password</h3><p className="settings-sub">Update the password for your own login.</p><label className="fl">Current password</label><input id="current-password" type="password" autoComplete="current-password" /><label className="fl">New password</label><input id="new-password" type="password" autoComplete="new-password" placeholder="At least 12 characters" /><div className="settings-footer"><button className="btn" onClick={event => {
        changePassword();
      }}>Update password</button></div></section>;
  const policyCard = passwordPolicy ? <section className="card settings-card c4"><h3>Password & reset policy</h3><p className="settings-sub">Applies to every user on the platform.</p><div className="settings-fields two"><label className="fl">Reset link expires (min)<input id="reset-expiry" type="number" min="5" max="1440" defaultValue={passwordPolicy.reset_token_minutes} /></label><label className="fl">Minimum length<input id="password-min-length" type="number" min="8" max="128" defaultValue={passwordPolicy.password_min_length} /></label></div><div className="settings-checks">{[['uppercase', 'an uppercase letter'], ['lowercase', 'a lowercase letter'], ['number', 'a number'], ['symbol', 'a symbol']].map(([key, label]) => <label key={key} className="tg"><input id={`password-${key}`} type="checkbox" defaultChecked={Boolean(passwordPolicy[`require_${key}`] ? 'checked' : '')} /><span>Require {label}</span></label>)}</div><div className="settings-footer"><button className="btn" onClick={event => {
        saveSecuritySettings();
      }}>Save platform policy</button></div></section> : '';
  const userCard = state.authUserRole === 'owner' ? <section className="card settings-card c4"><h3>User management</h3><p className="settings-sub">Allow other people to create their own Kowope login.</p><label className="tg"><input type="checkbox" checked={Boolean(state.allowSignup ? 'checked' : '')} onChange={event => {
        setSignupAllowed(event.currentTarget.checked);
      }} /><span>Enable user account creation</span></label><button className="btn s" onClick={event => {
      go('users');
    }}>Manage platform users</button><button className="btn s" onClick={event => {
      go('organization');
    }}>Manage organization</button></section> : '';
  const backupCard = security ? <section className="card settings-card c12"><div className="settings-head"><div><h3>Scheduled invoice backup</h3><p className="settings-sub">Encrypted ZIP backups are emailed automatically on a schedule.</p></div><label className="tg"><input id="backup-enabled" type="checkbox" defaultChecked={Boolean(backupSettings.enabled)} /><span>Enabled</span></label></div><div className="settings-fields" style={{
      "gridTemplateColumns": "2fr 1fr auto",
      "alignItems": "end"
    }}><label className="fl">Backup email<input id="backup-email" type="email" defaultValue={backupSettings.recipient_email} /></label><label className="fl">Repeat every (days)<input id="backup-interval" type="number" min="1" max="365" defaultValue={backupSettings.interval_days} /></label><button className="btn" onClick={event => {
        saveSecuritySettings();
      }}>Save schedule</button></div></section> : '';
  const backupNowCard = <section className="card settings-card c4"><div className="settings-head"><div><h3>Data backup</h3><p className="settings-sub">Send an encrypted ZIP backup of this business to its business email now.</p></div><button className="btn s sm" onClick={event => {
        runManualBackup();
      }}>Back up now</button></div></section>;
  const businessCards = state.businessProfiles.map((businessProfile, businessIndex) => {
    const nameParts = (businessProfile.n || 'Business').trim().split(/\s+/);
    const initials = nameParts.length > 1 ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}` : nameParts[0].slice(0, 2);
    const addressLines = (businessProfile.a || '').split('\n').map((line, lineIndex) => <span key={lineIndex}>{line}<br /></span>); 
    return <section key={businessProfile.id || businessIndex} className="card settings-card c4"><div className="settings-head"><div className="row"><div className="settings-avatar">{initials.toUpperCase()}</div><div><h3>{businessProfile.n}</h3>{businessIndex === 0 ? renderPill('Default', 'Active') : ''}</div></div><button className="btn s sm" onClick={event => {
          state.businessLogoDraft = undefined;
          state.activeModal = 'biz';
          state.be = businessIndex;
          render();
        }}>Edit</button></div>
        <div className="settings-address">{addressLines}{businessProfile.e || ''}<br />{businessProfile.p || ''}</div>
        <p className="settings-sub" style={{
        "marginTop": "auto"
      }}>Pick any saved business when you create an invoice.</p></section>;
  });
  const accountBand = state.authUserRole === 'owner' ? <><h2>Account & security</h2><span className="pill Active">Owner only</span></> : <h2>Account</h2>;
  const ownerCards = state.authUserRole === 'owner' ? <>{policyCard}<div className="settings-stack">{userCard}{backupNowCard}</div>{backupCard}</> : backupNowCard;
  return <div className="settings-page">{hdr('Settings', 'Your business details, invoice defaults and account controls.', <button className="btn" onClick={event => {
      state.businessLogoDraft = undefined;
      state.activeModal = 'biz';
      state.be = -1;
      render();
    }}>+ Add business</button>)}<div className="settings-band"><h2>Business & invoicing</h2><span className="line" /></div><div className="settings-grid settings-business-grid">{businessCards}<div className="settings-card c8">{invoiceNumberingCard()}</div><div className="settings-card c12">{curCard()}</div></div><div className="settings-band">{accountBand}<span className="line" /></div><div className="settings-grid">{accountCard}{ownerCards}</div></div>;
}
