import { useAccounts } from '../hooks/useAccounts'
import { sumGroup } from '../utils/utils'
import { BalanceRow } from './BalanceRow'
import type { AccountBalance } from '@wealthi/shared'

interface Props {
  balances: AccountBalance[]
}

const COLUMNS = ['Account', 'Opening', 'Credits', 'Debits', 'Transfers In', 'Transfers Out', 'Closing', 'Last Reported', 'Discrepancy'] // prettier-ignore

export function BalancesTable({ balances }: Props) {
  const { currency: accountCurrency, label: accountLabel, isLoaded } = useAccounts()

  // Totals group by account currency, so they wait for the account list.
  const totals = !isLoaded
    ? []
    : (['EGP', 'USD'] as const).flatMap((currency) => {
        const group = balances.filter((bal) => accountCurrency(bal.account) === currency)
        if (group.length === 0) return []
        // A lone account in a currency is already its own total, so drop the tag.
        return [{ label: group.length > 1 ? `Total (${currency})` : 'Total', values: sumGroup(group) }]
      })

  return (
    <div className="overflow-x-auto rounded-2xl border border-black bg-white">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wide text-black">
          <tr>
            {COLUMNS.map((column, i) => (
              <th key={column} className={`px-4 pt-5 pb-3 ${i === 0 ? '' : 'text-right'}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[black]">
          {balances.map((bal) => (
            <BalanceRow key={bal.account} label={accountLabel(bal.account)} values={bal} variant="account" />
          ))}
        </tbody>
        {totals.length > 0 && (
          <tbody className="divide-y divide-[#d5e4f7] border-t-2 border-[#d5e4f7] bg-[#e0ecfc]">
            {totals.map((total) => (
              <BalanceRow key={total.label} label={total.label} values={total.values} variant="total" />
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}
