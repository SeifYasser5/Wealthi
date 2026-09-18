import { amountColor, isBalanced, money, type RowValues } from '../../../utils/utils'

const CELL = 'whitespace-nowrap px-4 py-3'
const NUM = `${CELL} text-right tabular-nums`
const GREEN = 'text-positive'
const RED = 'text-negative'
const MUTED = 'text-muted'

/**
 * One row of the table. Account rows and the currency totals below them carry
 * the same nine columns, so `variant` covers the only differences: the label
 * styling and where the bold sits.
 */
export function BalanceRow({
  label,
  values,
  variant,
}: {
  label: string
  values: RowValues
  variant: 'account' | 'total'
}) {
  const isTotal = variant === 'total'
  const { openingBalance, closingBalance, lastReportedBalance, discrepancy } = values

  return (
    <tr className={isTotal ? 'font-semibold' : 'transition hover:bg-primary-soft'}>
      <td
        className={`${CELL} ${isTotal ? 'text-xs uppercase tracking-wide text-foreground' : 'font-medium text-foreground'}`}
      >
        {label}
      </td>
      <td className={`${NUM} ${amountColor(openingBalance)}`}>{money(openingBalance)}</td>
      <td className={`${NUM} ${GREEN}`}>{money(values.credits)}</td>
      <td className={`${NUM} ${RED}`}>{money(values.debits)}</td>
      <td className={`${NUM} ${GREEN}`}>{money(values.transfersIn)}</td>
      <td className={`${NUM} ${RED}`}>{money(values.transfersOut)}</td>
      <td className={`${NUM} ${isTotal ? '' : 'font-semibold'} ${amountColor(closingBalance)}`}>
        {money(closingBalance)}
      </td>
      <td className={`${NUM} ${lastReportedBalance === null ? MUTED : amountColor(lastReportedBalance)}`}>
        {lastReportedBalance === null ? '—' : money(lastReportedBalance)}
      </td>
      <td className={`${NUM} ${discrepancy !== null && !isBalanced(discrepancy) ? 'font-medium text-warning' : MUTED}`}>
        {discrepancy === null ? '—' : money(discrepancy)}
      </td>
    </tr>
  )
}
