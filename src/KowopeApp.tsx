import { state } from './modules/store.ts'
import { shell } from './ui/layout.tsx'
import { overview } from './pages/overview.tsx'
import { invoices } from './pages/invoices.tsx'
import { clients } from './pages/clients.tsx'
import { payments } from './pages/payments.tsx'
import { integrations } from './pages/integrations.tsx'
import { settings } from './pages/settings.tsx'
import { editor } from './pages/editor.tsx'
import { prevP } from './pages/preview.tsx'
import { service } from './pages/service.tsx'
import { wizView } from './modals/integrationWizard.tsx'
import { modal } from './modals/index.tsx'
import { login } from './pages/login.tsx'
import { platformUsers } from './pages/platformUsers.tsx'
import { organization } from './pages/organization.tsx'
import { guestEditor } from './pages/guestEditor.tsx'
import { guestPreview } from './pages/guestPreview.tsx'

type LegacyState = Record<string, any>

type AppProps = {
  onDismissToast: () => void
}

const pageComponents = {
  overview,
  invoices,
  clients,
  payments,
  integrations,
  users: platformUsers,
  organization,
  settings,
  new: editor,
  preview: prevP,
  svc: service,
}

/**
 * The React application shell composes the TSX route components while keeping
 * the existing navigation and state behaviour intact.
 */
export function App({ onDismissToast }: AppProps) {
  const appState = state as LegacyState
  const route = appState.currentRoute
  const progress = (
    <div id="api-progress" className="api-progress" role="progressbar" aria-label="Working" hidden={!document.body.classList.contains('api-request-pending')}>
    </div>
  );

  if (route === 'login') {
    const LoginPage = login
    return <>{progress}<LoginPage /></>
  }

  if (route === 'guest-new' || route === 'guest-preview') {
    const GuestPage = route === 'guest-new' ? guestEditor : guestPreview
    return <>{progress}<main className="guest-editor-page"><GuestPage /></main></>
  }

  const Page = pageComponents[route as keyof typeof pageComponents] || overview
  const IntegrationWizard = wizView
  const ActiveModal = modal
  const content = shell(<Page />)
  const wizard = appState.integrationWizard ? <IntegrationWizard /> : null
  const overlay = appState.activeModal ? <ActiveModal /> : null
  const notice = appState.toast && (
    <div className={`toast ${appState.toast.error ? 'toast-error' : 'toast-success'}`} role="alert">
      {appState.toast.m}
      {appState.toast.persistent && <button onClick={onDismissToast} aria-label="Dismiss">×</button>}
      {appState.toast.u && <button onClick={appState.toast.u}>Undo</button>}
    </div>
  )

  return <>{progress}{content}{wizard}{overlay}{notice}</>
}
