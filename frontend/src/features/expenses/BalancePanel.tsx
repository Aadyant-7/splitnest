import type { Balance } from '../../shared/api/types';
import { EmptyState } from '../../shared/ui/Feedback';
import { money, moneySign } from '../../shared/ui/format';

export function BalancePanel({ balances, currentUserId }: { balances: Balance[]; currentUserId: string }) {
  return (
    <section className="panel stack" aria-labelledby="balances-heading">
      <div className="section-heading">
        <div><p className="eyebrow">THE BIG PICTURE</p><h2 id="balances-heading">Group balances</h2></div>
        <span className="tag">INR</span>
      </div>
      <p className="muted">Positive means a member is owed; negative means they owe. Former members keep their historical balance.</p>
      {balances.length === 0 ? <EmptyState title="No balances yet">Add your first expense to start sharing.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="muted">Paid minus share gives each member’s net balance.</caption>
            <thead><tr><th scope="col">Member</th><th scope="col">Total paid</th><th scope="col">Total share</th><th scope="col">Net balance</th></tr></thead>
            <tbody>{balances.map((balance) => (
              <tr key={balance.userId}>
                <th scope="row">{balance.displayName}{balance.userId === currentUserId && ' (you)'} {!balance.currentMember && <span className="tag">Former member</span>}</th>
                <td>{money(balance.totalPaid)}</td><td>{money(balance.totalShare)}</td>
                <td className={moneySign(balance.netBalance) > 0 ? 'balance-positive' : moneySign(balance.netBalance) < 0 ? 'balance-negative' : 'muted'}>
                  <strong>{money(balance.netBalance)}</strong><span className="muted"> {moneySign(balance.netBalance) > 0 ? 'is owed' : moneySign(balance.netBalance) < 0 ? 'owes' : 'even'}</span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
