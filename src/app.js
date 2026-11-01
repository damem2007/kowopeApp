import { state } from './modules/store.js'
import { today, addDays } from './modules/date.js'
import { $ } from './modules/selectors.js'
import { nextOn } from './modules/recurrence.js'
import { bootLedgerly } from './modules/bootstrap.js'
import { go, render } from './ui/render.js'
import { tbl } from './pages/invoices.js'
import { upd } from './pages/editor.js'
import { newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, dup, del, savePast } from './actions/invoices.js'
import { wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext } from './actions/integrations.js'
import { runRec, svNew, svNext, saveRec, saveChg, toggleRecurring, mrs } from './actions/recurring.js'
import { addC, editClient, saveClientEdit } from './actions/clients.js'
import { recPay } from './actions/payments.js'
import { saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup } from './actions/settings.js'
import { loginAccount, signupAccount, logoutAccount, changePassword, setSignupAllowed } from './actions/auth.js'

let started = false

export function startApp() {
  if (started) return
  started = true

// Inline onclick/onchange handlers in the rendered markup resolve names on window.
Object.assign(window, {
  state, $, today, addDays, nextOn, tbl, upd, mrs,
  go, render, newInv, editDraft, save, send, markPaid, downloadInvoice, downloadPreviewPdf, dup, del, savePast,
  wiz, manageIntegration, insertEmailToken, disc, savePreferredEmailProvider, wnext,
  runRec, svNew, svNext, saveRec, saveChg, toggleRecurring,
  addC, editClient, saveClientEdit,
  recPay,
  saveBiz, saveInvoiceNumbering, addInvoiceFormatToken, addInvoiceFormatTokenAtCursor, addCur, delCur, setDefaultCurrency, runManualBackup,
  loginAccount, signupAccount, logoutAccount, changePassword, setSignupAllowed,
})

bootLedgerly()
}

startApp()
