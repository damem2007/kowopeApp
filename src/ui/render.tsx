import React from 'react';
import { createRoot } from 'react-dom/client';
import { state } from '../modules/store.ts';
import { App } from '../KowopeApp.tsx';
type KowopeRootContainer = HTMLElement & {
  __kowopeReactRoot?: ReturnType<typeof createRoot>
};
let browserNavigationReady = false;
let isRestoringBrowserNavigation = false;
let lastRenderedView = '';

const currentView = () => ({
  route: state.currentRoute,
  invoiceTab: state.activeInvoiceTab
});

const viewSignature = () => `${state.currentRoute}:${state.activeInvoiceTab || ''}`;

const historyStateForCurrentView = () => ({
  ...(window.history.state || {}),
  kowopeView: currentView()
});

const resetTransientNavigationState = () => {
  state.searchQuery = '';
  state.openMenuIndex = 0;
  state.invoiceEditor = null;
  state.mobileMenuOpen = false;
};

const syncBrowserHistory = () => {
  if (!browserNavigationReady) return;
  const nextView = viewSignature();
  if (nextView !== lastRenderedView && !isRestoringBrowserNavigation) {
    window.history.pushState(historyStateForCurrentView(), '', window.location.href);
  }
  lastRenderedView = nextView;
};

export const initializeBrowserNavigation = () => {
  if (browserNavigationReady) return;
  browserNavigationReady = true;
  lastRenderedView = viewSignature();
  window.history.replaceState(historyStateForCurrentView(), '', window.location.href);
  window.addEventListener('popstate', event => {
    const previousView = event.state?.kowopeView;
    if (!previousView?.route) return;
    isRestoringBrowserNavigation = true;
    state.currentRoute = previousView.route;
    state.activeInvoiceTab = previousView.invoiceTab || 'All';
    resetTransientNavigationState();
    render();
    isRestoringBrowserNavigation = false;
    window.scrollTo?.(0, 0);
  });
};

export const go = (route: any, invoiceTab: any = undefined) => {
  state.currentRoute = route;
  if (invoiceTab) state.activeInvoiceTab = invoiceTab;
  resetTransientNavigationState();
  render();
  window.scrollTo?.(0, 0);
};
export const toast = (message: any, undo: any = undefined, options: any = {}) => {
  if (state.toast?.persistent && !options.error) return;
  state.toast = {
    m: message,
    u: undo,
    error: Boolean(options.error),
    persistent: Boolean(options.persistent)
  };
  render();
  clearTimeout(state.tt);
  if (!state.toast.persistent) {
    state.tt = setTimeout(() => {
      state.toast = null;
      render();
    }, 8000);
  }
};
export function KowopeApp() {
  return <App onDismissToast={() => {
    state.toast = null;
    render();
  }} />;
}
export function render() {
  const container = document.querySelector('#root') as KowopeRootContainer | null;
  if (!container) throw new Error('Missing #root element.');
  // Keep the root on the DOM container rather than module state. Vite can
  // re-evaluate this module during development while React still owns #root.
  // Reusing the container's root prevents a second createRoot() call.
  if (!container.__kowopeReactRoot) container.__kowopeReactRoot = createRoot(container);
  syncBrowserHistory();
  container.__kowopeReactRoot.render(<KowopeApp />);
}
