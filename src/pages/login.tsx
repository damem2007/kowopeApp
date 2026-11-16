import { useState } from 'react';
import { state } from '../modules/store.ts';
import { closeGuestInfo, loginAccount, openGuestInfo, requestPasswordReset, resetPassword, signupAccount, startGuestInvoice, verifyEmail } from '../actions/auth.ts';
import { logoMarkup } from '../ui/layout.tsx';
import { render } from '../ui/render.tsx';
const buttonStyle = {
  width: '100%',
  marginTop: '18px'
};
const secondaryButtonStyle = {
  width: '100%',
  marginTop: '10px'
};
function returnToSignIn() {
  state.authMode = 'login';
  state.authMessage = '';
  state.authError = '';
  render();
}
function AuthMessage() {
  return state.authMessage ? <div className="auth-message" role="status">{state.authMessage}</div> : null;
}
function PasswordField({
  id,
  autoComplete
}: {
  id: string;
  autoComplete: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  return <>
    <label className="fl" htmlFor={id}>Password</label>
    <div className="password-field">
      <input id={id} type={isVisible ? 'text' : 'password'} autoComplete={autoComplete} placeholder="At least 12 characters" disabled={Boolean(state.authBusy)} />
      <button className="password-toggle" type="button" aria-label={isVisible ? 'Hide password' : 'Show password'} aria-pressed={isVisible} onClick={() => {
        setIsVisible(visible => !visible);
      }}>
        {isVisible ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.8 10.8 0 0 1 12 4c5.4 0 9.2 4.4 10 8-.3 1.3-1 2.7-2.1 4M6.2 6.2C4 7.7 2.6 10.1 2 12c.8 3.6 4.6 8 10 8 1.4 0 2.8-.3 4-.8" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
  </>;
}
function GuestEntry() {
  return <div className="guest-entry">
    <div className="guest-entry-title">Just looking around?</div>
    <p>Try Kowope as a guest, no account needed. Guest mode is limited: your work is not saved and you cannot send email.</p>
    <button className="btn s guest-info-button" type="button" onClick={openGuestInfo}>
      See what guests can and can’t do <span aria-hidden="true">›</span>
    </button>
  </div>;
}
function GuestDesktopPane() {
  return <section className="auth-guest-pane">
    <div className="auth-guest-content">
      <div className="auth-eyebrow">Just looking around?</div>
      <h2>Try Kowope as a guest</h2>
      <p className="auth-guest-description">No account needed. Guest mode is limited, so here is exactly what you get.</p>
      <div className="auth-guest-table">
        <div className="auth-guest-row auth-guest-heading"><span /><b>Guest</b><b>Account</b></div>
        <div className="auth-guest-row"><span>Create invoices and clients</span><strong className="guest-yes">✓</strong><strong className="guest-yes">✓</strong></div>
        <div className="auth-guest-row"><span>Download invoices as PDF</span><strong className="guest-yes">✓</strong><strong className="guest-yes">✓</strong></div>
        <div className="auth-guest-row"><span>Keep your work</span><em>Until you leave</em><strong className="guest-yes">✓</strong></div>
        <div className="auth-guest-row"><span>Send by email</span><strong className="guest-no">×</strong><strong className="guest-yes">✓</strong></div>
        <div className="auth-guest-row"><span>Recurring invoices</span><strong className="guest-no">×</strong><strong className="guest-yes">✓</strong></div>
        <div className="auth-guest-row"><span>Other devices and team</span><strong className="guest-no">×</strong><strong className="guest-yes">✓</strong></div>
      </div>
      <div className="auth-guest-actions">
        <button className="btn s" type="button" onClick={startGuestInvoice}>Continue as guest</button>
        <button className="btn s" type="button" onClick={() => {
          state.authMode = 'signup';
          state.authError = '';
          render();
        }}>Create a free account</button>
      </div>
      <p className="auth-guest-note">By continuing as a guest you agree that your work is cleared when you close the browser.</p>
    </div>
  </section>;
}
function GuestSheet() {
  if (!state.guestInfoOpen) return null;
  return <div className="guest-sheet-layer">
    <button className="guest-sheet-backdrop" aria-label="Close guest mode information" onClick={closeGuestInfo} />
    <section className="guest-sheet" role="dialog" aria-modal="true" aria-label="Guest mode">
      <div className="guest-sheet-handle" aria-hidden="true" />
      <div className="guest-sheet-head">
        <h2>Guest mode</h2>
        <button className="icon-button" type="button" aria-label="Close guest mode information" onClick={closeGuestInfo}>×</button>
      </div>
      <p>A quick way to try Kowope. Here is what to expect.</p>
      <h3>You can</h3>
      <div className="guest-capability good">✓<span>Create invoices and add clients</span></div>
      <div className="guest-capability good">✓<span>Preview and download invoices as PDF</span></div>
      <hr />
      <h3>You can’t</h3>
      <div className="guest-capability bad">×<span><b>Keep your work.</b> Everything is cleared when you close the browser or sign out.</span></div>
      <div className="guest-capability bad">×<span><b>Send by email.</b> Gmail, Outlook and Mailjet are not available.</span></div>
      <div className="guest-capability bad">×<span><b>Repeat invoices.</b> Recurring schedules need an account.</span></div>
      <div className="guest-capability bad">×<span><b>Use other devices or invite a team.</b> Guest data stays on this device.</span></div>
      <button className="btn" type="button" onClick={() => {
        state.authMode = 'signup';
        state.guestInfoOpen = false;
        state.authError = '';
        render();
      }}>Create a free account</button>
      <button className="btn s" type="button" onClick={startGuestInvoice}>I understand, continue as guest</button>
    </section>
  </div>;
}
export function LoginPage() {
  const signupMode = state.authMode === 'signup';
  const resetMode = state.authMode === 'reset';
  const verifyMode = state.authMode === 'verify';
  const forgotMode = state.authMode === 'forgot';
  const signupLabel = state.ownerSetupRequired ? 'Create platform owner' : 'Create user account';
  const signupDescription = state.ownerSetupRequired ? 'Create the first platform owner account for Kowope.' : 'Create an account for this Kowope workspace.';
  if (resetMode) {
    return <div className="auth-page"><div className="card auth-card">
      {logoMarkup()}<h1>Set a new password</h1><p className="mut">Choose a new password for your account.</p><AuthMessage />
      <PasswordField id="auth-new-password" autoComplete="new-password" />
      <div id="auth-error" className="err">{state.authError || ''}</div>
      <button className="btn" style={buttonStyle} onClick={resetPassword} disabled={Boolean(state.authBusy)}>{state.authBusy && <span className="auth-loader" aria-hidden="true" />} {state.authBusy ? 'Working…' : 'Update password'}</button>
      <button className="btn s" style={secondaryButtonStyle} onClick={() => {
          state.resetToken = '';
          history.replaceState({}, '', '/');
          returnToSignIn();
        }} disabled={Boolean(state.authBusy)}>Back to sign in</button>
    </div></div>;
  }
  if (verifyMode) {
    return <div className="auth-page"><div className="card auth-card">
      {logoMarkup()}<h1>Verify your email</h1><p className="mut">Confirm your email address to activate your Kowope account.</p><AuthMessage />
      <div id="auth-error" className="err">{state.authError || ''}</div>
      <button className="btn" style={buttonStyle} onClick={verifyEmail} disabled={Boolean(state.authBusy)}>{state.authBusy ? 'Working…' : 'Verify email'}</button>
      <button className="btn s" style={secondaryButtonStyle} onClick={() => {
          state.verifyToken = '';
          history.replaceState({}, '', '/');
          returnToSignIn();
        }}>Back to sign in</button>
    </div></div>;
  }
  const submit = signupMode ? signupAccount : forgotMode ? requestPasswordReset : loginAccount;
  const submitLabel = state.authBusy ? 'Working…' : signupMode ? 'Create account' : forgotMode ? 'Email reset link' : 'Sign in';
  const authForm = <div className="card auth-card">
    {logoMarkup()}
    <h1>{signupMode ? signupLabel : forgotMode ? 'Forgot password' : 'Sign in'}</h1>
    <p className="mut">{signupMode ? signupDescription : forgotMode ? 'Enter your account email and we will send a reset link.' : 'Sign in to access your workspace.'}</p>
    <AuthMessage />
    <label className="fl" htmlFor="auth-email">Email</label>
    <input id="auth-email" type="email" autoComplete="email" placeholder="Your email" defaultValue={state.authEmail || ''} disabled={Boolean(state.authBusy)} />
    {!forgotMode && <PasswordField id="auth-password" autoComplete={signupMode ? 'new-password' : 'current-password'} />}
    <div id="auth-error" className="err">{state.authError || ''}</div>
    <button className="btn" style={buttonStyle} onClick={submit} disabled={Boolean(state.authBusy)}>{state.authBusy && <span className="auth-loader" aria-hidden="true" />} {submitLabel}</button>
    {!signupMode && !forgotMode ? <button className="btn s" style={secondaryButtonStyle} onClick={() => {
      state.authMode = 'forgot';
      state.authMessage = '';
      state.authError = '';
      render();
    }}>Forgot password?</button> : <button className="btn s" style={secondaryButtonStyle} onClick={returnToSignIn}>Back to sign in</button>}
    {!forgotMode && state.allowSignup && <button className="btn s" style={secondaryButtonStyle} onClick={() => {
      state.authMode = signupMode ? 'login' : 'signup';
      state.authError = '';
      render();
    }} disabled={Boolean(state.authBusy)}>{signupMode ? 'Back to sign in' : signupLabel}</button>}
    {!signupMode && !forgotMode && <GuestEntry />}
  </div>;
  const guestDesktop = !signupMode && !forgotMode && <GuestDesktopPane />;
  return <div className={`auth-page ${guestDesktop ? 'auth-login-page' : ''}`}>
    {guestDesktop ? <><section className="auth-login-pane">{authForm}</section>{guestDesktop}</> : authForm}
    <GuestSheet />
  </div>;
}
export const login = LoginPage;
