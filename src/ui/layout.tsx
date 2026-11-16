import React from 'react';
import { state } from '../modules/store.ts';
import { providers, icons } from '../modules/catalog.tsx';
import { invoiceStatus } from '../modules/selectors.ts';
const navigation = [{
  route: 'overview',
  label: 'Overview',
  primary: true
}, {
  route: 'invoices',
  label: 'Invoices',
  primary: true
}, {
  route: 'clients',
  label: 'Clients',
  primary: true
}, {
  route: 'payments',
  label: 'Payments',
  primary: true
}, {
  route: 'integrations',
  label: 'Integrations',
  primary: true
}, {
  route: 'users',
  label: 'Users',
  ownerOnly: true
}, {
  route: 'organization',
  label: 'Organization'
}, {
  route: 'settings',
  label: 'Settings'
}];
const visibleNavigation = () => navigation.filter(item => !item.ownerOnly || state.authUserRole === 'owner');
const navigationLink = (item, overdueCount) => <a key={item.route} className={state.currentRoute === item.route ? 'on' : ''} onClick={event => {
  go(String(item.route));
}} tabIndex={0} onKeyDown={event => {
  if (event.key === 'Enter') go(String(item.route));
}} aria-current={state.currentRoute === item.route ? 'page' : 'false'}><svg viewBox="0 0 24 24">{icons[item.route]}</svg><span>{item.label}</span>{item.route === 'invoices' && overdueCount ? <span className="bd">{overdueCount}</span> : ''}</a>;
export const toggleTheme = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  window.render?.();
};
export const setTheme = theme => {
  document.documentElement.dataset.theme = theme;
  window.render?.();
};
const activeTheme = () => document.documentElement.dataset.theme || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export const toggleMobileMenu = () => {
  state.mobileMenuOpen = !state.mobileMenuOpen;
  window.render();
  if (state.mobileMenuOpen) requestAnimationFrame(() => document.querySelector('.mobile-drawer [data-drawer-focus]')?.focus());
};
export const closeMobileMenu = () => {
  if (state.mobileMenuOpen) {
    state.mobileMenuOpen = false;
    window.render();
  }
};
export const handleMobileMenuKeydown = event => {
  if (!state.mobileMenuOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMobileMenu();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('.mobile-drawer button, .mobile-drawer a')].filter(element => !(element instanceof HTMLButtonElement && element.disabled));
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
export const logoMarkup = () => <div className="logo"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M7 4h13l-4 16H3z" /><path d="M9 7h7l-3 10H6z" /></svg></i><span>Kowope</span></div>;
const themeIcon = () => document.documentElement.dataset.theme === 'dark' ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" /></svg>;
const drawerRow = item => <button className="drawer-row" type="button" onClick={event => {
  go(String(item.route));
}}><span className="drawer-row-icon"><svg viewBox="0 0 24 24">{icons[item.route]}</svg></span><span>{item.label}</span><span className="drawer-chevron" aria-hidden="true">›</span></button>;
const mobileMenuMarkup = () => {
  if (!state.mobileMenuOpen) return '';
  const menuItems = visibleNavigation().filter(item => !item.primary);
  const organization = menuItems.find(item => item.route === 'organization');
  const users = menuItems.find(item => item.route === 'users');
  const settings = menuItems.find(item => item.route === 'settings');
  const businessName = state.businessProfiles?.[0]?.n?.trim();
  const displayName = businessName || state.authUserName || (state.authEmail ? state.authEmail.split('@')[0] : 'Your account');
  const displayEmail = state.authEmail || 'Account details';
  const theme = activeTheme();
  return <><div className="mobile-menu-backdrop" onClick={event => {
      closeMobileMenu();
    }} aria-hidden="true" /><section className="mobile-drawer" role="dialog" aria-modal="true" aria-label="More navigation" onKeyDown={event => {
      handleMobileMenuKeydown(event);
    }}><div className="mobile-drawer-handle" aria-hidden="true" /><div className="mobile-drawer-profile"><div className="drawer-avatar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></svg></div><div className="drawer-profile-text"><b>{displayName}</b><span>{displayEmail}</span></div><button className="icon-button" type="button" onClick={event => {
          closeMobileMenu();
        }} aria-label="Close menu" data-drawer-focus>×</button></div><h3 className="drawer-section-label">Workspace</h3><div className="drawer-group">{organization ? drawerRow(organization) : ''}{users ? drawerRow(users) : ''}{settings ? drawerRow(settings) : ''}</div><h3 className="drawer-section-label">Preferences</h3><div className="drawer-group"><div className="drawer-appearance"><b>Appearance</b><div className="appearance-switch"><button type="button" onClick={event => {
              setTheme('light');
            }} className={theme === 'light' ? 'selected' : ''}>Light</button><button type="button" onClick={event => {
              setTheme('dark');
            }} className={theme === 'dark' ? 'selected' : ''}>Dark</button></div></div><button className="drawer-row" type="button" onClick={event => {
          closeMobileMenu();
          toast('Help and support is coming soon.');
        }}><span className="drawer-row-icon">?</span><span>Help and support</span><span className="drawer-chevron" aria-hidden="true">›</span></button></div><div className="mobile-drawer-actions"><button className="ghost danger-action" type="button" onClick={event => {
          logoutAccount();
        }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg> Sign out</button></div></section></>;
};
export function shell(pageContent) {
  const overdueCount = state.invoices.filter(invoice => invoiceStatus(invoice) === 'Overdue').length;
  const items = visibleNavigation();
  const primaryItems = items.filter(item => item.primary);
  const mobileHeader = <header className="mobile-header">{logoMarkup()}<div className="mobile-header-actions"><button className="icon-button" type="button" onClick={event => {
        toggleTheme();
      }} aria-label="Toggle theme">{themeIcon()}</button><button className="icon-button" type="button" onClick={event => {
        toggleMobileMenu();
      }} aria-label="Open menu" aria-expanded={state.mobileMenuOpen}>☰</button></div></header>;
  const mobileTabs = <nav className="mobile-tabs" aria-label="Primary navigation">{primaryItems.map(item => navigationLink(item, overdueCount))}</nav>;
  return <div className="app">{mobileHeader}<aside>{logoMarkup()}<nav>{items.map(item => navigationLink(item, overdueCount))}</nav><div className="sp" /><button className="ghost" onClick={event => {
        toggleTheme();
      }}>Toggle dark mode</button><button className="ghost" onClick={event => {
        logoutAccount();
      }}>Sign out</button></aside><main>{pageContent}</main>{mobileTabs}{mobileMenuMarkup()}</div>;
}
export const hdr = (title: any, subtitle: any = undefined, headerAction: any = undefined) => <div className="hd"><div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : ''}</div>{headerAction === undefined ? <button className="btn" onClick={event => {
    newInv();
  }}>+ New invoice</button> : headerAction}</div>;
export const renderProviderBadge = providerId => <div className="ib" style={{
  "background": providers[providerId][3]
}}>{providers[providerId][2]}</div>;
