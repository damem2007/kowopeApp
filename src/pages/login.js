import { state } from '../modules/store.js'

export function login() {
  const signupMode = state.authMode === 'signup'
  return `<div class="auth-page"><div class="card auth-card"><div class="logo"><i>▣</i>Kowope</div><h1>${signupMode ? 'Create user account' : 'Sign in'}</h1><p class="mut">${signupMode ? 'Create an account for this Kowope workspace.' : 'Sign in to access your workspace.'}</p><label class="fl">Email</label><input id="auth-email" type="email" autocomplete="email" placeholder="Your email"><label class="fl">Password</label><input id="auth-password" type="password" autocomplete="new-password" placeholder="At least 12 characters"><div id="auth-error" class="err"></div><button class="btn" style="width:100%;margin-top:18px" onclick="${signupMode ? 'signupAccount()' : 'loginAccount()'}">${signupMode ? 'Create account' : 'Sign in'}</button>${state.allowSignup ? `<button class="btn s" style="width:100%;margin-top:10px" onclick="state.authMode='${signupMode ? 'login' : 'signup'}';render()">${signupMode ? 'Back to sign in' : 'Create user account'}</button>` : ''}</div></div>`
}
