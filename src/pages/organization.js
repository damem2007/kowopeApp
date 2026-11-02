import { state } from '../modules/store.js'
import { hdr } from '../ui/layout.js'

export function organization() {
  const membershipRole = state.organization?.membership_role
  if (state.authUserRole !== 'owner' && membershipRole !== 'owner') return hdr('Organization', 'An optional shared workspace for collaboration.') + `<div class="card" style="padding:20px"><h2>Your personal workspace</h2><p class="mut">Organizations are optional shared workspaces for collaboration. Your personal invoices, clients, business details, payments, and settings remain private.</p><button class="btn" onclick="state.activeModal='organization';render()">+ Create organization</button></div>`
  const members = state.organization?.members || []
  return hdr('Organization', 'Manage the people who can work in this shared workspace.') + `<div class="card"><h2>${state.organization?.organization?.name || 'Organization'}</h2><p class="mut">Invite users who already have a verified Kowope account.</p><div class="row" style="gap:10px;margin-top:16px"><input id="organization-member-email" type="email" placeholder="user@example.com"><button class="btn" onclick="inviteOrganizationMember()">Add member</button></div></div><div class="card"><h2>Members</h2><div class="tbw"><table><thead><tr><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>${members.length ? members.map(member => `<tr><td>${member.email}</td><td>${member.membership_role === 'owner' ? 'Owner' : 'Member'}</td><td>${member.created_at || '—'}</td></tr>`).join('') : '<tr><td colspan="3" class="mut">No members yet.</td></tr>'}</tbody></table></div></div>`
}
