/**
 * Compatibility declarations for the existing browser action bridge.
 * `app.ts` assigns these functions to `window` so legacy route factories can
 * continue to use the same event handlers while they are moved into TSX.
 * Declarations are erased at build time and have no runtime effect.
 */
type LegacyHandler = (...args: any[]) => any

declare const querySelector: LegacyHandler
declare const today: string
declare const addDays: LegacyHandler
declare const nextOn: LegacyHandler
declare const tbl: LegacyHandler
declare const upd: LegacyHandler
declare const uploadBusinessLogo: LegacyHandler
declare const mrs: LegacyHandler
declare const go: LegacyHandler
declare const render: LegacyHandler
declare const toast: LegacyHandler
declare const toggleTheme: LegacyHandler
declare const setTheme: LegacyHandler
declare const toggleMobileMenu: LegacyHandler
declare const closeMobileMenu: LegacyHandler
declare const handleMobileMenuKeydown: LegacyHandler
declare const newInv: LegacyHandler
declare const editDraft: LegacyHandler
declare const save: LegacyHandler
declare const send: LegacyHandler
declare const markPaid: LegacyHandler
declare const downloadInvoice: LegacyHandler
declare const downloadPreviewPdf: LegacyHandler
declare const uploadInvoiceLogo: LegacyHandler
declare const removeInvoiceLogo: LegacyHandler
declare const dup: LegacyHandler
declare const del: LegacyHandler
declare const savePast: LegacyHandler
declare const wiz: LegacyHandler
declare const manageIntegration: LegacyHandler
declare const insertEmailToken: LegacyHandler
declare const disc: LegacyHandler
declare const savePreferredEmailProvider: LegacyHandler
declare const wnext: LegacyHandler
declare const runRec: LegacyHandler
declare const svNew: LegacyHandler
declare const svNext: LegacyHandler
declare const saveRec: LegacyHandler
declare const saveChg: LegacyHandler
declare const toggleRecurring: LegacyHandler
declare const cancelRecurring: LegacyHandler
declare const addC: LegacyHandler
declare const editClient: LegacyHandler
declare const saveClientEdit: LegacyHandler
declare const recPay: LegacyHandler
declare const saveBiz: LegacyHandler
declare const saveInvoiceNumbering: LegacyHandler
declare const addInvoiceFormatToken: LegacyHandler
declare const addInvoiceFormatTokenAtCursor: LegacyHandler
declare const addCur: LegacyHandler
declare const delCur: LegacyHandler
declare const setDefaultCurrency: LegacyHandler
declare const runManualBackup: LegacyHandler
declare const saveSecuritySettings: LegacyHandler
declare const loginAccount: LegacyHandler
declare const signupAccount: LegacyHandler
declare const resendVerification: LegacyHandler
declare const resendUserVerification: LegacyHandler
declare const setUserSuspended: LegacyHandler
declare const inviteOrganizationMember: LegacyHandler
declare const createOrganization: LegacyHandler
declare const logoutAccount: LegacyHandler
declare const changePassword: LegacyHandler
declare const setSignupAllowed: LegacyHandler
declare const toggleAuthPassword: LegacyHandler
declare const requestPasswordReset: LegacyHandler
declare const resetPassword: LegacyHandler
declare const verifyEmail: LegacyHandler
declare const openGuestInfo: LegacyHandler
declare const closeGuestInfo: LegacyHandler
declare const startGuestInvoice: LegacyHandler
declare const leaveGuestInvoice: LegacyHandler
declare const guestPreview: LegacyHandler
declare const guestDownload: LegacyHandler
declare const readGuestLogo: LegacyHandler
declare const syncGuestEditor: LegacyHandler
declare const updateGuestTotals: LegacyHandler
declare const addGuestItem: LegacyHandler
declare const removeGuestItem: LegacyHandler
declare const promptGuestLogin: LegacyHandler
declare const guestLivePreview: LegacyHandler
declare const toggleGuestBusinessEdit: LegacyHandler
declare const toggleGuestClientEdit: LegacyHandler
declare const removeGuestLogo: LegacyHandler
declare const toggleGuestCurrencyEditor: LegacyHandler
declare const addGuestCurrency: LegacyHandler
declare const $: (selector: string) => any

interface Window {
  render?: LegacyHandler
  __kowopeApiFeedbackInstalled?: boolean
}

interface Document {
  getElementById(elementId: string): any
  querySelector(selectors: string): any
}
