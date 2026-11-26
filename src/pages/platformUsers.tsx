import React from 'react';
import { state } from '../modules/store.ts';
import { hdr } from '../ui/layout.tsx';
import { renderPill } from '../modules/format.tsx';
import { resendUserVerification, setUserSuspended } from '../actions/auth.ts';
export function platformUsers() {
  if (state.authUserRole !== 'owner') return <>{hdr('Users', 'Owner access is required.')}<div className="card"><p className="mut">You do not have permission to manage platform users.</p></div></>;
  const users = state.platformUsers || [];
  const rows = users.length ? users.map(user => <tr key={user.id}><td><b>{user.email}</b></td><td>{user.email_verified_at ? renderPill('Verified', 'Active') : renderPill('Pending', 'Draft')}</td><td>{user.suspended_at ? renderPill('Suspended', 'Draft') : renderPill('Active', 'Active')}</td><td className="r"><button className="btn s sm" onClick={event => {
        resendUserVerification(String(user.id));
      }} disabled={Boolean(user.email_verified_at ? 'disabled' : '')}>Resend verification</button> <button className="btn s sm" onClick={event => {
        setUserSuspended(String(user.id), user.suspended_at ? 'false' : 'true');
      }}>{user.suspended_at ? 'Reactivate' : 'Suspend'}</button></td></tr>) : <tr><td colSpan={4} className="mut">No ordinary users have been created yet.</td></tr>;
  return <>{hdr('Platform users', 'Manage ordinary users in this Kowope workspace.')}<div className="card"><div className="tbw"><table><thead><tr><th>Email</th><th>Verification</th><th>Status</th><th className="r">Actions</th></tr></thead><tbody>{rows}</tbody></table></div></div></>;
}
