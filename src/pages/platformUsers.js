import { state } from '../modules/store.js'
import { hdr } from '../ui/layout.js'
import { renderPill } from '../modules/format.js'

export function platformUsers() {
  if (state.authUserRole !== 'owner') return hdr('Users', 'Owner access is required.') + '<div class="card"><p class="mut">You do not have permission to manage platform users.</p></div>'
  const users = state.platformUsers || []
  const rows = users.length ? users.map(user => `<tr><td><b>${user.email}</b></td><td>${user.email_verified_at ? renderPill('Verified', 'Active') : renderPill('Pending', 'Draft')}</td><td>${user.suspended_at ? renderPill('Suspended', 'Draft') : renderPill('Active', 'Active')}</td><td class="r"><button class="btn s sm" onclick="resendUserVerification('${user.id}')" ${user.email_verified_at ? 'disabled' : ''}>Resend verification</button> <button class="btn s sm" onclick="setUserSuspended('${user.id}', ${user.suspended_at ? 'false' : 'true'})">${user.suspended_at ? 'Reactivate' : 'Suspend'}</button></td></tr>`).join('') : '<tr><td colspan="4" class="mut">No ordinary users have been created yet.</td></tr>'
  return hdr('Platform users', 'Manage ordinary users in this Kowope workspace.') + `<div class="card"><div class="tbw"><table><thead><tr><th>Email</th><th>Verification</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}
