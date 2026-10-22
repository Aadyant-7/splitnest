import type { Balance } from '../../shared/api/types';
import { EmptyState } from '../../shared/ui/Feedback';
import { money, moneySign } from '../../shared/ui/format';

export function BalancePanel({ balances, currentUserId }: { balances: Balance[]; currentUserId: string }) {
  return (
    <section className="panel stack" aria-labelledby="balances-heading">
      <div className="section-heading">
        <h2 id="balances-heading">Group balances</h2>
      </div>
      <p className="muted">Balance = amount paid − share of expenses. Past shares remain after someone leaves.</p>
      {balances.length === 0 ? <EmptyState title="No balances yet">Add your first expense to start sharing.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Member balances in Indian rupees. Positive means owed to the member; negative means the member owes.</caption>
            <thead><tr><th scope="col">Member</th><th className="numeric-cell" scope="col">Total paid</th><th className="numeric-cell" scope="col">Total share</th><th className="numeric-cell" scope="col">Net balance</th></tr></thead>
            <tbody>{balances.map((balance) => (
              <tr key={balance.userId}>
                <th scope="row">{balance.displayName}{balance.userId === currentUserId && ' (you)'} {!balance.currentMember && <span className="tag">Former member</span>}</th>
                <td className="numeric-cell">{money(balance.totalPaid)}</td><td className="numeric-cell">{money(balance.totalShare)}</td>
                <td className={`numeric-cell ${moneySign(balance.netBalance) > 0 ? 'balance-positive' : moneySign(balance.netBalance) < 0 ? 'balance-negative' : 'muted'}`}>
                  <strong>{money(balance.netBalance)}</strong><span className="muted cell-secondary">{moneySign(balance.netBalance) > 0 ? 'is owed' : moneySign(balance.netBalance) < 0 ? 'owes' : 'even'}</span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
