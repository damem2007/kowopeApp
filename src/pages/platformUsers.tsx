import React from 'react';
import { state } from '../modules/store.ts';
import { hdr } from '../ui/layout.tsx';
import { renderPill } from '../modules/format.tsx';
import { Pagination, paginate } from '../components/Pagination.tsx';
import { render } from '../ui/render.tsx';
import { resendUserVerification, setUserSuspended } from '../actions/auth.ts';
export function platformUsers() {
  if (state.authUserRole !== 'owner') return <>{hdr('Users', 'Owner access is required.')}<div className="card"><p className="mut">You do not have permission to manage platform users.</p></div></>;
  const users = state.platformUsers || [];
  const emailQuery = String(state.platformUsersEmailFilter || '').trim().toLowerCase();
  const statusFilter = state.platformUsersStatusFilter || '';
  const filteredUsers = users.filter(user => (!emailQuery || String(user.email || '').toLowerCase().includes(emailQuery)) && (!statusFilter || (statusFilter === 'active' ? !user.suspended_at : statusFilter === 'suspended' ? Boolean(user.suspended_at) : statusFilter === 'verified' ? Boolean(user.email_verified_at) : !user.email_verified_at)));
  const userPagination = paginate(filteredUsers, 'platformUsers');
  const rows = filteredUsers.length ? userPagination.rows.map(user => <tr key={user.id}>
  <td><b>{user.email}</b></td>
  <td>{user.email_verified_at ? renderPill('Verified', 'Active') : renderPill('Pending', 'Draft')}</td>
  <td>{user.suspended_at ? renderPill('Suspended', 'Draft') : renderPill('Active', 'Active')}</td>
  <td className="r">
    <button className="btn s sm" onClick={event => {
        resendUserVerification(String(user.id));
      }} disabled={Boolean(user.email_verified_at ? 'disabled' : '')}>Resend verification</button> 
    <button className="btn s sm" onClick={event => {
        setUserSuspended(String(user.id), user.suspended_at ? 'false' : 'true');
      }}>{user.suspended_at ? 'Reactivate' : 'Suspend'}</button>
  </td></tr>) : <tr><td colSpan={4} className="mut">No ordinary users have been created yet.</td></tr>;
  return <>{hdr('Platform users', 'Manage ordinary users in this Kowope workspace.')}
  <section className="card user-filters">
    <div><label htmlFor="users-email-filter">Email</label>
    <input id="users-email-filter" type="search" placeholder="Search by email" value={state.platformUsersEmailFilter || ''} onChange={event => { state.platformUsersEmailFilter = event.currentTarget.value; state.platformUsersPage = 1; render(); }} />
    </div>
    <div><label htmlFor="users-status-filter">Status</label>
      <select id="users-status-filter" value={statusFilter} onChange={event => { state.platformUsersStatusFilter = event.currentTarget.value; state.platformUsersPage = 1; render(); }}>
        <option value="">All statuses</option><option value="active">Active</option>
        <option value="suspended">Suspended</option><option value="verified">Verified</option>
        <option value="pending">Pending verification</option>
      </select>
    </div>
  </section>
  <div className="card">
    <div className="tbw">
      <table><thead><tr><th>Email</th><th>Verification</th><th>Status</th><th className="r">Actions</th></tr></thead>
      <tbody>{rows}</tbody></table>
      <div className="clients-table-footer">
        <span className="mut">Showing {userPagination.rows.length} of {filteredUsers.length} users</span>
        <Pagination paginationKey="platformUsers" {...userPagination} />
      </div>
    </div>
  </div></>;
}
