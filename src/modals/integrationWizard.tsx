import { state } from '../modules/store.ts'
import { providers } from '../modules/catalog.tsx'
import { integrationSteps, integrationStepLabels } from '../modules/integrationFlows.ts'
import { renderProviderBadge } from '../ui/layout.tsx'

function WizardToggle({ label, checked }: { label: string; checked: boolean }) {
  const toggleId = `integration-toggle-${label.length}`

  return (
    <div className="tg">
      <input type="checkbox" id={toggleId} defaultChecked={checked} />
      <label htmlFor={toggleId}>{label}</label>
    </div>
  )
}

function WizardBody() {
  const wizard = state.integrationWizard
  const step = integrationSteps[wizard.p][wizard.i]
  const providerName = providers[wizard.p][0]
  const savedMailConfig = wizard.mailConfig || {}

  if (step === 'connect' && wizard.p === 'outlook') return <>
    <h2>Connect Microsoft Outlook</h2>
    <p className="mut">Kowope uses Microsoft OAuth2 and Microsoft Graph. You will sign in securely with Microsoft and complete any required 2FA challenge. No Outlook password is entered or stored here.</p>
    <button className="btn" onClick={() => { window.location.href = '/api/integrations/outlook/oauth/start' }}>Continue with Microsoft</button>
    <p className="mut" style={{ fontSize: '12px', marginTop: '12px' }}>Required permission: Mail.Send</p>
  </>

  if (step === 'connect' && wizard.p === 'gmail') return <>
    <h2>Connect Google Gmail</h2>
    <p className="mut">Enter a Gmail App Password. Your normal Google password should never be entered here.</p>
    <label className="fl">Gmail address</label>
    <input id="mail-account" type="email" placeholder="you@gmail.com" autoComplete="email" />
    <label className="fl">Google App Password</label>
    <input id="mail-password" type="password" placeholder="16-character app password" autoComplete="new-password" />
    <p className="mut" style={{ fontSize: '12px' }}>Gmail SMTP: smtp.gmail.com · port 465 · SSL</p>
  </>

  if (step === 'connect' && wizard.p === 'mailjet') return <>
    <h2>Connect Mailjet</h2>
    <p className="mut">Use the API key and secret from your Mailjet account. Credentials are stored by the server and never exposed to the browser after saving.</p>
    <label className="fl">API key</label>
    <input id="mailjet-key" autoComplete="off" />
    <label className="fl">Secret key</label>
    <input id="mailjet-secret" type="password" autoComplete="new-password" />
    <label className="fl">Sender email</label>
    <input id="mailjet-sender" type="email" placeholder="you@example.com" />
    <label className="fl">Sender name</label>
    <input id="mailjet-name" placeholder="Your business" />
  </>

  if (step === 'connect') return <>
    <h2>Connect {providerName}</h2>
    <p className="mut">You will sign in with {providerName}. Kowope asks only for what it needs:</p>
    <p>{wizard.p === 'qb' ? <>
      • Read and write invoices, customers and items<br />
      • Read payments
    </> : <>
      • Send email on your behalf<br />
      • Nothing else. Kowope never reads your inbox.
    </>}</p>
  </>

  if (step === 'keys') return <>
    <h2>Add your Stripe key</h2>
    <p className="mut">Find it in Stripe under Developers, API keys. It is stored encrypted and never shown again.</p>
    <label className="fl">Secret key</label>
    <input id="key" placeholder="sk_test_…" autoComplete="off" />
    {wizard.err ? <div className="err">{wizard.err}</div> : null}
  </>

  if (step === 'mail') {
    const businessName = state.businessProfiles[0]?.n || 'Your business'
    const emailTokens = ['{{invoice_number}}', '{{business_name}}', '{{client}}', '{{amount}}', '{{due_date}}']
    return <>
      <h2>Email template</h2>
      <p className="mut">Customize the subject and message used when sending invoices from this provider. You can return here anytime from Configure.</p>
      <label className="fl">Subject</label>
      <input id="mail-subject" defaultValue={savedMailConfig.subject || '{{invoice_number}} from {{business_name}}'} placeholder="{{invoice_number}} from {{business_name}}" />
      <div className="token-list" aria-label="Insert subject or message field">
        {emailTokens.map(token => <button key={token} type="button" className="token" onMouseDown={event => { event.preventDefault() }} onClick={() => { insertEmailToken(String(token)) }}>{token}</button>)}
      </div>
      <label className="fl">From name</label>
      <input id="mail-from-name" defaultValue={savedMailConfig.fromName || businessName} placeholder="Your business" />
      <label className="fl">Message</label>
      <textarea id="mail-message" style={{ minHeight: '110px' }} placeholder="Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}." defaultValue={savedMailConfig.message || 'Hi {{client}}, invoice {{invoice_number}} for {{amount}} is due {{due_date}}.'} />
      <div className="tg">
        <input type="checkbox" id="mail-attach-pdf" defaultChecked={savedMailConfig.attachPdf !== 0} />
        <label htmlFor="mail-attach-pdf">Attach the invoice as a PDF</label>
      </div>
      <div className="tg">
        <input type="checkbox" id="mail-bcc-copy" defaultChecked={Boolean(savedMailConfig.bccCopy)} />
        <label htmlFor="mail-bcc-copy">Send me a copy (BCC)</label>
      </div>
      <div className="tg">
        <input type="checkbox" id="mail-reminders" defaultChecked={Boolean(savedMailConfig.reminderEnabled)} />
        <label htmlFor="mail-reminders">Remind clients 3 days before and after the due date</label>
      </div>
    </>
  }

  if (step === 'pay') return <>
    <h2>Payment links</h2>
    <WizardToggle label="Add a pay-online link to every invoice" checked />
    <label className="fl">Webhook endpoint. Paste this in Stripe so paid invoices update automatically.</label>
    <code>https://app.kowope.example/api/webhooks/stripe</code>
  </>

  if (step === 'map') return <>
    <h2>Choose what to sync</h2>
    <label className="fl">Direction</label>
    <select>
      <option>Push invoices, pull payments</option>
      <option>Push invoices only</option>
      <option>Pull payments only</option>
    </select>
    <WizardToggle label="Match clients by email" checked />
    <WizardToggle label="Map line items to QuickBooks products" checked />
    <WizardToggle label="Map tax names to tax codes" checked />
  </>

  if (step === 'test' || step === 'sync') return <>
    <h2>{step === 'sync' ? 'Run your first sync' : 'Send a test'}</h2>
    <p className="mut">{step === 'sync' ? 'We will push 4 invoices and check for payments.' : wizard.p === 'stripe' ? 'We will create a test payment link and confirm Stripe replies.' : 'We will email a sample invoice to yourself.'}</p>
  </>

  return <div style={{ textAlign: 'center', padding: '30px 0' }}>
    <div className="ib" style={{ background: 'var(--ok)', margin: '0 auto 14px', width: '56px', height: '56px', fontSize: '26px' }}>✓</div>
    <h2>{providerName} is ready</h2>
    <p className="mut">{wizard.p === 'qb' ? '4 invoices synced.' : wizard.p === 'stripe' ? 'Invoices will now include a pay-online link.' : 'Create & send now uses this account.'}</p>
  </div>
}

