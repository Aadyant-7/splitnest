import { useId, useState, type FormEvent } from 'react';
import { api } from '../../shared/api/client';
import type { Member } from '../../shared/api/types';
import { ErrorNotice } from '../../shared/ui/Feedback';
import { shortDate } from '../../shared/ui/format';

type Props = { groupId: string; members: Member[]; currentUserId: string; isAdmin: boolean; onChanged: () => void };

export function MembersPanel({ groupId, members, currentUserId, isAdmin, onChanged }: Props) {
  const formId = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const adminCount = members.filter((member) => member.role === 'ADMIN').length;

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice('');
    setPending(true);
    try {
      await api(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      setEmail('');
      setNotice('Member added. Future expenses include the updated group.');
      onChanged();
    } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.displayName} from this group? Their past expenses and shares are kept.`)) return;
    setError(null);
    setNotice('');
    setPending(true);
    try {
      await api(`/groups/${groupId}/members/${member.userId}`, { method: 'DELETE' });
      setNotice('Member removed. Their historical financial records are preserved.');
      onChanged();
    } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }

  return (
    <section className="panel stack" aria-labelledby="members-heading">
      <div className="section-heading"><div><p className="eyebrow">YOUR PEOPLE</p><h2 id="members-heading">Group members</h2></div><span className="tag">{members.length} current</span></div>
      <p className="muted">New expenses include current members. Joining or leaving never changes earlier shares.</p>
      <ErrorNotice error={error} />
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="table-wrap"><table className="table">
        <caption className="muted">Admins can add or remove members; at least one admin must remain.</caption>
        <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Joined</th>{isAdmin && <th scope="col">Actions</th>}</tr></thead>
        <tbody>{members.map((member) => {
          const lastAdmin = member.role === 'ADMIN' && adminCount === 1;
          return <tr key={member.userId}>
            <th scope="row"><div>{member.displayName}{member.userId === currentUserId && ' (you)'}</div><span className="muted">{member.email}</span></th>
            <td><span className="tag">{member.role === 'ADMIN' ? 'Admin' : 'Member'}</span></td><td>{shortDate(member.joinedAt)}</td>
            {isAdmin && <td>{lastAdmin ? <span className="muted">Last admin</span> : <button className="button danger" type="button" disabled={pending} aria-label={`Remove ${member.displayName}`} onClick={() => void removeMember(member)}>Remove</button>}</td>}
          </tr>;
        })}</tbody>
      </table></div>
      {isAdmin ? <form className="stack" onSubmit={addMember}>
        <div><h3>Add someone to the group</h3><p className="muted">They need an existing account. Membership is immediate; no invitation email is sent.</p></div>
        <label className="field" htmlFor={`${formId}-email`}>Member email<input id={`${formId}-email`} type="email" autoComplete="email" required maxLength={320} placeholder="friend@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <div><button className="button primary" type="submit" disabled={pending}>{pending ? 'Updating members…' : 'Add member'}</button></div>
      </form> : <p className="notice">An admin can add or remove members for this group.</p>}
    </section>
  );
}
