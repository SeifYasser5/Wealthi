import { useAccounts } from '../hooks/useAccounts'
import type { AccountBalance } from '../lib/api'

interface Props {
  balances: AccountBalance[]
}

function money(amount: number, _currency: 'EGP' | 'USD'): string {
  return Math.round(amount).toLocaleString()
}

function amountColor(amount: number): string {
  if (amount > 0) return 'text-[#00d54b]'
  if (amount < 0) return 'text-[#ff3b30]'
  return 'text-black'
}

function sumGroup(group: AccountBalance[], currency: 'EGP' | 'USD') {
  return {
    currency,
    openingBalance: group.reduce((s, b) => s + b.openingBalance, 0),
    credits: group.reduce((s, b) => s + b.credits, 0),
    debits: group.reduce((s, b) => s + b.debits, 0),
    transfersIn: group.reduce((s, b) => s + b.transfersIn, 0),
    transfersOut: group.reduce((s, b) => s + b.transfersOut, 0),
    closingBalance: group.reduce((s, b) => s + b.closingBalance, 0),
    discrepancy: group.every((b) => b.discrepancy === null)
      ? null
      : group.reduce((s, b) => s + (b.discrepancy ?? 0), 0),
  }
}

export function BalancesTable({ balances }: Props) {
  const { currency: accountCurrency, label: accountLabel, isLoaded } = useAccounts()
  // Totals group by account currency, so they wait for the account list.
  const egpGroup = balances.filter((b) => accountCurrency(b.account) === 'EGP')
  const usdGroup = balances.filter((b) => accountCurrency(b.account) === 'USD')
  const totals = !isLoaded
    ? []
    : [
        ...(egpGroup.length > 0
          ? [{ label: egpGroup.length > 1 ? 'Total (EGP)' : 'Total', ...sumGroup(egpGroup, 'EGP') }]
          : []),
        ...(usdGroup.length > 0
          ? [{ label: usdGroup.length > 1 ? 'Total (USD)' : 'Total', ...sumGroup(usdGroup, 'USD') }]
          : []),
      ]

  return (
    <div className="overflow-x-auto rounded-2xl border border-black bg-white">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wide text-black">
          <tr>
            <th className="px-4 pt-5 pb-3">Account</th>
            <th className="px-4 pt-5 pb-3 text-right">Opening</th>
            <th className="px-4 pt-5 pb-3 text-right">Credits</th>
            <th className="px-4 pt-5 pb-3 text-right">Debits</th>
            <th className="px-4 pt-5 pb-3 text-right">Transfers In</th>
            <th className="px-4 pt-5 pb-3 text-right">Transfers Out</th>
            <th className="px-4 pt-5 pb-3 text-right">Closing</th>
            <th className="px-4 pt-5 pb-3 text-right">Last Reported</th>
            <th className="px-4 pt-5 pb-3 text-right">Discrepancy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[black]">
          {balances.map((bal) => {
            const currency = accountCurrency(bal.account)
            return (
              <tr key={bal.account} className="transition hover:bg-[#e0ecfc]">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-black">{accountLabel(bal.account)}</td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${amountColor(bal.openingBalance)}`}
                >
                  {money(bal.openingBalance, currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#00d54b]">
                  {money(bal.credits, currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#ff3b30]">
                  {money(bal.debits, currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#00d54b]">
                  {money(bal.transfersIn, currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#ff3b30]">
                  {money(bal.transfersOut, currency)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${amountColor(bal.closingBalance)}`}
                >
                  {money(bal.closingBalance, currency)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${bal.lastReportedBalance === null ? 'text-[#6b6d80]' : amountColor(bal.lastReportedBalance)}`}
                >
                  {bal.lastReportedBalance === null ? '—' : money(bal.lastReportedBalance, currency)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${
                    bal.discrepancy && Math.abs(bal.discrepancy) > 0.005
                      ? 'font-medium text-[#ff9500]'
                      : 'text-[#9a9ba8]'
                  }`}
                >
                  {bal.discrepancy === null ? '—' : money(bal.discrepancy, currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
        {totals.length > 0 && (
          <tbody className="divide-y divide-[#d5e4f7] border-t-2 border-[#d5e4f7] bg-[#e0ecfc]">
            {totals.map((t) => (
              <tr key={t.label} className="font-semibold">
                <td className="whitespace-nowrap px-4 py-3 text-xs uppercase tracking-wide text-black">{t.label}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${amountColor(t.openingBalance)}`}>
                  {money(t.openingBalance, t.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#00d54b]">
                  {money(t.credits, t.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#ff3b30]">
                  {money(t.debits, t.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#00d54b]">
                  {money(t.transfersIn, t.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#ff3b30]">
                  {money(t.transfersOut, t.currency)}
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${amountColor(t.closingBalance)}`}>
                  {money(t.closingBalance, t.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#9a9ba8]">—</td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${
                    t.discrepancy !== null && Math.abs(t.discrepancy) > 0.005
                      ? 'font-medium text-[#ff9500]'
                      : 'text-[#9a9ba8]'
                  }`}
                >
                  {t.discrepancy === null ? '—' : money(t.discrepancy, t.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}
