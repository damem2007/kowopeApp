import React from 'react';
import { state } from '../modules/store.ts';
import { hdr } from '../ui/layout.tsx';
export function organization() {
  const membershipRole = state.organization?.membership_role;
  if (state.authUserRole !== 'owner' && membershipRole !== 'owner') return <>{hdr('Organization', 'An optional shared workspace for collaboration.')}<div className="card" style={{
      "padding": "20px"
    }}><h2>Your personal workspace</h2><p className="mut">Organizations are optional shared workspaces for collaboration. Your personal invoices, clients, business details, payments, and settings remain private.</p><button className="btn" onClick={event => {
        state.activeModal = 'organization';
        render();
      }}>+ Create organization</button></div></>;
  const members = state.organization?.members || [];
  return <>{hdr('Organization', 'Manage the people who can work in this shared workspace.')}<><div className="card"><h2>{state.organization?.organization?.name || 'Organization'}</h2><p className="mut">Invite users who already have a verified Kowope account.</p><div className="row" style={{
          "gap": "10px",
          "marginTop": "16px"
        }}><input id="organization-member-email" type="email" placeholder="user@example.com" /><button className="btn" onClick={event => {
            inviteOrganizationMember();
          }}>Add member</button></div></div><div className="card"><h2>Members</h2><div className="tbw"><table><thead><tr><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>{members.length ? members.map(member => <tr key={member.user_id || member.email}><td>{member.email}</td><td>{member.membership_role === 'owner' ? 'Owner' : 'Member'}</td><td>{member.created_at || '—'}</td></tr>) : <tr><td colSpan={3} className="mut">No members yet.</td></tr>}</tbody></table></div></div></></>;
}