export function wizView() {
  const wizard = state.integrationWizard
  const steps = integrationSteps[wizard.p]
  const step = steps[wizard.i]
  const buttonLabel = {
    connect: `Continue with ${providers[wizard.p][0]}`,
    keys: 'Verify key',
    test: 'Send test',
    sync: 'Run sync',
    done: 'Finish',
  }[step] || 'Continue'

  return <div className="ov">
    <div className="dr" role="dialog" aria-label={`Set up ${providers[wizard.p][0]}`}>
      <div className="row">
        {renderProviderBadge(wizard.p)}
        <div>
          <b>{providers[wizard.p][0]}</b>
          <div className="mut" style={{ fontSize: '13px' }}>Step {wizard.i + 1} of {steps.length}: {integrationStepLabels[step]}</div>
        </div>
      </div>
      <div className="stp">{steps.map((unusedStep, stepIndex) => <div key={stepIndex} className={stepIndex <= wizard.i ? 'a' : ''} />)}</div>
      <div style={{ flex: '1', marginTop: '14px' }}><WizardBody /></div>
      <div className="row b" style={{ marginTop: '20px' }}>
        <button className="btn s" onClick={() => { state.integrationWizard = null; render() }}>Cancel</button>
        <button className="btn s" disabled={Boolean(wizard.i && step !== 'done' ? '' : 'disabled')} onClick={() => { state.integrationWizard.i--; render() }}>Back</button>
        <button className="btn" disabled={Boolean(wizard.busy ? 'disabled' : '')} onClick={() => { wnext() }}>{wizard.busy ? <><span className="spin" />Working…</> : buttonLabel}</button>
      </div>
    </div>
  </div>
}
